package converter

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// TestStreamConsistency 测试流式响应的转换一致性
func TestStreamConsistency(t *testing.T) {
	testDir := "./testdata/stream"
	files, err := os.ReadDir(testDir)
	if err != nil {
		t.Fatalf("无法读取测试目录 %s: %v", testDir, err)
	}

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".txt") {
			continue
		}

		t.Run(file.Name(), func(t *testing.T) {
			filePath := filepath.Join(testDir, file.Name())

			// 解析文件名获取源格式和提供商信息
			sourceFormat, sourceProvider := parseStreamFileName(file.Name())

			// 确定目标格式（转换到另一种格式）
			var targetFormat RequestFormat
			if sourceFormat == FormatOpenAI {
				targetFormat = FormatAnthropic
			} else {
				targetFormat = FormatOpenAI
			}

			t.Logf("测试 %s: %s -> %s", file.Name(), sourceFormat, targetFormat)

			// 读取原始stream数据
			originalEvents, err := readStreamFile(filePath)
			if err != nil {
				t.Fatalf("读取stream文件失败: %v", err)
			}

			// 执行stream转换
			convertedEvents, err := convertStreamEvents(originalEvents, sourceProvider, targetFormat)
			if err != nil {
				t.Fatalf("转换stream失败: %v", err)
			}

			// 验证转换结果
			if err := validateStreamConversion(originalEvents, convertedEvents, sourceFormat, targetFormat); err != nil {
				t.Errorf("Stream转换验证失败: %v", err)
				t.Logf("原始事件数: %d", len(originalEvents))
				t.Logf("转换事件数: %d", len(convertedEvents))

				// 显示前几个事件用于调试
				for i, event := range convertedEvents {
					if i < 3 {
						t.Logf("转换事件[%d]: %s", i, event)
					}
				}
			}
		})
	}
}

// StreamEvent 表示一个SSE事件
type StreamEvent struct {
	EventType string // 对于Anthropic事件，为事件类型；对于OpenAI，为空
	Data      string // 事件数据
	Raw       string // 原始行内容
}

// parseStreamFileName 解析stream文件名获取格式和提供商信息
func parseStreamFileName(fileName string) (RequestFormat, types.Provider) {
	if strings.Contains(fileName, "openai") {
		return FormatOpenAI, types.ProviderOpenAI
	} else if strings.Contains(fileName, "anthropic") {
		return FormatAnthropic, types.ProviderAnthropic
	}
	return FormatOpenAI, types.ProviderOpenAI // 默认
}

// readStreamFile 读取stream文件内容
func readStreamFile(filePath string) ([]StreamEvent, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()

	var events []StreamEvent
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// 跳过空行
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "event: ") {
			// Anthropic风格的命名事件
			eventType := line[7:] // 移除"event: "前缀

			// 读取下一行的data
			if scanner.Scan() {
				dataLine := strings.TrimSpace(scanner.Text())
				if strings.HasPrefix(dataLine, "data: ") {
					data := dataLine[6:] // 移除"data: "前缀
					events = append(events, StreamEvent{
						EventType: eventType,
						Data:      data,
						Raw:       line + "\n" + dataLine,
					})
				}
			}
		} else if strings.HasPrefix(line, "data: ") {
			// OpenAI风格的数据事件
			data := line[6:] // 移除"data: "前缀
			events = append(events, StreamEvent{
				EventType: "",
				Data:      data,
				Raw:       line,
			})
		}
	}

	return events, scanner.Err()
}

// convertStreamEvents 转换stream事件
func convertStreamEvents(events []StreamEvent, sourceProvider types.Provider, targetFormat RequestFormat) ([]string, error) {
	converter := NewStreamEventConverter()
	var convertedEvents []string

	for i, event := range events {
		isFirst := (i == 0)

		var convertedEvent string
		var err error

		if event.Data == "[DONE]" {
			// 处理OpenAI的结束标记
			if targetFormat == FormatOpenAI {
				convertedEvent = "[DONE]"
			} else {
				// Anthropic格式不需要[DONE]，跳过
				continue
			}
		} else if event.EventType != "" {
			// 命名事件（Anthropic风格）
			convertedEvent, _, err = converter.ConvertNamedEvent(event.EventType, event.Data, targetFormat, isFirst)
		} else {
			// 数据事件（OpenAI风格）
			convertedEvent, _, err = converter.ConvertStreamEvent(event.Data, sourceProvider, targetFormat, isFirst)
		}

		if err != nil {
			return nil, fmt.Errorf("转换事件失败[%d]: %w", i, err)
		}

		// 只记录非空的转换结果
		if convertedEvent != "" {
			convertedEvents = append(convertedEvents, convertedEvent)
		}
	}

	return convertedEvents, nil
}

// validateStreamConversion 验证stream转换结果
func validateStreamConversion(originalEvents []StreamEvent, convertedEvents []string, sourceFormat, targetFormat RequestFormat) error {
	// 检查是否是空内容的情况
	hasRealContent := false
	for _, event := range originalEvents {
		if event.Data != "[DONE]" && strings.Contains(event.Data, `"content"`) && !strings.Contains(event.Data, `"content":""`) {
			hasRealContent = true
			break
		}
		if strings.Contains(event.Data, `"text"`) && !strings.Contains(event.Data, `"text":""`) {
			hasRealContent = true
			break
		}
	}

	// 基本验证：如果有实际内容，转换后应该有事件输出
	if len(convertedEvents) == 0 && hasRealContent {
		return fmt.Errorf("转换后没有生成任何事件，但原始事件包含内容")
	}

	// 如果没有实际内容且没有转换输出，这是可以接受的
	if len(convertedEvents) == 0 {
		return nil
	}

	// 检查第一个事件是否包含role信息（OpenAI格式要求）
	if targetFormat == FormatOpenAI && len(convertedEvents) > 0 {
		firstEvent := convertedEvents[0]
		if !strings.Contains(firstEvent, `"role":"assistant"`) {
			return fmt.Errorf("OpenAI格式的第一个事件应包含role信息")
		}
	}

	// 检查结束事件
	if targetFormat == FormatOpenAI {
		// OpenAI应该以[DONE]结束
		lastEvent := convertedEvents[len(convertedEvents)-1]
		if !strings.Contains(lastEvent, `"finish_reason"`) && lastEvent != "[DONE]" {
			return fmt.Errorf("OpenAI格式应该有finish_reason或[DONE]结束标记")
		}
	}

	// 验证JSON格式正确性
	for i, event := range convertedEvents {
		if event == "[DONE]" {
			continue // [DONE]不是JSON
		}

		// 检查是否是有效JSON（简单验证）
		if !strings.HasPrefix(event, "{") || !strings.HasSuffix(event, "}") {
			return fmt.Errorf("事件[%d]不是有效的JSON格式: %s", i, event)
		}
	}

	return nil
}

// TestStreamEventTypes 测试特定stream事件类型的处理
func TestStreamEventTypes(t *testing.T) {
	converter := NewStreamEventConverter()

	testCases := []struct {
		name         string
		eventType    string
		data         string
		targetFormat RequestFormat
		expectEmpty  bool
	}{
		{
			name:         "message_start到OpenAI",
			eventType:    "message_start",
			data:         `{"type":"message_start","message":{"id":"msg_123","model":"claude-3-sonnet"}}`,
			targetFormat: FormatOpenAI,
			expectEmpty:  false,
		},
		{
			name:         "content_block_delta到OpenAI",
			eventType:    "content_block_delta",
			data:         `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}`,
			targetFormat: FormatOpenAI,
			expectEmpty:  false,
		},
		{
			name:         "message_stop到OpenAI",
			eventType:    "message_stop",
			data:         `{"type":"message_stop"}`,
			targetFormat: FormatOpenAI,
			expectEmpty:  false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, _, err := converter.ConvertNamedEvent(tc.eventType, tc.data, tc.targetFormat, true)

			if err != nil {
				t.Errorf("转换失败: %v", err)
				return
			}

			if tc.expectEmpty && result != "" {
				t.Errorf("期望空结果，但得到: %s", result)
			}

			if !tc.expectEmpty && result == "" {
				t.Errorf("期望非空结果，但得到空字符串")
			}

			if result != "" {
				t.Logf("转换结果: %s", result)
			}
		})
	}
}

// TestStreamProcessor 测试完整的stream处理器
func TestStreamProcessor(t *testing.T) {
	converter := NewStreamEventConverter()
	processor := NewStreamResponseProcessor(converter)

	testCases := []struct {
		name         string
		input        string
		provider     types.Provider
		targetFormat RequestFormat
	}{
		{
			name: "OpenAI基本流处理",
			input: `data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: [DONE]`,
			provider:     types.ProviderOpenAI,
			targetFormat: FormatAnthropic,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			reader := strings.NewReader(tc.input)
			var events []string
			var totalTokens int

			err := processor.ProcessStream(reader, tc.provider, tc.targetFormat, func(event string, tokens int) {
				events = append(events, event)
				totalTokens += tokens
			})

			if err != nil {
				t.Errorf("处理stream失败: %v", err)
			}

			t.Logf("处理了 %d 个事件，总tokens: %d", len(events), totalTokens)
			for i, event := range events {
				t.Logf("事件[%d]: %s", i, event)
			}
		})
	}
}
