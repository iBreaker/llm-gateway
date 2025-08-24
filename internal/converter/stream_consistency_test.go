package converter

import (
	"strings"
	"testing"
)

// TestStreamProcessorBasic 基础流处理器测试
func TestStreamProcessorBasic(t *testing.T) {
	// 测试OpenAI流处理器
	openaiProcessor := NewSSEStreamProcessor(FormatOpenAI)
	if openaiProcessor == nil {
		t.Error("OpenAI流处理器创建失败")
	}

	// 测试Anthropic流处理器
	anthropicProcessor := NewSSEStreamProcessor(FormatAnthropic)
	if anthropicProcessor == nil {
		t.Error("Anthropic流处理器创建失败")
	}

	// 基本格式检测
	if openaiProcessor.GetFormat() != FormatOpenAI {
		t.Errorf("OpenAI处理器格式错误，期望 %s，实际 %s", FormatOpenAI, openaiProcessor.GetFormat())
	}

	if anthropicProcessor.GetFormat() != FormatAnthropic {
		t.Errorf("Anthropic处理器格式错误，期望 %s，实际 %s", FormatAnthropic, anthropicProcessor.GetFormat())
	}
}

// TestStreamEventProcessing 流事件处理测试
func TestStreamEventProcessing(t *testing.T) {
	processor := NewSSEStreamProcessor(FormatOpenAI)

	// 测试基本JSON事件处理
	testData := `{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}`
	
	chunk, err := processor.ProcessEvent("", []byte(testData))
	if err != nil {
		t.Fatalf("处理事件失败: %v", err)
	}

	if chunk == nil {
		t.Fatal("处理结果为空")
	}

	// 验证基本属性
	if chunk.IsDone {
		t.Error("非结束事件被标记为完成")
	}
}

// TestStreamDataFlow 流数据流测试
func TestStreamDataFlow(t *testing.T) {
	// 简化的流数据测试
	testInput := `data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"},"index":0}]}

data: [DONE]

`
	
	reader := strings.NewReader(testInput)
	
	// 创建简单的收集器
	var events []string
	writer := &simpleTestWriter{events: &events}
	
	processor := NewSSEStreamProcessor(FormatOpenAI)
	err := processor.ProcessStream(reader, writer)
	
	if err != nil {
		t.Fatalf("流处理失败: %v", err)
	}

	if len(events) == 0 {
		t.Error("没有处理到任何事件")
	}

	t.Logf("处理了 %d 个事件", len(events))
}

// simpleTestWriter 简单的测试写入器
type simpleTestWriter struct {
	events *[]string
}

func (w *simpleTestWriter) WriteChunk(chunk *StreamChunk) error {
	if chunk.IsDone {
		*w.events = append(*w.events, "[DONE]")
	} else {
		*w.events = append(*w.events, "chunk")
	}
	return nil
}

func (w *simpleTestWriter) WriteDone() error {
	*w.events = append(*w.events, "[DONE]")
	return nil
}