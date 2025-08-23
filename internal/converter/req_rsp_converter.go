package converter

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/logger"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// contentToString 安全地将content转换为字符串
func contentToString(content interface{}) string {
	if content == nil {
		return ""
	}
	
	switch c := content.(type) {
	case string:
		return c
	case []interface{}:
		// 处理数组格式，提取所有text字段
		var textParts []string
		for _, item := range c {
			if itemMap, ok := item.(map[string]interface{}); ok {
				if itemType, exists := itemMap["type"]; exists && itemType == "text" {
					if text, exists := itemMap["text"]; exists {
						if textStr, ok := text.(string); ok {
							textParts = append(textParts, textStr)
						}
					}
				}
			}
		}
		return strings.Join(textParts, "")
	default:
		// 其他类型尝试JSON序列化
		if bytes, err := json.Marshal(content); err == nil {
			return string(bytes)
		}
		return fmt.Sprintf("%v", content)
	}
}

// RequestFormat API请求格式类型
type RequestFormat string

const (
	FormatOpenAI    RequestFormat = "openai"
	FormatAnthropic RequestFormat = "anthropic"
	FormatUnknown   RequestFormat = "unknown"
)

// RequestResponseConverter 请求响应转换器
type RequestResponseConverter struct {
	streamConverter *StreamEventConverter
}

// NewRequestResponseConverter 创建新的转换器
func NewRequestResponseConverter() *RequestResponseConverter {
	return &RequestResponseConverter{
		streamConverter: NewStreamEventConverter(),
	}
}

// NewTransformer 创建新的转换器（向后兼容）
func NewTransformer() *RequestResponseConverter {
	return NewRequestResponseConverter()
}

// DetectFormat 检测请求格式 - 基于请求结构而非模型名称
func (c *RequestResponseConverter) DetectFormat(requestBody []byte) RequestFormat {
	return c.DetectFormatWithEndpoint(requestBody, "")
}

// DetectFormatWithEndpoint 基于请求结构和端点检测格式
func (c *RequestResponseConverter) DetectFormatWithEndpoint(requestBody []byte, endpoint string) RequestFormat {
	var data map[string]interface{}
	if err := json.Unmarshal(requestBody, &data); err != nil {
		return FormatUnknown
	}

	// 基于端点路径判断（优先级最高）
	if endpoint == "/v1/messages" {
		// Anthropic的原生端点
		return FormatAnthropic
	}
	if endpoint == "/v1/chat/completions" {
		// OpenAI的标准端点
		return FormatOpenAI
	}

	// 检查Anthropic特有字段
	if _, hasSystem := data["system"]; hasSystem {
		// system字段是Anthropic格式的特征
		return FormatAnthropic
	}

	// 检查模型名称来识别格式
	if model, hasModel := data["model"].(string); hasModel {
		modelLower := strings.ToLower(model)
		if strings.Contains(modelLower, "claude") {
			return FormatAnthropic
		}
		if strings.Contains(modelLower, "gpt") {
			return FormatOpenAI
		}
	}

	// 检查是否有messages字段（两种格式都支持）
	if _, hasMessages := data["messages"]; hasMessages {
		// 默认认为是OpenAI格式，除非有其他Anthropic特征
		return FormatOpenAI
	}

	// 检查是否有旧版本的prompt字段（OpenAI遗留格式）
	if _, hasPrompt := data["prompt"]; hasPrompt {
		return FormatOpenAI
	}

	return FormatUnknown
}

// TransformRequest 转换请求到统一格式
func (c *RequestResponseConverter) TransformRequest(requestBody []byte, format RequestFormat) (*types.ProxyRequest, error) {
	switch format {
	case FormatOpenAI:
		return c.parseOpenAIRequest(requestBody)
	case FormatAnthropic:
		return c.parseAnthropicRequest(requestBody)
	default:
		return nil, fmt.Errorf("不支持的请求格式: %s", format)
	}
}

// TransformResponse 转换响应到客户端格式
func (c *RequestResponseConverter) TransformResponse(response *types.ProxyResponse, targetFormat RequestFormat) ([]byte, error) {
	switch targetFormat {
	case FormatOpenAI:
		return c.buildOpenAIResponse(response)
	case FormatAnthropic:
		return c.buildAnthropicResponse(response)
	default:
		return nil, fmt.Errorf("不支持的响应格式: %s", targetFormat)
	}
}

// parseOpenAIRequest 解析OpenAI格式请求
func (c *RequestResponseConverter) parseOpenAIRequest(requestBody []byte) (*types.ProxyRequest, error) {
	var openaiReq types.OpenAIRequest

	if err := json.Unmarshal(requestBody, &openaiReq); err != nil {
		return nil, fmt.Errorf("解析OpenAI请求失败: %w", err)
	}

	return &types.ProxyRequest{
		Model:          openaiReq.Model,
		Messages:       openaiReq.Messages,
		MaxTokens:      openaiReq.MaxTokens,
		Temperature:    openaiReq.Temperature,
		Stream:         openaiReq.Stream,
		TopP:           openaiReq.TopP,
		Tools:          openaiReq.Tools,
		ToolChoice:     openaiReq.ToolChoice,
		OriginalFormat: string(FormatOpenAI),
	}, nil
}

// parseAnthropicRequest 解析Anthropic格式请求
func (c *RequestResponseConverter) parseAnthropicRequest(requestBody []byte) (*types.ProxyRequest, error) {
	logger.Debug("parseAnthropicRequest: %s", string(requestBody))
	var anthropicReq types.AnthropicRequest

	if err := json.Unmarshal(requestBody, &anthropicReq); err != nil {
		return nil, fmt.Errorf("解析Anthropic请求失败: %w", err)
	}

	// 转换FlexibleMessage到标准Message格式
	var standardMessages []types.Message

	// 处理system字段，如果存在的话
	var originalSystemField *types.SystemField
	if anthropicReq.System != nil {
		// 保存原始SystemField
		originalSystemField = anthropicReq.System
		systemContent := anthropicReq.System.ToString()
		if systemContent != "" {
			// 将system消息添加到messages开头
			systemMsg := types.Message{
				Role:    "system",
				Content: systemContent,
			}
			standardMessages = append(standardMessages, systemMsg)
		}
	}

	// 保存原始metadata
	var originalMetadata map[string]interface{}
	if anthropicReq.Metadata != nil {
		originalMetadata = anthropicReq.Metadata
	}

	for _, msg := range anthropicReq.Messages {
		standardMsg := types.Message{
			Role: msg.Role,
		}

		// 保持原始content格式
		standardMsg.Content = msg.Content

		standardMessages = append(standardMessages, standardMsg)
	}

	return &types.ProxyRequest{
		Model:            anthropicReq.Model,
		Messages:         standardMessages,
		MaxTokens:        anthropicReq.MaxTokens,
		Temperature:      anthropicReq.Temperature,
		Stream:           anthropicReq.Stream,
		Tools:            anthropicReq.Tools,
		ToolChoice:       anthropicReq.ToolChoice,
		OriginalFormat:   string(FormatAnthropic),
		OriginalSystem:   originalSystemField,
		OriginalMetadata: originalMetadata,
	}, nil
}

// buildOpenAIResponse 构建OpenAI格式响应
func (c *RequestResponseConverter) buildOpenAIResponse(response *types.ProxyResponse) ([]byte, error) {
	return json.Marshal(response)
}

// buildAnthropicResponse 构建Anthropic格式响应
func (c *RequestResponseConverter) buildAnthropicResponse(response *types.ProxyResponse) ([]byte, error) {
	// 构建Anthropic响应结构体
	anthropicResp := types.AnthropicResponse{
		ID:    response.ID,
		Type:  "message",
		Role:  "assistant",
		Model: response.Model,
		Content: []types.AnthropicContentBlock{
			{
				Type: "text",
				Text: "", // 从choices中提取
			},
		},
		StopReason:   "end_turn",
		StopSequence: nil,
		Usage: types.AnthropicUsage{
			InputTokens:  response.Usage.PromptTokens,
			OutputTokens: response.Usage.CompletionTokens,
		},
	}

	// 提取消息内容和结束原因
	if len(response.Choices) > 0 {
		anthropicResp.Content = []types.AnthropicContentBlock{
			{
				Type: "text",
				Text: contentToString(response.Choices[0].Message.Content),
			},
		}

		// 转换结束原因
		switch response.Choices[0].FinishReason {
		case "stop":
			anthropicResp.StopReason = "end_turn"
		case "length":
			anthropicResp.StopReason = "max_tokens"
		default:
			anthropicResp.StopReason = "end_turn"
		}
	}

	return json.Marshal(anthropicResp)
}

// parseAnthropicResponse 解析Anthropic API响应为内部格式
func (c *RequestResponseConverter) parseAnthropicResponse(responseBody []byte) (*types.ProxyResponse, error) {
	var anthropicResp types.AnthropicResponse

	if err := json.Unmarshal(responseBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("failed to parse Anthropic response: %w", err)
	}

	// 转换为统一的ProxyResponse格式
	var content string
	if len(anthropicResp.Content) > 0 {
		content = anthropicResp.Content[0].Text
	}

	// 转换结束原因
	var finishReason string
	switch anthropicResp.StopReason {
	case "end_turn":
		finishReason = "stop"
	case "max_tokens":
		finishReason = "length"
	case "stop_sequence":
		finishReason = "stop"
	case "tool_use":
		finishReason = "tool_calls"
	default:
		finishReason = "stop"
	}

	proxyResp := &types.ProxyResponse{
		ID:      anthropicResp.ID,
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   anthropicResp.Model,
		Choices: []types.ResponseChoice{
			{
				Index: 0,
				Message: types.Message{
					Role:    "assistant",
					Content: content,
				},
				FinishReason: finishReason,
			},
		},
		Usage: types.ResponseUsage{
			PromptTokens:     anthropicResp.Usage.InputTokens,
			CompletionTokens: anthropicResp.Usage.OutputTokens,
			TotalTokens:      anthropicResp.Usage.InputTokens + anthropicResp.Usage.OutputTokens,
		},
	}

	return proxyResp, nil
}

// parseOpenAIResponse 解析OpenAI API响应为内部格式
func (c *RequestResponseConverter) parseOpenAIResponse(responseBody []byte) (*types.ProxyResponse, error) {
	var proxyResp types.ProxyResponse
	if err := json.Unmarshal(responseBody, &proxyResp); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}
	return &proxyResp, nil
}

// BuildAnthropicRequest 构建Anthropic格式请求
func (c *RequestResponseConverter) BuildAnthropicRequest(request *types.ProxyRequest) ([]byte, error) {
	var systemPrompt string
	var messages []types.FlexibleMessage

	// 分离系统消息和普通消息
	for _, msg := range request.Messages {
		if msg.Role == "system" {
			msgContent := contentToString(msg.Content)
			if systemPrompt != "" {
				systemPrompt += "\n\n" + msgContent
			} else {
				systemPrompt = msgContent
			}
		} else {
			// 转换为 FlexibleMessage
			messages = append(messages, types.FlexibleMessage{
				Role:    msg.Role,
				Content: msg.Content,
			})
		}
	}

	anthropicReq := types.AnthropicRequest{
		Model:       request.Model,
		Messages:    messages, // 不包含system消息
		MaxTokens:   request.MaxTokens,
		Temperature: request.Temperature,
		Stream:      request.Stream,
		Tools:       request.Tools,
		ToolChoice:  request.ToolChoice,
	}

	// 优先使用原始SystemField，如果不存在则创建新的
	if request.OriginalSystem != nil {
		anthropicReq.System = request.OriginalSystem
	} else if systemPrompt != "" {
		systemField := &types.SystemField{}
		// 转义双引号并创建JSON格式的字符串
		jsonStr := `"` + strings.ReplaceAll(systemPrompt, `"`, `\"`) + `"`
		systemField.UnmarshalJSON([]byte(jsonStr))
		anthropicReq.System = systemField
	}

	// 设置原始metadata
	if request.OriginalMetadata != nil {
		anthropicReq.Metadata = request.OriginalMetadata
	}

	return json.Marshal(anthropicReq)
}

// BuildOpenAIRequest 构建OpenAI格式请求
func (c *RequestResponseConverter) BuildOpenAIRequest(request *types.ProxyRequest) ([]byte, error) {
	openaiReq := types.OpenAIRequest{
		Model:       request.Model,
		Messages:    request.Messages,
		MaxTokens:   request.MaxTokens,
		Temperature: request.Temperature,
		Stream:      request.Stream,
		TopP:        request.TopP,
		Tools:       request.Tools,
		ToolChoice:  request.ToolChoice,
	}

	return json.Marshal(openaiReq)
}

// InjectSystemPrompt 注入系统提示词
func (c *RequestResponseConverter) InjectSystemPrompt(request *types.ProxyRequest, provider types.Provider, upstreamType types.UpstreamType) {
	// 对Anthropic账号注入Claude Code系统提示词 - 与Rust实现保持一致
	if provider == types.ProviderAnthropic {
		claudeCodeIdentity := "You are Claude Code, Anthropic's official CLI for Claude."

		// 检查是否已包含Claude Code身份
		hasClaudeCodeIdentity := false
		for _, msg := range request.Messages {
			if msg.Role == "system" {
				msgContent := contentToString(msg.Content)
				if strings.Contains(msgContent, "You are Claude Code") || strings.Contains(msgContent, "Claude Code") {
					hasClaudeCodeIdentity = true
					break
				}
			}
		}

		// 只有在不存在Claude Code身份时才注入
		if !hasClaudeCodeIdentity {
			// 检查是否已有system消息
			hasSystem := false
			for i, msg := range request.Messages {
				if msg.Role == "system" {
					// 在现有系统消息前添加Claude Code身份
					msgContent := contentToString(msg.Content)
					request.Messages[i].Content = claudeCodeIdentity + "\n\n" + msgContent
					hasSystem = true
					break
				}
			}

			// 如果没有system消息，添加一个
			if !hasSystem {
				systemMsg := types.Message{
					Role:    "system",
					Content: claudeCodeIdentity,
				}
				request.Messages = append([]types.Message{systemMsg}, request.Messages...)
			}
		}
	}
}
