package converter

import (
	"encoding/json"
	"fmt"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// OpenAIConverter OpenAI格式转换器
type OpenAIConverter struct{}

// NewOpenAIConverter 创建OpenAI转换器
func NewOpenAIConverter() *OpenAIConverter {
	return &OpenAIConverter{}
}

// GetFormat 获取转换器支持的格式
func (c *OpenAIConverter) GetFormat() Format {
	return FormatOpenAI
}

// ParseRequest 解析OpenAI请求到内部格式
func (c *OpenAIConverter) ParseRequest(data []byte) (*types.ProxyRequest, error) {
	var req types.OpenAIRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return nil, fmt.Errorf("解析OpenAI请求失败: %w", err)
	}

	return &types.ProxyRequest{
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
func (c *OpenAIConverter) BuildRequest(request *types.ProxyRequest) ([]byte, error) {
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
func (c *OpenAIConverter) ParseResponse(data []byte) (*types.ProxyResponse, error) {
	var resp types.ProxyResponse
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
func (c *OpenAIConverter) BuildResponse(response *types.ProxyResponse) ([]byte, error) {
	return json.Marshal(response)
}

// CreateStreamProcessor 创建OpenAI流式处理器
func (c *OpenAIConverter) CreateStreamProcessor() StreamProcessor {
	return NewSSEStreamProcessor(FormatOpenAI)
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

// ConvertStreamChunk 转换流数据块到目标格式
func (c *OpenAIConverter) ConvertStreamChunk(chunk *StreamChunk, targetFormat Format) (*StreamChunk, error) {
	// 如果目标格式是OpenAI，直接返回
	if targetFormat == FormatOpenAI {
		return chunk, nil
	}

	// 如果目标格式是Anthropic，需要转换
	if targetFormat == FormatAnthropic {
		return c.convertOpenAIToAnthropic(chunk)
	}

	// 不支持的目标格式，直接返回原数据
	return chunk, nil
}

// convertOpenAIToAnthropic 转换OpenAI流数据块到Anthropic格式
func (c *OpenAIConverter) convertOpenAIToAnthropic(chunk *StreamChunk) (*StreamChunk, error) {
	eventData, ok := chunk.Data.(map[string]interface{})
	if !ok {
		return chunk, nil
	}

	choices, ok := eventData["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return nil, nil
	}

	choice := choices[0].(map[string]interface{})
	delta, ok := choice["delta"].(map[string]interface{})
	if !ok {
		return nil, nil
	}

	// 处理内容增量
	if content, ok := delta["content"].(string); ok && content != "" {
		contentBlockDelta := map[string]interface{}{
			"type":  "content_block_delta",
			"index": 0,
			"delta": map[string]interface{}{
				"type": "text_delta",
				"text": content,
			},
		}

		return &StreamChunk{
			EventType: "content_block_delta",
			Data:      contentBlockDelta,
			Tokens:    0,
			IsDone:    false,
		}, nil
	}

	// 处理结束事件
	if finishReason, ok := choice["finish_reason"]; ok && finishReason != nil {
		messageStop := map[string]interface{}{
			"type": "message_stop",
		}

		return &StreamChunk{
			EventType: "message_stop",
			Data:      messageStop,
			Tokens:    chunk.Tokens,
			IsDone:    true,
		}, nil
	}

	return chunk, nil
}