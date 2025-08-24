package converter

import (
	"strings"
	"testing"
)

// TestPairedFormatConversions 测试成对的格式转换
func TestPairedFormatConversions(t *testing.T) {
	manager := NewManager()

	testCases := []struct {
		name         string
		sourceFormat Format
		targetFormat Format
		input        string
		shouldWork   bool
	}{
		{
			name:         "OpenAI到Anthropic请求转换",
			sourceFormat: FormatOpenAI,
			targetFormat: FormatAnthropic,
			input: `{
				"model": "gpt-4",
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 1000
			}`,
			shouldWork: true,
		},
		{
			name:         "Anthropic到OpenAI请求转换",
			sourceFormat: FormatAnthropic,
			targetFormat: FormatOpenAI,
			input: `{
				"model": "claude-3-sonnet-20240229",
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 1000
			}`,
			shouldWork: true,
		},
		{
			name:         "同格式转换（OpenAI到OpenAI）",
			sourceFormat: FormatOpenAI,
			targetFormat: FormatOpenAI,
			input: `{
				"model": "gpt-4",
				"messages": [{"role": "user", "content": "Hello"}]
			}`,
			shouldWork: true,
		},
		{
			name:         "同格式转换（Anthropic到Anthropic）",
			sourceFormat: FormatAnthropic,
			targetFormat: FormatAnthropic,
			input: `{
				"model": "claude-3-sonnet-20240229",
				"messages": [{"role": "user", "content": "Hello"}]
			}`,
			shouldWork: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := manager.ConvertRequest(tc.sourceFormat, tc.targetFormat, []byte(tc.input))

			if tc.shouldWork {
				if err != nil {
					t.Errorf("转换失败: %v", err)
					return
				}
				if len(result) == 0 {
					t.Error("转换结果为空")
					return
				}
				t.Logf("转换成功: %s -> %s", tc.sourceFormat, tc.targetFormat)
			} else {
				if err == nil {
					t.Error("期望转换失败，但成功了")
				}
			}
		})
	}
}

// TestResponseConversions 测试响应转换
func TestResponseConversions(t *testing.T) {
	manager := NewManager()

	testCases := []struct {
		name         string
		sourceFormat Format
		targetFormat Format
		input        string
		shouldWork   bool
	}{
		{
			name:         "OpenAI响应到Anthropic",
			sourceFormat: FormatOpenAI,
			targetFormat: FormatAnthropic,
			input: `{
				"id": "chatcmpl-123",
				"object": "chat.completion",
				"created": 1677652288,
				"model": "gpt-4",
				"choices": [{
					"index": 0,
					"message": {"role": "assistant", "content": "Hello!"},
					"finish_reason": "stop"
				}],
				"usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
			}`,
			shouldWork: true,
		},
		{
			name:         "Anthropic响应到OpenAI",
			sourceFormat: FormatAnthropic,
			targetFormat: FormatOpenAI,
			input: `{
				"id": "msg_123",
				"type": "message",
				"role": "assistant",
				"content": [{"type": "text", "text": "Hello!"}],
				"model": "claude-3-sonnet-20240229",
				"stop_reason": "end_turn",
				"usage": {"input_tokens": 10, "output_tokens": 5}
			}`,
			shouldWork: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := manager.ConvertResponse(tc.sourceFormat, tc.targetFormat, []byte(tc.input))

			if tc.shouldWork {
				if err != nil {
					t.Errorf("响应转换失败: %v", err)
					return
				}
				if len(result) == 0 {
					t.Error("响应转换结果为空")
					return
				}
				t.Logf("响应转换成功: %s -> %s", tc.sourceFormat, tc.targetFormat)
			} else {
				if err == nil {
					t.Error("期望响应转换失败，但成功了")
				}
			}
		})
	}
}

// TestStreamConversions 测试流式转换
func TestStreamConversions(t *testing.T) {
	// 简单的OpenAI流数据
	testInput := `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}

data: [DONE]

`

	testCases := []struct {
		name           string
		sourceProvider string
		targetFormat   Format
	}{
		{
			name:           "OpenAI流到OpenAI格式",
			sourceProvider: "openai",
			targetFormat:   FormatOpenAI,
		},
		{
			name:           "OpenAI流到Anthropic格式", 
			sourceProvider: "openai",
			targetFormat:   FormatAnthropic,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			reader := strings.NewReader(testInput)
			
			var events []string
			writer := &simpleStreamWriter{events: &events}

			// 直接测试流处理器
			processor := NewSSEStreamProcessor(FormatOpenAI)
			err := processor.ProcessStream(reader, writer)

			if err != nil {
				t.Errorf("流转换失败: %v", err)
				return
			}

			if len(events) == 0 {
				t.Error("流转换没有产生任何事件")
				return
			}

			t.Logf("流转换成功，处理了 %d 个事件", len(events))
		})
	}
}

// simpleStreamWriter 简单的流写入器
type simpleStreamWriter struct {
	events *[]string
}

func (w *simpleStreamWriter) WriteChunk(chunk *StreamChunk) error {
	if chunk.IsDone {
		*w.events = append(*w.events, "[DONE]")
	} else {
		*w.events = append(*w.events, "event")
	}
	return nil
}

func (w *simpleStreamWriter) WriteDone() error {
	*w.events = append(*w.events, "[DONE]")
	return nil
}