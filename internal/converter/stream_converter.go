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
		anthropicEvent := types.AnthropicStreamEvent{
			Type:  "content_block_delta",
			Index: 0,
			Delta: types.AnthropicStreamDelta{
				Type: "text_delta",
				Text: content,
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
			// 安全地提取message字段
			messageData, ok := eventData["message"].(map[string]interface{})
			if !ok {
				return "", 0, fmt.Errorf("invalid message_start event: missing message field")
			}

			id, _ := messageData["id"].(string)
			model, _ := messageData["model"].(string)

			chunk := types.OpenAIStreamChunk{
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

		chunk := types.OpenAIStreamChunk{
			ID:      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
			Object:  "chat.completion.chunk",
			Created: time.Now().Unix(),
			Model:   "claude-sonnet-4-20250514", // 暂时硬编码
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

		result, err := json.Marshal(chunk)
		return string(result), 0, err

	case "message_stop":
		// 结束事件
		finishReason := "stop"
		chunk := types.OpenAIStreamChunk{
			ID:      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
			Object:  "chat.completion.chunk",
			Created: time.Now().Unix(),
			Model:   "claude-sonnet-4-20250514",
			Choices: []types.OpenAIStreamChoice{
				{
					Index:        0,
					Delta:        types.OpenAIStreamDelta{},
					FinishReason: &finishReason,
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
