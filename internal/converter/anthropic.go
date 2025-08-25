package converter

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/logger"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// AnthropicConverter Anthropic格式转换器
type AnthropicConverter struct{}

// NewAnthropicConverter 创建Anthropic转换器
func NewAnthropicConverter() *AnthropicConverter {
	return &AnthropicConverter{}
}

// GetFormat 获取转换器支持的格式
func (c *AnthropicConverter) GetFormat() Format {
	return FormatAnthropic
}

// GetUpstreamPath 根据客户端端点获取上游路径
func (c *AnthropicConverter) GetUpstreamPath(clientEndpoint string) string {
	// Anthropic 统一使用 /v1/messages 端点
	return "/v1/messages"
}

// ParseRequest 解析Anthropic请求到内部格式
func (c *AnthropicConverter) ParseRequest(data []byte) (*types.ProxyRequest, error) {
	logger.Debug("解析Anthropic请求: %s", string(data))

	var req types.AnthropicRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return nil, fmt.Errorf("解析Anthropic请求失败: %w", err)
	}

	// 转换消息格式
	var messages []types.Message

	// 处理system字段
	var originalSystem *types.SystemField
	var originalMetadata map[string]interface{}

	if req.System != nil {
		originalSystem = req.System
		systemContent := req.System.ToString()
		if systemContent != "" {
			messages = append(messages, types.Message{
				Role:    "system",
				Content: systemContent,
			})
		}
	}

	if req.Metadata != nil {
		originalMetadata = req.Metadata
	}

	// 添加对话消息
	for _, msg := range req.Messages {
		messages = append(messages, types.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	return &types.ProxyRequest{
		Model:            req.Model,
		Messages:         messages,
		MaxTokens:        req.MaxTokens,
		Temperature:      req.Temperature,
		Stream:           req.Stream,
		Tools:            req.Tools,
		ToolChoice:       req.ToolChoice,
		OriginalFormat:   string(FormatAnthropic),
		OriginalSystem:   originalSystem,
		OriginalMetadata: originalMetadata,
	}, nil
}

// BuildRequest 构建发送给上游Anthropic的请求
func (c *AnthropicConverter) BuildRequest(request *types.ProxyRequest) ([]byte, error) {
	var systemPrompt string
	var messages []types.FlexibleMessage

	// 分离系统消息和普通消息
	for _, msg := range request.Messages {
		if msg.Role == "system" {
			content := c.contentToString(msg.Content)
			if systemPrompt != "" {
				systemPrompt += "\n\n" + content
			} else {
				systemPrompt = content
			}
		} else {
			messages = append(messages, types.FlexibleMessage{
				Role:    msg.Role,
				Content: msg.Content,
			})
		}
	}

	convertedTools := c.convertTools(request.Tools)

	req := types.AnthropicRequest{
		Model:       request.Model,
		Messages:    messages,
		MaxTokens:   request.MaxTokens,
		Temperature: request.Temperature,
		Stream:      request.Stream,
		Tools:       convertedTools,
		// 注意：故意不设置ToolChoice字段 - Anthropic默认为auto行为
	}

	// 设置系统字段，并确保Claude Code身份在最前面
	req.System = c.buildSystemField(request.OriginalSystem, systemPrompt)

	// 设置metadata
	if request.OriginalMetadata != nil {
		req.Metadata = request.OriginalMetadata
	}

	return json.Marshal(req)
}

// buildSystemField 构建system字段，确保Claude Code身份在最前面
func (c *AnthropicConverter) buildSystemField(originalSystem *types.SystemField, systemPrompt string) *types.SystemField {
	claudeCodeIdentity := "You are Claude Code, Anthropic's official CLI for Claude."
	
	// 检查是否已经包含Claude Code身份
	hasClaudeCodeIdentity := false
	
	// 检查原始system字段
	if originalSystem != nil {
		if originalSystem.IsString() {
			if c.containsClaudeCode(originalSystem.ToString()) {
				hasClaudeCodeIdentity = true
			}
		} else {
			for _, block := range originalSystem.ToArray() {
				if c.containsClaudeCode(block.Text) {
					hasClaudeCodeIdentity = true
					break
				}
			}
		}
	}
	
	// 检查从消息中提取的系统提示词
	if !hasClaudeCodeIdentity && systemPrompt != "" {
		if c.containsClaudeCode(systemPrompt) {
			hasClaudeCodeIdentity = true
		}
	}
	
	// 如果已经有Claude Code身份，直接使用原有逻辑
	if hasClaudeCodeIdentity {
		if originalSystem != nil {
			return originalSystem
		} else if systemPrompt != "" {
			systemField := &types.SystemField{}
			jsonBytes, _ := json.Marshal(systemPrompt)
			_ = systemField.UnmarshalJSON(jsonBytes)
			return systemField
		}
		return nil
	}
	
	// 需要注入Claude Code身份
	claudeCodeBlock := types.SystemBlock{
		Type: "text",
		Text: claudeCodeIdentity,
	}
	
	var allBlocks []types.SystemBlock
	allBlocks = append(allBlocks, claudeCodeBlock)
	
	// 添加原有的system内容
	if originalSystem != nil {
		if originalSystem.IsString() {
			userBlock := types.SystemBlock{
				Type: "text",
				Text: originalSystem.ToString(),
			}
			allBlocks = append(allBlocks, userBlock)
		} else {
			allBlocks = append(allBlocks, originalSystem.ToArray()...)
		}
	} else if systemPrompt != "" {
		userBlock := types.SystemBlock{
			Type: "text",
			Text: systemPrompt,
		}
		allBlocks = append(allBlocks, userBlock)
	}
	
	// 创建数组格式的SystemField
	systemField := &types.SystemField{}
	systemField.SetArray(allBlocks)
	return systemField
}

// containsClaudeCode 检查内容是否包含Claude Code身份
func (c *AnthropicConverter) containsClaudeCode(content string) bool {
	return len(content) > 0 && 
		(strings.Contains(content, "You are Claude Code") ||
		 strings.Contains(content, "Claude Code"))
}

// ParseResponse 解析Anthropic上游响应到内部格式
func (c *AnthropicConverter) ParseResponse(data []byte) (*types.ProxyResponse, error) {
	var resp types.AnthropicResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("解析Anthropic响应失败: %w", err)
	}

	// 转换内容格式
	var content interface{}
	var toolCalls []map[string]interface{}

	if len(resp.Content) == 1 && resp.Content[0].Type == "text" {
		// 简单文本响应
		content = resp.Content[0].Text
	} else if len(resp.Content) > 0 {
		// 复杂内容或工具调用
		var contentArray []interface{}
		for _, block := range resp.Content {
			blockMap := map[string]interface{}{
				"type": block.Type,
			}

			if block.Text != "" {
				blockMap["text"] = block.Text
			}
			if block.ID != "" {
				blockMap["id"] = block.ID
			}
			if block.Name != "" {
				blockMap["name"] = block.Name
			}
			if block.Input != nil {
				blockMap["input"] = block.Input
			}

			contentArray = append(contentArray, blockMap)

			// 为OpenAI兼容性提取tool_calls
			if block.Type == "tool_use" {
				toolCall := map[string]interface{}{
					"id":   block.ID,
					"type": "function",
					"function": map[string]interface{}{
						"name":      block.Name,
						"arguments": block.Input,
					},
				}
				toolCalls = append(toolCalls, toolCall)
			}
		}
		content = contentArray
	}

	// 转换结束原因
	finishReason := c.convertStopReason(resp.StopReason)

	return &types.ProxyResponse{
		ID:      resp.ID,
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   resp.Model,
		Choices: []types.ResponseChoice{
			{
				Index: 0,
				Message: types.Message{
					Role:      "assistant",
					Content:   content,
					ToolCalls: toolCalls,
				},
				FinishReason: finishReason,
			},
		},
		Usage: types.ResponseUsage{
			PromptTokens:     resp.Usage.InputTokens,
			CompletionTokens: resp.Usage.OutputTokens,
			TotalTokens:      resp.Usage.InputTokens + resp.Usage.OutputTokens,
		},
	}, nil
}

// BuildResponse 构建返回给客户端的Anthropic格式响应
func (c *AnthropicConverter) BuildResponse(response *types.ProxyResponse) ([]byte, error) {
	resp := types.AnthropicResponse{
		ID:    response.ID,
		Type:  "message",
		Role:  "assistant",
		Model: response.Model,
		Content: []types.AnthropicContentBlock{
			{Type: "text", Text: ""},
		},
		StopReason:   "end_turn",
		StopSequence: nil,
		Usage: types.AnthropicUsage{
			InputTokens:  response.Usage.PromptTokens,
			OutputTokens: response.Usage.CompletionTokens,
		},
	}

	// 转换内容
	if len(response.Choices) > 0 {
		choice := response.Choices[0]
		resp.Content = c.convertContent(choice.Message.Content, choice.Message.ToolCalls)
		resp.StopReason = c.convertFinishReason(choice.FinishReason)
	}

	return json.Marshal(resp)
}

// CreateStreamProcessor 创建Anthropic流式处理器
func (c *AnthropicConverter) CreateStreamProcessor() StreamProcessor {
	return NewSSEStreamProcessor(FormatAnthropic)
}

// ValidateRequest 验证Anthropic请求格式
func (c *AnthropicConverter) ValidateRequest(data []byte) error {
	var req types.AnthropicRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return fmt.Errorf("无效的Anthropic请求格式: %w", err)
	}

	if req.Model == "" {
		return fmt.Errorf("缺少必需字段: model")
	}

	if len(req.Messages) == 0 {
		return fmt.Errorf("缺少必需字段: messages")
	}

	return nil
}

// contentToString 转换内容为字符串
func (c *AnthropicConverter) contentToString(content interface{}) string {
	if content == nil {
		return ""
	}

	switch v := content.(type) {
	case string:
		return v
	case []interface{}:
		var parts []string
		for _, item := range v {
			if itemMap, ok := item.(map[string]interface{}); ok {
				if itemType, exists := itemMap["type"]; exists && itemType == "text" {
					if text, exists := itemMap["text"]; exists {
						if textStr, ok := text.(string); ok {
							parts = append(parts, textStr)
						}
					}
				}
			}
		}
		return strings.Join(parts, "")
	default:
		if bytes, err := json.Marshal(content); err == nil {
			return string(bytes)
		}
		return fmt.Sprintf("%v", content)
	}
}

// convertTools 转换工具格式
func (c *AnthropicConverter) convertTools(tools []map[string]interface{}) []map[string]interface{} {
	if tools == nil {
		return nil
	}

	var converted []map[string]interface{}
	for _, tool := range tools {
		// 如果是OpenAI格式，转换为Anthropic格式
		if tool["type"] == "function" {
			if function, ok := tool["function"].(map[string]interface{}); ok {
				anthropicTool := map[string]interface{}{
					"name":        function["name"],
					"description": function["description"],
				}
				if parameters, ok := function["parameters"]; ok {
					anthropicTool["input_schema"] = parameters
				}
				converted = append(converted, anthropicTool)
			} else {
				converted = append(converted, tool)
			}
		} else {
			// 已经是Anthropic格式
			converted = append(converted, tool)
		}
	}

	return converted
}

// convertContent 转换响应内容
func (c *AnthropicConverter) convertContent(content interface{}, toolCalls []map[string]interface{}) []types.AnthropicContentBlock {
	// 如果原始内容已经是Anthropic数组格式
	if contentArray, ok := content.([]interface{}); ok {
		var blocks []types.AnthropicContentBlock
		for _, item := range contentArray {
			if blockMap, ok := item.(map[string]interface{}); ok {
				block := types.AnthropicContentBlock{
					Type: fmt.Sprintf("%v", blockMap["type"]),
				}
				if text, exists := blockMap["text"]; exists {
					block.Text = fmt.Sprintf("%v", text)
				}
				if id, exists := blockMap["id"]; exists {
					block.ID = fmt.Sprintf("%v", id)
				}
				if name, exists := blockMap["name"]; exists {
					block.Name = fmt.Sprintf("%v", name)
				}
				if input, exists := blockMap["input"]; exists {
					block.Input = input
				}
				blocks = append(blocks, block)
			}
		}
		return blocks
	}

	var blocks []types.AnthropicContentBlock

	// 添加文本内容
	if content != nil {
		textContent := c.contentToString(content)
		if textContent != "" {
			blocks = append(blocks, types.AnthropicContentBlock{
				Type: "text",
				Text: textContent,
			})
		}
	}

	// 添加工具调用
	for _, toolCall := range toolCalls {
		if toolCall != nil {
			if funcData, ok := toolCall["function"].(map[string]interface{}); ok {
				blocks = append(blocks, types.AnthropicContentBlock{
					Type:  "tool_use",
					ID:    fmt.Sprintf("%v", toolCall["id"]),
					Name:  fmt.Sprintf("%v", funcData["name"]),
					Input: funcData["arguments"],
				})
			}
		}
	}

	if len(blocks) == 0 {
		blocks = []types.AnthropicContentBlock{{Type: "text", Text: ""}}
	}

	return blocks
}

// convertStopReason 转换Anthropic停止原因到标准格式
func (c *AnthropicConverter) convertStopReason(stopReason string) string {
	switch stopReason {
	case "end_turn":
		return "stop"
	case "max_tokens":
		return "length"
	case "stop_sequence":
		return "stop"
	case "tool_use":
		return "tool_calls"
	default:
		return "stop"
	}
}

// convertFinishReason 转换标准格式到Anthropic停止原因
func (c *AnthropicConverter) convertFinishReason(finishReason string) string {
	switch finishReason {
	case "stop":
		return "end_turn"
	case "length":
		return "max_tokens"
	case "tool_calls":
		return "tool_use"
	default:
		return "end_turn"
	}
}

// ConvertStreamChunk 转换流数据块到目标格式
func (c *AnthropicConverter) ConvertStreamChunk(chunk *StreamChunk, targetFormat Format) (*StreamChunk, error) {
	// 如果目标格式是Anthropic，直接返回
	if targetFormat == FormatAnthropic {
		return chunk, nil
	}

	// 如果目标格式是OpenAI，需要转换
	if targetFormat == FormatOpenAI {
		return c.convertAnthropicToOpenAI(chunk)
	}

	// 不支持的目标格式，直接返回原数据
	return chunk, nil
}

// convertAnthropicToOpenAI 转换Anthropic流数据块到OpenAI格式
func (c *AnthropicConverter) convertAnthropicToOpenAI(chunk *StreamChunk) (*StreamChunk, error) {
	eventData, ok := chunk.Data.(map[string]interface{})
	if !ok {
		return chunk, nil
	}

	switch chunk.EventType {
	case "message_start":
		messageData, ok := eventData["message"].(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid message_start event")
		}

		id, _ := messageData["id"].(string)
		model, _ := messageData["model"].(string)

		openAIChunk := types.OpenAIStreamChunk{
			ID:      id,
			Object:  "chat.completion.chunk",
			Created: time.Now().Unix(),
			Model:   model,
			Choices: []types.OpenAIStreamChoice{
				{
					Index: 0,
					Delta: types.OpenAIStreamDelta{
						Role: "assistant",
					},
					FinishReason: nil,
				},
			},
		}

		return &StreamChunk{
			EventType: "",
			Data:      openAIChunk,
			Tokens:    0,
			IsDone:    false,
		}, nil

	case "content_block_delta":
		delta, ok := eventData["delta"].(map[string]interface{})
		if !ok {
			return nil, nil
		}

		text, ok := delta["text"].(string)
		if !ok {
			return nil, nil
		}

		openAIChunk := types.OpenAIStreamChunk{
			ID:      "", // 需要从上下文获取
			Object:  "chat.completion.chunk",
			Created: time.Now().Unix(),
			Model:   "", // 需要从上下文获取
			Choices: []types.OpenAIStreamChoice{
				{
					Index: 0,
					Delta: types.OpenAIStreamDelta{
						Content: text,
					},
					FinishReason: nil,
				},
			},
		}

		return &StreamChunk{
			EventType: "",
			Data:      openAIChunk,
			Tokens:    0,
			IsDone:    false,
		}, nil

	case "message_stop":
		finishReason := "stop"
		openAIChunk := types.OpenAIStreamChunk{
			ID:      "", // 需要从上下文获取
			Object:  "chat.completion.chunk",
			Created: time.Now().Unix(),
			Model:   "", // 需要从上下文获取
			Choices: []types.OpenAIStreamChoice{
				{
					Index:        0,
					Delta:        types.OpenAIStreamDelta{},
					FinishReason: &finishReason,
				},
			},
		}

		return &StreamChunk{
			EventType: "",
			Data:      openAIChunk,
			Tokens:    chunk.Tokens,
			IsDone:    true,
		}, nil

	default:
		// 其他事件类型直接透传
		return chunk, nil
	}
}

