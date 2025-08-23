package converter

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

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
		OriginalFormat: string(FormatOpenAI),
	}, nil
}

// parseAnthropicRequest 解析Anthropic格式请求
func (c *RequestResponseConverter) parseAnthropicRequest(requestBody []byte) (*types.ProxyRequest, error) {
	var anthropicReq types.AnthropicRequest

	if err := json.Unmarshal(requestBody, &anthropicReq); err != nil {
		return nil, fmt.Errorf("解析Anthropic请求失败: %w", err)
	}

	// 转换FlexibleMessage到标准Message格式
	var standardMessages []types.Message
	for _, msg := range anthropicReq.Messages {
		standardMsg := types.Message{
			Role: msg.Role,
		}

		// 处理content字段 - 支持string或array格式
		switch content := msg.Content.(type) {
		case string:
			standardMsg.Content = content
		case []interface{}:
			// 处理数组格式的content
			var textContent string
			for _, item := range content {
				if itemMap, ok := item.(map[string]interface{}); ok {
					if itemType, exists := itemMap["type"]; exists && itemType == "text" {
						if text, exists := itemMap["text"]; exists {
							if textStr, ok := text.(string); ok {
								textContent += textStr
							}
						}
					}
				}
			}
			standardMsg.Content = textContent
		default:
			// 尝试将其他类型转换为JSON字符串
			if contentBytes, err := json.Marshal(content); err == nil {
				standardMsg.Content = string(contentBytes)
			} else {
				standardMsg.Content = fmt.Sprintf("%v", content)
			}
		}

		standardMessages = append(standardMessages, standardMsg)
	}

	return &types.ProxyRequest{
		Model:          anthropicReq.Model,
		Messages:       standardMessages,
		MaxTokens:      anthropicReq.MaxTokens,
		Temperature:    anthropicReq.Temperature,
		Stream:         anthropicReq.Stream,
		OriginalFormat: string(FormatAnthropic),
	}, nil
}

// buildOpenAIResponse 构建OpenAI格式响应
func (c *RequestResponseConverter) buildOpenAIResponse(response *types.ProxyResponse) ([]byte, error) {
	return json.Marshal(response)
}

// buildAnthropicResponse 构建Anthropic格式响应
func (c *RequestResponseConverter) buildAnthropicResponse(response *types.ProxyResponse) ([]byte, error) {
	// 构建真正的Anthropic响应格式
	anthropicResp := map[string]interface{}{
		"id":    response.ID,
		"type":  "message",
		"role":  "assistant",
		"model": response.Model,
		"content": []map[string]interface{}{
			{
				"type": "text",
				"text": "", // 从choices中提取
			},
		},
		"stop_reason":   "end_turn",
		"stop_sequence": nil,
		"usage": map[string]interface{}{
			"input_tokens":  response.Usage.PromptTokens,
			"output_tokens": response.Usage.CompletionTokens,
		},
	}

	// 提取消息内容
	if len(response.Choices) > 0 && response.Choices[0].Message.Content != "" {
		anthropicResp["content"] = []map[string]interface{}{
			{
				"type": "text",
				"text": response.Choices[0].Message.Content,
			},
		}

		// 转换结束原因
		switch response.Choices[0].FinishReason {
		case "stop":
			anthropicResp["stop_reason"] = "end_turn"
		case "length":
			anthropicResp["stop_reason"] = "max_tokens"
		default:
			anthropicResp["stop_reason"] = "end_turn"
		}
	}

	return json.Marshal(anthropicResp)
}

// TransformUpstreamResponse 直接处理上游原始响应并转换为客户端格式
func (c *RequestResponseConverter) TransformUpstreamResponse(responseBody []byte, provider types.Provider, clientFormat RequestFormat) ([]byte, error) {
	// 1. 根据提供商解析原始响应为内部格式
	var proxyResponse *types.ProxyResponse
	var err error

	switch provider {
	case types.ProviderAnthropic:
		proxyResponse, err = c.parseAnthropicResponse(responseBody)
	case types.ProviderOpenAI:
		proxyResponse, err = c.parseOpenAIResponse(responseBody)
	default:
		// 默认尝试OpenAI格式
		proxyResponse, err = c.parseOpenAIResponse(responseBody)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to parse upstream response: %w", err)
	}

	// 2. 根据客户端期望格式转换响应
	return c.TransformResponse(proxyResponse, clientFormat)
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
	var messages []types.Message

	// 分离系统消息和普通消息
	for _, msg := range request.Messages {
		if msg.Role == "system" {
			if systemPrompt != "" {
				systemPrompt += "\n\n" + msg.Content
			} else {
				systemPrompt = msg.Content
			}
		} else {
			messages = append(messages, msg)
		}
	}

	anthropicReq := map[string]interface{}{
		"model":      request.Model,
		"messages":   messages, // 不包含system消息
		"max_tokens": request.MaxTokens,
	}

	// 设置顶层system参数
	if systemPrompt != "" {
		anthropicReq["system"] = systemPrompt
	}

	if request.Temperature != 0 {
		anthropicReq["temperature"] = request.Temperature
	}

	if request.Stream {
		anthropicReq["stream"] = request.Stream
	}

	return json.Marshal(anthropicReq)
}

// BuildOpenAIRequest 构建OpenAI格式请求
func (c *RequestResponseConverter) BuildOpenAIRequest(request *types.ProxyRequest) ([]byte, error) {
	openaiReq := map[string]interface{}{
		"model":    request.Model,
		"messages": request.Messages,
	}

	if request.MaxTokens > 0 {
		openaiReq["max_tokens"] = request.MaxTokens
	}

	if request.Temperature != 0 {
		openaiReq["temperature"] = request.Temperature
	}

	if request.Stream {
		openaiReq["stream"] = request.Stream
	}

	return json.Marshal(openaiReq)
}

// StreamEventConverter 流式事件转换器
type StreamEventConverter struct{}

// NewStreamEventConverter 创建流式事件转换器
func NewStreamEventConverter() *StreamEventConverter {
	return &StreamEventConverter{}
}

// ConvertStreamEvent 转换流式事件（处理无命名的data事件）
func (c *StreamEventConverter) ConvertStreamEvent(data string, provider types.Provider, targetFormat RequestFormat, isFirst bool) (string, int, error) {
	// 解析JSON数据
	var eventData map[string]interface{}
	if err := json.Unmarshal([]byte(data), &eventData); err != nil {
		return "", 0, err
	}

	// 提取token使用量
	tokens := c.extractTokensFromEvent(eventData)

	// 根据提供商和目标格式转换
	if provider == types.ProviderAnthropic && targetFormat == FormatOpenAI {
		// Anthropic -> OpenAI：这种情况很少见，因为Anthropic通常使用命名事件
		return c.convertAnthropicToOpenAI(eventData, isFirst)
	} else if provider == types.ProviderOpenAI && targetFormat == FormatAnthropic {
		// OpenAI -> Anthropic：转换chunk为Anthropic事件
		return c.convertOpenAIToAnthropic(eventData, isFirst)
	} else {
		// 相同格式，直接透传
		return data, tokens, nil
	}
}

// ConvertNamedEvent 转换命名事件（处理Anthropic的event: xxx格式）
func (c *StreamEventConverter) ConvertNamedEvent(eventType, data string, targetFormat RequestFormat, isFirst bool) (string, int, error) {
	// 解析JSON数据
	var eventData map[string]interface{}
	if err := json.Unmarshal([]byte(data), &eventData); err != nil {
		return "", 0, err
	}

	// 提取token使用量
	tokens := c.extractTokensFromEvent(eventData)

	// 如果目标格式是Anthropic，直接透传
	if targetFormat == FormatAnthropic {
		return data, tokens, nil
	}

	// 转换Anthropic命名事件到OpenAI格式
	return c.convertAnthropicEventToOpenAI(eventType, eventData, isFirst)
}

// extractTokensFromEvent 从事件中提取token信息
func (c *StreamEventConverter) extractTokensFromEvent(eventData map[string]interface{}) int {
	// 尝试从usage字段提取
	if usage, ok := eventData["usage"].(map[string]interface{}); ok {
		if total, ok := usage["total_tokens"].(float64); ok {
			return int(total)
		}
		if output, ok := usage["output_tokens"].(float64); ok {
			return int(output)
		}
	}

	// 尝试从choices中的usage提取
	if choices, ok := eventData["choices"].([]interface{}); ok {
		for _, choice := range choices {
			if choiceMap, ok := choice.(map[string]interface{}); ok {
				if usage, ok := choiceMap["usage"].(map[string]interface{}); ok {
					if total, ok := usage["total_tokens"].(float64); ok {
						return int(total)
					}
				}
			}
		}
	}

	return 0
}

// convertOpenAIToAnthropic 转换OpenAI chunk到Anthropic事件
func (c *StreamEventConverter) convertOpenAIToAnthropic(eventData map[string]interface{}, isFirst bool) (string, int, error) {
	// 简化实现：暂时只处理内容转换
	choices, ok := eventData["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", 0, nil
	}

	choice := choices[0].(map[string]interface{})
	delta, ok := choice["delta"].(map[string]interface{})
	if !ok {
		return "", 0, nil
	}

	// 检查是否有内容
	if content, ok := delta["content"].(string); ok && content != "" {
		// 构建Anthropic content_block_delta事件
		anthropicEvent := map[string]interface{}{
			"type":  "content_block_delta",
			"index": 0,
			"delta": map[string]interface{}{
				"type": "text_delta",
				"text": content,
			},
		}

		result, err := json.Marshal(anthropicEvent)
		if err != nil {
			return "", 0, err
		}

		return string(result), 0, nil
	}

	return "", 0, nil
}

// convertAnthropicToOpenAI 转换Anthropic事件到OpenAI chunk
func (c *StreamEventConverter) convertAnthropicToOpenAI(eventData map[string]interface{}, isFirst bool) (string, int, error) {
	// 这是从data事件转换（少见），暂时简单处理
	return "", 0, nil
}

// convertAnthropicEventToOpenAI 转换Anthropic命名事件到OpenAI chunk
func (c *StreamEventConverter) convertAnthropicEventToOpenAI(eventType string, eventData map[string]interface{}, isFirst bool) (string, int, error) {
	switch eventType {
	case "message_start":
		// 第一个chunk，包含role信息
		if isFirst {
			chunk := map[string]interface{}{
				"id":      eventData["message"].(map[string]interface{})["id"],
				"object":  "chat.completion.chunk",
				"created": time.Now().Unix(),
				"model":   eventData["message"].(map[string]interface{})["model"],
				"choices": []map[string]interface{}{
					{
						"index": 0,
						"delta": map[string]interface{}{
							"role": "assistant",
						},
						"finish_reason": nil,
					},
				},
			}
			result, err := json.Marshal(chunk)
			return string(result), 0, err
		}
		return "", 0, nil

	case "content_block_delta":
		// 内容增量
		delta, ok := eventData["delta"].(map[string]interface{})
		if !ok {
			return "", 0, nil
		}

		text, ok := delta["text"].(string)
		if !ok {
			return "", 0, nil
		}

		chunk := map[string]interface{}{
			"id":      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
			"object":  "chat.completion.chunk",
			"created": time.Now().Unix(),
			"model":   "claude-sonnet-4-20250514", // 暂时硬编码
			"choices": []map[string]interface{}{
				{
					"index": 0,
					"delta": map[string]interface{}{
						"content": text,
					},
					"finish_reason": nil,
				},
			},
		}

		result, err := json.Marshal(chunk)
		return string(result), 0, err

	case "message_stop":
		// 结束事件
		chunk := map[string]interface{}{
			"id":      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
			"object":  "chat.completion.chunk",
			"created": time.Now().Unix(),
			"model":   "claude-sonnet-4-20250514",
			"choices": []map[string]interface{}{
				{
					"index":         0,
					"delta":         map[string]interface{}{},
					"finish_reason": "stop",
				},
			},
		}

		result, err := json.Marshal(chunk)
		return string(result), 0, err

	default:
		// 其他事件类型暂不处理
		return "", 0, nil
	}
}

// GetStreamConverter 获取流式事件转换器
func (c *RequestResponseConverter) GetStreamConverter() *StreamEventConverter {
	return c.streamConverter
}

// StreamResponseProcessor 流式响应处理器
type StreamResponseProcessor struct {
	converter *StreamEventConverter
}

// NewStreamResponseProcessor 创建流式响应处理器
func NewStreamResponseProcessor(converter *StreamEventConverter) *StreamResponseProcessor {
	return &StreamResponseProcessor{
		converter: converter,
	}
}

// ProcessStream 处理流式响应
func (p *StreamResponseProcessor) ProcessStream(
	responseBody io.Reader,
	provider types.Provider,
	targetFormat RequestFormat,
	writer func(event string, tokens int),
) error {
	scanner := bufio.NewScanner(responseBody)
	var firstEvent bool = true

	for scanner.Scan() {
		line := scanner.Text()

		// 跳过空行
		if line == "" {
			continue
		}

		// 解析SSE事件
		if strings.HasPrefix(line, "data: ") {
			data := line[6:] // 移除"data: "前缀

			// 处理结束标记
			if data == "[DONE]" {
				// OpenAI风格的结束标记
				if targetFormat == FormatOpenAI {
					writer("[DONE]", 0)
				}
				break
			}

			// 转换并写入事件
			convertedEvent, tokens, err := p.converter.ConvertStreamEvent(data, provider, targetFormat, firstEvent)
			if err != nil {
				// 记录错误但继续处理
				continue
			}

			if convertedEvent != "" {
				writer(convertedEvent, tokens)
				firstEvent = false
			}

		} else if strings.HasPrefix(line, "event: ") {
			// Anthropic风格的命名事件，需要读取下一行的data
			eventType := line[7:] // 移除"event: "前缀
			if scanner.Scan() {
				dataLine := scanner.Text()
				if strings.HasPrefix(dataLine, "data: ") {
					data := dataLine[6:]

					// 处理命名事件
					convertedEvent, tokens, err := p.converter.ConvertNamedEvent(eventType, data, targetFormat, firstEvent)
					if err != nil {
						continue
					}

					if convertedEvent != "" {
						// 如果是Anthropic格式，需要保持完整的SSE格式（event: + data:）
						if targetFormat == FormatAnthropic {
							fullEvent := fmt.Sprintf("event: %s\ndata: %s", eventType, convertedEvent)
							writer(fullEvent, tokens)
						} else {
							writer(convertedEvent, tokens)
						}
						firstEvent = false
					}

					// 处理结束事件
					if eventType == "message_stop" && targetFormat == FormatOpenAI {
						writer("[DONE]", 0)
						break
					}
				}
			}
		}
	}

	return scanner.Err()
}

// GetStreamResponseProcessor 获取流式响应处理器
func (c *RequestResponseConverter) GetStreamResponseProcessor() *StreamResponseProcessor {
	return NewStreamResponseProcessor(c.streamConverter)
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
				if strings.Contains(msg.Content, "You are Claude Code") || strings.Contains(msg.Content, "Claude Code") {
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
					request.Messages[i].Content = claudeCodeIdentity + "\n\n" + msg.Content
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
