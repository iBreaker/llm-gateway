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
func (c *AnthropicConverter) ParseRequest(data []byte) (*types.UnifiedRequest, error) {
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
		// 检查消息内容中是否有tool_result，需要转换格式
		if msg.Role == "user" && msg.Content != nil {
			if hasToolResult, toolResultMsgs := c.extractToolResults(msg.Content); hasToolResult {
				// 将tool_result转换为OpenAI的tool消息
				messages = append(messages, toolResultMsgs...)
				continue
			}
		}

		// 检查消息内容中是否有tool_use，需要转换格式
		if msg.Role == "assistant" && msg.Content != nil {
			if hasToolUse, convertedMsg := c.extractToolUse(msg.Content); hasToolUse {
				// 将tool_use转换为OpenAI的tool_calls格式
				messages = append(messages, convertedMsg)
				continue
			}
		}

		// 普通消息直接添加
		messages = append(messages, types.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	return &types.UnifiedRequest{
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
func (c *AnthropicConverter) BuildRequest(request *types.UnifiedRequest) ([]byte, error) {
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
		} else if msg.Role == "tool" {
			// 将中间格式的tool消息转换回Anthropic的tool_result格式
			toolResultMsg := c.convertToolMessageToAnthropic(msg)
			messages = append(messages, toolResultMsg)
		} else if msg.Role == "assistant" && msg.ToolCalls != nil {
			// 将中间格式的tool_calls转换回Anthropic的tool_use格式
			assistantMsg := c.convertToolCallsToAnthropic(msg)
			messages = append(messages, assistantMsg)
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

// extractToolResults 从Anthropic消息内容中提取tool_result并转换为中间格式
func (c *AnthropicConverter) extractToolResults(content interface{}) (bool, []types.Message) {
	// 检查content是否为数组格式
	contentArray, ok := content.([]interface{})
	if !ok {
		return false, nil
	}

	var toolMessages []types.Message
	hasToolResult := false

	for _, item := range contentArray {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		// 检查是否为tool_result类型
		if itemType, exists := itemMap["type"]; exists && itemType == "tool_result" {
			hasToolResult = true

			// 提取tool_use_id
			var toolCallID string
			if id, exists := itemMap["tool_use_id"]; exists {
				if idStr, ok := id.(string); ok {
					toolCallID = idStr
				}
			}

			// 提取content
			var resultContent string
			if contentField, exists := itemMap["content"]; exists {
				// content可能是字符串或者数组
				switch v := contentField.(type) {
				case string:
					resultContent = v
				case []interface{}:
					// 如果是数组，提取text内容
					for _, subItem := range v {
						if subMap, ok := subItem.(map[string]interface{}); ok {
							if subType, exists := subMap["type"]; exists && subType == "text" {
								if text, exists := subMap["text"]; exists {
									if textStr, ok := text.(string); ok {
										resultContent = textStr
										break
									}
								}
							}
						}
					}
				}
			}

			// 创建中间格式的tool消息
			toolMsg := types.Message{
				Role:       "tool",
				Content:    resultContent,
				ToolCallID: &toolCallID,
				// Name字段需要从上下文推断，这里暂时留空
				// 实际使用中，OpenAI API对name字段要求不严格
			}

			toolMessages = append(toolMessages, toolMsg)
		}
	}

	return hasToolResult, toolMessages
}

// extractToolUse 从Anthropic消息内容中提取tool_use并转换为中间格式
func (c *AnthropicConverter) extractToolUse(content interface{}) (bool, types.Message) {
	// 检查content是否为数组格式
	contentArray, ok := content.([]interface{})
	if !ok {
		return false, types.Message{}
	}

	var toolCalls []map[string]interface{}
	var textContent string
	hasToolUse := false

	for _, item := range contentArray {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		itemType, exists := itemMap["type"]
		if !exists {
			continue
		}

		switch itemType {
		case "tool_use":
			hasToolUse = true

			// 提取tool_use信息
			var toolID, toolName string
			var toolInput interface{}

			if id, exists := itemMap["id"]; exists {
				if idStr, ok := id.(string); ok {
					toolID = idStr
				}
			}

			if name, exists := itemMap["name"]; exists {
				if nameStr, ok := name.(string); ok {
					toolName = nameStr
				}
			}

			if input, exists := itemMap["input"]; exists {
				toolInput = input
			}

			// 将input序列化为JSON字符串
			var inputJSON string
			if toolInput != nil {
				if inputBytes, err := json.Marshal(toolInput); err == nil {
					inputJSON = string(inputBytes)
				}
			}

			// 创建OpenAI格式的tool_call
			toolCall := map[string]interface{}{
				"id":   toolID,
				"type": "function",
				"function": map[string]interface{}{
					"name":      toolName,
					"arguments": inputJSON,
				},
			}

			toolCalls = append(toolCalls, toolCall)

		case "text":
			// 保留文本内容
			if text, exists := itemMap["text"]; exists {
				if textStr, ok := text.(string); ok {
					if textContent != "" {
						textContent += "\n" + textStr
					} else {
						textContent = textStr
					}
				}
			}
		}
	}

	if !hasToolUse {
		return false, types.Message{}
	}

	// 创建中间格式的assistant消息
	msg := types.Message{
		Role:      "assistant",
		ToolCalls: toolCalls,
	}

	// 如果有文本内容，设置content；否则设置为nil（OpenAI格式要求）
	if textContent != "" {
		msg.Content = textContent
	} else {
		msg.Content = nil
	}

	return true, msg
}

// convertToolMessageToAnthropic 将中间格式的tool消息转换为Anthropic的tool_result格式
func (c *AnthropicConverter) convertToolMessageToAnthropic(msg types.Message) types.FlexibleMessage {
	toolResult := map[string]interface{}{
		"type":        "tool_result",
		"tool_use_id": *msg.ToolCallID,
		"content": []map[string]interface{}{
			{
				"type": "text",
				"text": c.contentToString(msg.Content),
			},
		},
	}

	return types.FlexibleMessage{
		Role:    "user",
		Content: []interface{}{toolResult},
	}
}

// convertToolCallsToAnthropic 将中间格式的tool_calls转换为Anthropic的tool_use格式
func (c *AnthropicConverter) convertToolCallsToAnthropic(msg types.Message) types.FlexibleMessage {
	var content []interface{}

	// 如果有文本内容，先添加文本
	if msg.Content != nil && msg.Content != "" {
		textContent := map[string]interface{}{
			"type": "text",
			"text": c.contentToString(msg.Content),
		}
		content = append(content, textContent)
	}

	// 添加tool_use内容
	for _, toolCall := range msg.ToolCalls {
		toolUse := map[string]interface{}{
			"type": "tool_use",
			"id":   toolCall["id"],
			"name": toolCall["function"].(map[string]interface{})["name"],
		}

		// 解析arguments JSON字符串为对象
		if functionData, ok := toolCall["function"].(map[string]interface{}); ok {
			if argsStr, ok := functionData["arguments"].(string); ok {
				var args interface{}
				if err := json.Unmarshal([]byte(argsStr), &args); err == nil {
					toolUse["input"] = args
				}
			}
		}

		content = append(content, toolUse)
	}

	return types.FlexibleMessage{
		Role:    "assistant",
		Content: content,
	}
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
func (c *AnthropicConverter) ParseResponse(data []byte) (*types.UnifiedResponse, error) {
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

	return &types.UnifiedResponse{
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
func (c *AnthropicConverter) BuildResponse(response *types.UnifiedResponse) ([]byte, error) {
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

// ParseStreamEvent 解析Anthropic流式事件到统一内部格式
func (c *AnthropicConverter) ParseStreamEvent(eventType string, data []byte) ([]*UnifiedStreamEvent, error) {
	var eventData map[string]interface{}
	if err := json.Unmarshal(data, &eventData); err != nil {
		return nil, fmt.Errorf("解析事件数据失败: %w", err)
	}

	switch eventType {
	case "message_start":
		if messageData, ok := eventData["message"].(map[string]interface{}); ok {
			id := getString(messageData["id"])
			model := getString(messageData["model"])

			return []*UnifiedStreamEvent{{
				Type:      StreamEventMessageStart,
				MessageID: id,
				Model:     model,
			}}, nil
		}

	case "content_block_delta":
		if delta, ok := eventData["delta"].(map[string]interface{}); ok {
			index, _ := eventData["index"].(float64)

			// 处理文本增量
			if deltaType, ok := delta["type"].(string); ok && deltaType == "text_delta" {
				if text, ok := delta["text"].(string); ok {
					return []*UnifiedStreamEvent{{
						Type: StreamEventContentDelta,
						Content: &UnifiedStreamContent{
							Type:  "text",
							Text:  text,
							Index: int(index),
						},
					}}, nil
				}
			}

			// 处理工具调用参数增量
			if deltaType, ok := delta["type"].(string); ok && deltaType == "input_json_delta" {
				if partialJSON, ok := delta["partial_json"].(string); ok {
					return []*UnifiedStreamEvent{{
						Type: StreamEventContentDelta,
						Content: &UnifiedStreamContent{
							Type:      "tool_use",
							ToolInput: partialJSON,
							Index:     int(index),
						},
					}}, nil
				}
			}
		}

	case "message_stop":
		return []*UnifiedStreamEvent{{
			Type:   StreamEventMessageStop,
			IsDone: false,  // 不设置IsDone，让[DONE]来触发结束
		}}, nil
	}

	return nil, nil // 跳过不识别的事件
}

// BuildStreamEvent 从统一内部格式构建Anthropic流式事件
func (c *AnthropicConverter) BuildStreamEvent(event *UnifiedStreamEvent) (*StreamChunk, error) {
	switch event.Type {
	case StreamEventMessageStart:
		messageStart := map[string]interface{}{
			"type": "message_start",
			"message": map[string]interface{}{
				"id":            event.MessageID,
				"type":          "message",
				"role":          "assistant",
				"content":       []interface{}{},
				"model":         event.Model,
				"stop_reason":   nil,
				"stop_sequence": nil,
				"usage": map[string]interface{}{
					"input_tokens":  0,
					"output_tokens": 0,
				},
			},
		}

		return &StreamChunk{
			EventType: "message_start",
			Data:      messageStart,
			Tokens:    0,
			IsDone:    false,
		}, nil

	case StreamEventContentStart:
		if event.Content != nil {
			var contentBlock map[string]interface{}
			
			if event.Content.Type == "text" {
				contentBlock = map[string]interface{}{
					"type": "text",
					"text": "",
				}
			} else if event.Content.Type == "tool_use" {
				// 如果没有提供工具ID或名称，生成默认值
				toolID := event.Content.ToolID
				if toolID == "" {
					toolID = fmt.Sprintf("toolu_%d", time.Now().UnixNano())
				}
				toolName := event.Content.ToolName
				if toolName == "" {
					toolName = "unknown_tool"
				}
				
				contentBlock = map[string]interface{}{
					"type":  "tool_use",
					"id":    toolID,
					"name":  toolName,
					"input": map[string]interface{}{},
				}
				fmt.Printf("[DEBUG Anthropic] Building content_block_start for tool: ID=%s, Name=%s\n", toolID, toolName)
			}
			
			contentBlockStart := map[string]interface{}{
				"type":          "content_block_start",
				"index":         event.Content.Index,
				"content_block": contentBlock,
			}
			
			return &StreamChunk{
				EventType: "content_block_start",
				Data:      contentBlockStart,
				Tokens:    0,
				IsDone:    false,
			}, nil
		}
		return nil, nil

	case StreamEventContentDelta:
		if event.Content != nil {
			var delta map[string]interface{}
			
			fmt.Printf("[DEBUG Anthropic] Building content_block_delta: Type=%s, Text='%s', ToolInput='%s'\n", 
				event.Content.Type, event.Content.Text, event.Content.ToolInput)

			if event.Content.Type == "text" {
				delta = map[string]interface{}{
					"type": "text_delta",
					"text": event.Content.Text,
				}
			} else if event.Content.Type == "tool_use" {
				delta = map[string]interface{}{
					"type":         "input_json_delta",
					"partial_json": event.Content.ToolInput,
				}
			}

			contentBlockDelta := map[string]interface{}{
				"type":  "content_block_delta",
				"index": event.Content.Index,
				"delta": delta,
			}

			return &StreamChunk{
				EventType: "content_block_delta",
				Data:      contentBlockDelta,
				Tokens:    0,
				IsDone:    false,
			}, nil
		}

	case StreamEventContentStop:
		fmt.Printf("[DEBUG Anthropic] Building content_block_stop\n")
		contentBlockStop := map[string]interface{}{
			"type":  "content_block_stop",
			"index": 0,
		}
		if event.Content != nil {
			contentBlockStop["index"] = event.Content.Index
		}
		return &StreamChunk{
			EventType: "content_block_stop",
			Data:      contentBlockStop,
			Tokens:    0,
			IsDone:    false,
		}, nil
		
	case StreamEventMessageStop:
		fmt.Printf("[DEBUG Anthropic] Building message_stop\n")
		messageStop := map[string]interface{}{
			"type": "message_stop",
		}

		return &StreamChunk{
			EventType: "message_stop",
			Data:      messageStop,
			Tokens:    0,
			IsDone:    false,  // 不设置IsDone，让[DONE]来触发结束
		}, nil
	}

	return nil, nil
}

// getString 安全地获取字符串值
func getString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
