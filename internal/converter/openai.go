package converter

import (
	"encoding/json"
	"fmt"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// OpenAIConverter OpenAI格式转换器
type OpenAIConverter struct {}

// NewOpenAIConverter 创建OpenAI转换器
func NewOpenAIConverter() *OpenAIConverter {
	return &OpenAIConverter{}
}

// GetFormat 获取转换器支持的格式
func (c *OpenAIConverter) GetFormat() Format {
	return FormatOpenAI
}

// GetUpstreamPath 根据客户端端点获取上游路径
func (c *OpenAIConverter) GetUpstreamPath(clientEndpoint string) string {
	// OpenAI/Qwen 等 OpenAI 兼容提供商统一使用 /v1/chat/completions
	return "/v1/chat/completions"
}

// ParseRequest 解析OpenAI请求到内部格式
func (c *OpenAIConverter) ParseRequest(data []byte) (*types.UnifiedRequest, error) {
	var req types.OpenAIRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return nil, fmt.Errorf("解析OpenAI请求失败: %w", err)
	}

	return &types.UnifiedRequest{
		Model:          req.Model,
		Messages:       req.Messages,
		MaxTokens:      req.MaxTokens,
		Temperature:    req.Temperature,
		Stream:         req.Stream,
		TopP:           req.TopP,
		Tools:          req.Tools,
		ToolChoice:     req.ToolChoice,
		OriginalFormat: string(FormatOpenAI),
	}, nil
}

// BuildRequest 构建发送给上游OpenAI的请求
func (c *OpenAIConverter) BuildRequest(request *types.UnifiedRequest) ([]byte, error) {
	req := types.OpenAIRequest{
		Model:       request.Model,
		Messages:    c.filterMessages(request.Messages),
		MaxTokens:   request.MaxTokens,
		Temperature: request.Temperature,
		Stream:      request.Stream,
		TopP:        request.TopP,
		Tools:       c.convertTools(request.Tools),
		ToolChoice:  request.ToolChoice,
	}

	return json.Marshal(req)
}

// ParseResponse 解析OpenAI上游响应到内部格式
func (c *OpenAIConverter) ParseResponse(data []byte) (*types.UnifiedResponse, error) {
	var resp types.UnifiedResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("解析OpenAI响应失败: %w", err)
	}

	// 处理可能的额外字段
	var rawResp map[string]interface{}
	if err := json.Unmarshal(data, &rawResp); err == nil {
		if choices, ok := rawResp["choices"].([]interface{}); ok {
			for i, choice := range choices {
				if i < len(resp.Choices) {
					if choiceMap, ok := choice.(map[string]interface{}); ok {
						if logprobs, exists := choiceMap["logprobs"]; exists {
							resp.Choices[i].Logprobs = logprobs
						}
					}
				}
			}
		}
	}

	return &resp, nil
}

// BuildResponse 构建返回给客户端的OpenAI格式响应
func (c *OpenAIConverter) BuildResponse(response *types.UnifiedResponse) ([]byte, error) {
	return json.Marshal(response)
}

// ValidateRequest 验证OpenAI请求格式
func (c *OpenAIConverter) ValidateRequest(data []byte) error {
	var req types.OpenAIRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return fmt.Errorf("无效的OpenAI请求格式: %w", err)
	}

	if req.Model == "" {
		return fmt.Errorf("缺少必需字段: model")
	}

	if len(req.Messages) == 0 {
		return fmt.Errorf("缺少必需字段: messages")
	}

	return nil
}

// filterMessages 过滤消息中的不兼容字段
func (c *OpenAIConverter) filterMessages(messages []types.Message) []types.Message {
	var filtered []types.Message
	for _, msg := range messages {
		filteredMsg := types.Message{
			Role:       msg.Role,
			Content:    c.filterContent(msg.Content),
			ToolCalls:  msg.ToolCalls,
			ToolCallID: msg.ToolCallID,
			Name:       msg.Name,
		}
		filtered = append(filtered, filteredMsg)
	}
	return filtered
}

// filterContent 过滤内容中的cache_control等不兼容字段
func (c *OpenAIConverter) filterContent(content interface{}) interface{} {
	switch v := content.(type) {
	case []interface{}:
		var filtered []interface{}
		for _, item := range v {
			if itemMap, ok := item.(map[string]interface{}); ok {
				cleanItem := make(map[string]interface{})
				for key, value := range itemMap {
					if key != "cache_control" {
						cleanItem[key] = value
					}
				}
				filtered = append(filtered, cleanItem)
			} else {
				filtered = append(filtered, item)
			}
		}
		return filtered
	default:
		return content
	}
}

// convertTools 转换工具格式
func (c *OpenAIConverter) convertTools(tools []map[string]interface{}) []map[string]interface{} {
	if tools == nil {
		return nil
	}

	var converted []map[string]interface{}
	for _, tool := range tools {
		// 如果是Anthropic格式，转换为OpenAI格式
		if _, hasName := tool["name"]; hasName {
			if _, hasInputSchema := tool["input_schema"]; hasInputSchema {
				openaiTool := map[string]interface{}{
					"type": "function",
					"function": map[string]interface{}{
						"name":        tool["name"],
						"description": tool["description"],
						"parameters":  tool["input_schema"],
					},
				}
				converted = append(converted, openaiTool)
			} else {
				converted = append(converted, tool)
			}
		} else {
			// 已经是OpenAI格式
			converted = append(converted, tool)
		}
	}

	return converted
}

// ParseStreamEvent 解析OpenAI流式事件到统一内部格式
func (c *OpenAIConverter) ParseStreamEvent(eventType string, data []byte) ([]*UnifiedStreamEvent, error) {
	var eventData map[string]interface{}
	if err := json.Unmarshal(data, &eventData); err != nil {
		return nil, fmt.Errorf("解析事件数据失败: %w", err)
	}

	// OpenAI格式没有命名事件，需要从数据结构判断事件类型
	if choices, ok := eventData["choices"].([]interface{}); ok && len(choices) > 0 {
		choice := choices[0].(map[string]interface{})

		// 检查是否有delta
		if delta, ok := choice["delta"].(map[string]interface{}); ok {
			// 检查finish_reason确定是否结束
			if finishReason, ok := choice["finish_reason"]; ok && finishReason != nil {
				events := []*UnifiedStreamEvent{}
				
				// 先发送ContentStop（无论是工具调用还是普通文本）
				events = append(events, &UnifiedStreamEvent{
					Type: StreamEventContentStop,
					Content: &UnifiedStreamContent{
						Index: 0,
					},
				})
				
				// 然后发送MessageStop（不设置IsDone，让[DONE]来触发结束）
				events = append(events, &UnifiedStreamEvent{
					Type:   StreamEventMessageStop,
					IsDone: false,
				})
				
				return events, nil
			}

			// 处理内容增量
			if content, ok := delta["content"].(string); ok && content != "" {
				return []*UnifiedStreamEvent{{
					Type: StreamEventContentDelta,
					Content: &UnifiedStreamContent{
						Type:  "text",
						Text:  content,
						Index: 0,
					},
				}}, nil
			}

			// 处理工具调用增量
			if toolCalls, ok := delta["tool_calls"].([]interface{}); ok && len(toolCalls) > 0 {
				toolCall := toolCalls[0].(map[string]interface{})
				
				// 提取工具调用ID（如果存在）
				toolID, _ := toolCall["id"].(string)
				
				if function, ok := toolCall["function"].(map[string]interface{}); ok {
					// 提取工具名称（第一次调用时会有）
					toolName, _ := function["name"].(string)
					arguments, _ := function["arguments"].(string)
					
					// 如果有工具名称，说明这是第一个chunk，需要生成ContentStart事件
					if toolName != "" {
						fmt.Printf("[DEBUG OpenAI] Found tool call: ID=%s, Name=%s\n", toolID, toolName)
						events := []*UnifiedStreamEvent{
							{
								Type: StreamEventContentStart,
								Content: &UnifiedStreamContent{
									Type:     "tool_use",
									ToolID:   toolID,
									ToolName: toolName,
									Index:    0,
								},
							},
						}
						
						// 如果同时有arguments，也生成ContentDelta事件
						if arguments != "" {
							fmt.Printf("[DEBUG OpenAI] First chunk also has arguments: %s\n", arguments)
							events = append(events, &UnifiedStreamEvent{
								Type: StreamEventContentDelta,
								Content: &UnifiedStreamContent{
									Type:      "tool_use",
									ToolInput: arguments,
									Index:     0,
								},
							})
						}
						
						fmt.Printf("[DEBUG OpenAI] Returning %d events from first tool chunk\n", len(events))
						return events, nil
					}
					
					// 只有arguments的增量更新
					if arguments != "" {
						return []*UnifiedStreamEvent{{
							Type: StreamEventContentDelta,
							Content: &UnifiedStreamContent{
								Type:      "tool_use",
								ToolInput: arguments,
								Index:     0,
							},
						}}, nil
					}
				}
			}
		}
	}

	return nil, nil // 跳过不识别的事件
}


// BuildStreamEvent 从统一内部格式构建OpenAI流式事件
func (c *OpenAIConverter) BuildStreamEvent(event *UnifiedStreamEvent) (*StreamChunk, error) {
	switch event.Type {
	case StreamEventContentDelta:
		if event.Content != nil {
			var delta map[string]interface{}

			if event.Content.Type == "text" {
				delta = map[string]interface{}{
					"content": event.Content.Text,
				}
			} else if event.Content.Type == "tool_use" {
				delta = map[string]interface{}{
					"tool_calls": []interface{}{
						map[string]interface{}{
							"index": event.Content.Index,
							"function": map[string]interface{}{
								"arguments": event.Content.ToolInput,
							},
						},
					},
				}
			}

			openAIData := map[string]interface{}{
				"choices": []interface{}{
					map[string]interface{}{
						"index": event.Content.Index,
						"delta": delta,
					},
				},
			}

			return &StreamChunk{
				EventType: "",
				Data:      openAIData,
				Tokens:    0,
				IsDone:    false,
			}, nil
		}

	case StreamEventMessageStop:
		finishReason := "stop"
		openAIData := map[string]interface{}{
			"choices": []interface{}{
				map[string]interface{}{
					"index":         0,
					"delta":         map[string]interface{}{},
					"finish_reason": finishReason,
				},
			},
		}

		return &StreamChunk{
			EventType: "",
			Data:      openAIData,
			Tokens:    0,
			IsDone:    true,
		}, nil
	}

	return nil, nil
}
