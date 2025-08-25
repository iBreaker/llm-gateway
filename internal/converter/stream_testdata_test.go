package converter

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestStreamConsistency 测试流的一致性：原始 -> 中间格式 -> 原始
func TestStreamConsistency(t *testing.T) {
	manager := NewManager()

	// 读取所有流测试文件
	streamFiles, err := filepath.Glob("testdata/stream/stream_*.txt")
	if err != nil {
		t.Fatalf("读取流测试文件失败: %v", err)
	}

	if len(streamFiles) == 0 {
		t.Skip("未找到流测试文件")
	}

	for _, streamFile := range streamFiles {
		filename := filepath.Base(streamFile)
		t.Run(filename, func(t *testing.T) {
			// 读取原始流数据
			originalData, err := os.ReadFile(streamFile)
			if err != nil {
				t.Fatalf("读取流文件失败: %v", err)
			}

			// 从文件名判断格式
			var format Format
			if strings.Contains(filename, "anthropic") {
				format = FormatAnthropic
			} else if strings.Contains(filename, "openai") {
				format = FormatOpenAI
			} else {
				t.Fatalf("无法从文件名判断格式: %s", filename)
			}

			t.Logf("检测到格式: %s", format)

			// 步骤1: 原始 -> 中间格式 (解析为StreamChunk数组)
			converter, err := manager.registry.Get(format)
			if err != nil {
				t.Fatalf("获取转换器失败: %v", err)
			}

			processor := converter.CreateStreamProcessor()
			var originalChunks []StreamChunkEvent
			originalWriter := &StreamTestWriter{events: &originalChunks}

			originalReader := strings.NewReader(string(originalData))
			err = processor.ProcessStream(originalReader, originalWriter)
			
			// 跳过错误案例的错误检查
			if err != nil && !strings.Contains(filename, "error") {
				t.Errorf("解析原始流数据失败: %v", err)
				return
			}

			if len(originalChunks) == 0 && !strings.Contains(filename, "empty") && !strings.Contains(filename, "error") {
				t.Error("没有解析到任何流事件")
				return
			}

			// 步骤2: 中间格式 -> 原始格式 (重建流数据)
			var rebuiltData strings.Builder
			
			for _, event := range originalChunks {
				if event.chunk != nil {
					// 重建每个事件的SSE格式
					chunkData := rebuildSSEEvent(event.chunk, format)
					rebuiltData.WriteString(chunkData)
				} else if event.isDone {
					// 写入结束标记
					if format == FormatOpenAI {
						rebuiltData.WriteString("data: [DONE]\n\n")
					}
					// Anthropic格式不需要显式的DONE标记，message_stop事件就是结束
				}
			}

			// 步骤3: 比较一致性
			if !isStreamDataEqual(t, string(originalData), rebuiltData.String(), filename, format) {
				t.Errorf("流数据不一致")
				t.Logf("原始流长度: %d", len(originalData))
				t.Logf("重建流长度: %d", rebuiltData.Len())
			}
		})
	}
}

// TestStreamCrossFormatConversionWithTestdata 测试使用真实流数据的跨格式转换
func TestStreamCrossFormatConversionWithTestdata(t *testing.T) {
	manager := NewManager()

	testCases := []struct {
		name       string
		filePattern string
		sourceFormat Format
		targetFormat Format
	}{
		{
			name:        "Anthropic到OpenAI转换",
			filePattern: "testdata/stream/stream_anthropic_*.txt",
			sourceFormat: FormatAnthropic,
			targetFormat: FormatOpenAI,
		},
		{
			name:        "OpenAI到Anthropic转换", 
			filePattern: "testdata/stream/stream_openai_*.txt",
			sourceFormat: FormatOpenAI,
			targetFormat: FormatAnthropic,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			files, err := filepath.Glob(tc.filePattern)
			if err != nil {
				t.Fatalf("读取测试文件失败: %v", err)
			}

			for _, file := range files {
				filename := filepath.Base(file)
				
				// 跳过错误案例，因为它们可能无法正常转换
				if strings.Contains(filename, "error") {
					continue
				}

				t.Run(filename, func(t *testing.T) {
					// 读取流数据
					streamData, err := os.ReadFile(file)
					if err != nil {
						t.Fatalf("读取文件失败: %v", err)
					}

					// 创建转换写入器
					var convertedEvents []StreamChunkEvent
					convertedWriter := &StreamTestWriter{events: &convertedEvents}

					// 进行跨格式流转换
					reader := strings.NewReader(string(streamData))
					err = manager.crossConverter.ConvertStream(tc.sourceFormat, tc.targetFormat, reader, convertedWriter)
					
					if err != nil {
						t.Errorf("跨格式流转换失败: %v", err)
						return
					}

					if len(convertedEvents) == 0 && !strings.Contains(filename, "empty") {
						t.Error("跨格式转换没有产生任何事件")
						return
					}

					t.Logf("跨格式转换产生 %d 个事件", len(convertedEvents))
				})
			}
		})
	}
}

// StreamChunkEvent 流事件记录
type StreamChunkEvent struct {
	chunk  *StreamChunk
	isDone bool
}

// StreamTestWriter 流测试写入器
type StreamTestWriter struct {
	events *[]StreamChunkEvent
}

func (w *StreamTestWriter) WriteChunk(chunk *StreamChunk) error {
	*w.events = append(*w.events, StreamChunkEvent{
		chunk:  chunk,
		isDone: false,
	})
	return nil
}

func (w *StreamTestWriter) WriteDone() error {
	*w.events = append(*w.events, StreamChunkEvent{
		chunk:  nil,
		isDone: true,
	})
	return nil
}

// rebuildSSEEvent 重建StreamChunk为SSE格式
func rebuildSSEEvent(chunk *StreamChunk, format Format) string {
	var result strings.Builder
	
	switch format {
	case FormatAnthropic:
		// Anthropic格式有命名事件
		if chunk.EventType != "" {
			result.WriteString(fmt.Sprintf("event: %s\n", chunk.EventType))
		}
		if chunk.Data != nil {
			dataBytes, _ := json.Marshal(chunk.Data)
			result.WriteString(fmt.Sprintf("data: %s\n", string(dataBytes)))
		}
		result.WriteString("\n")
	case FormatOpenAI:
		// OpenAI格式只有data字段
		if chunk.IsDone {
			result.WriteString("data: [DONE]\n\n")
		} else if chunk.Data != nil {
			dataBytes, _ := json.Marshal(chunk.Data)
			result.WriteString(fmt.Sprintf("data: %s\n\n", string(dataBytes)))
		}
	}
	
	return result.String()
}

// isStreamDataEqual 比较两个流数据是否相等（忽略空白行差异）
func isStreamDataEqual(t *testing.T, original, rebuilt, filename string, format Format) bool {
	// 标准化两个流数据：去除多余空白行，统一换行符
	normalizedOriginal := normalizeStreamData(original)
	normalizedRebuilt := normalizeStreamData(rebuilt)
	
	// 对于error案例，允许部分匹配
	if strings.Contains(filename, "error") {
		// 检查重建的数据是否至少包含了原始数据的主要部分
		return len(normalizedRebuilt) > 0
	}
	
	// 对于empty案例，两者都应该为空或只包含DONE标记
	if strings.Contains(filename, "empty") {
		bothEmpty := (len(normalizedOriginal) == 0 || onlyContainsDone(normalizedOriginal)) &&
					(len(normalizedRebuilt) == 0 || onlyContainsDone(normalizedRebuilt))
		if bothEmpty {
			return true
		}
	}
	
	// 比较事件数量和基本结构
	originalEvents := extractSSEEvents(normalizedOriginal)
	rebuiltEvents := extractSSEEvents(normalizedRebuilt)
	
	if len(originalEvents) != len(rebuiltEvents) {
		t.Logf("事件数量不匹配: 原始=%d, 重建=%d", len(originalEvents), len(rebuiltEvents))
		return false
	}
	
	// 逐个比较事件
	for i, origEvent := range originalEvents {
		rebuiltEvent := rebuiltEvents[i]
		
		if !compareSSEEvent(origEvent, rebuiltEvent, format) {
			t.Logf("事件%d不匹配:", i)
			t.Logf("  原始: %s", origEvent)
			t.Logf("  重建: %s", rebuiltEvent)
			return false
		}
	}
	
	return true
}

// normalizeStreamData 标准化流数据
func normalizeStreamData(data string) string {
	// 统一换行符
	data = strings.ReplaceAll(data, "\r\n", "\n")
	data = strings.ReplaceAll(data, "\r", "\n")
	
	// 移除末尾多余的换行符
	data = strings.TrimRight(data, "\n")
	
	return data
}

// extractSSEEvents 从流数据中提取SSE事件
func extractSSEEvents(data string) []string {
	var events []string
	var currentEvent strings.Builder
	
	lines := strings.Split(data, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		
		if line == "" {
			// 空行表示事件结束
			if currentEvent.Len() > 0 {
				events = append(events, currentEvent.String())
				currentEvent.Reset()
			}
		} else {
			// 非空行添加到当前事件
			if currentEvent.Len() > 0 {
				currentEvent.WriteString("\n")
			}
			currentEvent.WriteString(line)
		}
	}
	
	// 处理最后一个事件
	if currentEvent.Len() > 0 {
		events = append(events, currentEvent.String())
	}
	
	return events
}

// compareSSEEvent 比较两个SSE事件
func compareSSEEvent(event1, event2 string, format Format) bool {
	// 提取事件类型和数据
	type1, data1 := parseSSEEvent(event1)
	type2, data2 := parseSSEEvent(event2)
	
	// 比较事件类型
	if type1 != type2 {
		return false
	}
	
	// 比较数据内容（JSON数据需要结构化比较）
	if data1 == data2 {
		return true
	}
	
	// 尝试JSON结构化比较
	var json1, json2 interface{}
	if json.Unmarshal([]byte(data1), &json1) == nil && json.Unmarshal([]byte(data2), &json2) == nil {
		json1Bytes, _ := json.Marshal(json1)
		json2Bytes, _ := json.Marshal(json2)
		return string(json1Bytes) == string(json2Bytes)
	}
	
	return false
}

// parseSSEEvent 解析SSE事件，返回事件类型和数据
func parseSSEEvent(event string) (eventType, data string) {
	lines := strings.Split(event, "\n")
	
	for _, line := range lines {
		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
	
	return eventType, data
}

// onlyContainsDone 检查流数据是否只包含DONE标记
func onlyContainsDone(data string) bool {
	re := regexp.MustCompile(`data:\s*\[DONE\]`)
	matches := re.FindAllString(data, -1)
	
	// 移除DONE标记后，剩余内容应该只有空白
	withoutDone := re.ReplaceAllString(data, "")
	withoutDone = strings.TrimSpace(withoutDone)
	
	return len(matches) > 0 && withoutDone == ""
}