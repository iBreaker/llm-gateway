package converter

import (
	"bufio"
	"encoding/json"
	"io"
	"strings"
)

// SSEStreamProcessor 通用SSE流处理器
type SSEStreamProcessor struct {
	format             Format
	supportNamedEvents bool // 是否支持 event: 行（Anthropic风格）
	totalTokens        int
	currentModel       string
	messageID          string
}

// NewSSEStreamProcessor 创建通用SSE流处理器
func NewSSEStreamProcessor(format Format) *SSEStreamProcessor {
	return &SSEStreamProcessor{
		format:             format,
		supportNamedEvents: format == FormatAnthropic, // 只有Anthropic支持命名事件
		totalTokens:        0,
	}
}

// GetFormat 获取处理器格式
func (p *SSEStreamProcessor) GetFormat() Format {
	return p.format
}

// ProcessStream 处理完整的流式响应
func (p *SSEStreamProcessor) ProcessStream(reader io.Reader, writer StreamWriter) error {
	scanner := bufio.NewScanner(reader)
	firstEvent := true

	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)

		if line == "" {
			continue
		}

		// 处理命名事件（Anthropic风格）
		if p.supportNamedEvents && strings.HasPrefix(line, "event: ") {
			eventType := line[7:] // 移除"event: "前缀
			
			// 读取下一行的data
			if scanner.Scan() {
				dataLine := scanner.Text()
				if strings.HasPrefix(dataLine, "data: ") {
					data := dataLine[6:]

					// 处理事件
					chunk, err := p.ProcessEvent(eventType, []byte(data))
					if err != nil {
						continue
					}

					if chunk != nil {
						chunk.IsDone = (eventType == "message_stop")
						
						if err := writer.WriteChunk(chunk); err != nil {
							return err
						}

						if eventType == "message_stop" {
							return writer.WriteDone()
						}
					}
				}
			}
		} else if strings.HasPrefix(line, "data: ") {
			// 处理SSE数据行
			data := line[6:] // 移除"data: "前缀

			// 处理结束标记
			if data == "[DONE]" {
				return writer.WriteDone()
			}

			// 解析并处理事件
			chunk, err := p.ProcessEvent("", []byte(data))
			if err != nil {
				continue // 跳过错误事件
			}

			if chunk != nil {
				chunk.IsDone = false
				if firstEvent {
					firstEvent = false
				}
				
				if err := writer.WriteChunk(chunk); err != nil {
					return err
				}
			}
		}
	}

	return scanner.Err()
}

// ProcessEvent 处理单个流式事件
func (p *SSEStreamProcessor) ProcessEvent(eventType string, data []byte) (*StreamChunk, error) {
	var eventData map[string]interface{}
	if err := json.Unmarshal(data, &eventData); err != nil {
		return nil, err
	}

	// 提取token统计
	tokens := p.extractTokens(eventData)
	if tokens > 0 {
		p.totalTokens += tokens
	}

	// 保存消息信息（主要用于Anthropic格式）
	if eventType == "message_start" {
		if messageData, ok := eventData["message"].(map[string]interface{}); ok {
			if id, exists := messageData["id"]; exists {
				p.messageID = getString(id)
			}
			if model, exists := messageData["model"]; exists {
				p.currentModel = getString(model)
			}
		}
	}

	return &StreamChunk{
		EventType: eventType,
		Data:      eventData,
		Tokens:    tokens,
		IsDone:    eventType == "message_stop",
	}, nil
}

// Reset 重置处理器状态
func (p *SSEStreamProcessor) Reset() {
	p.totalTokens = 0
	p.currentModel = ""
	p.messageID = ""
}

// extractTokens 从事件中提取token统计
func (p *SSEStreamProcessor) extractTokens(eventData map[string]interface{}) int {
	if usage, ok := eventData["usage"].(map[string]interface{}); ok {
		// Anthropic风格
		if total, ok := usage["total_tokens"].(float64); ok {
			return int(total)
		}
		if output, ok := usage["output_tokens"].(float64); ok {
			return int(output)
		}
		if input, ok := usage["input_tokens"].(float64); ok {
			return int(input)
		}

		// OpenAI风格
		if completion, ok := usage["completion_tokens"].(float64); ok {
			return int(completion)
		}
	}

	// 尝试从choices中的usage提取（OpenAI）
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

// getString 安全地获取字符串值
func getString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}