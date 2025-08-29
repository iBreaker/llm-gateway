package converter

import (
	"bufio"
	"fmt"
	"io"
	"strings"
)

// ProcessSSEStream 处理SSE流的工具函数
// 解析SSE协议，委托给converter处理格式转换
func ProcessSSEStream(reader io.Reader, converter Converter, writer StreamWriter) error {
	supportNamedEvents := converter.GetFormat() == FormatAnthropic
	
	scanner := bufio.NewScanner(reader)

	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)

		if line == "" {
			continue
		}

		// 处理命名事件（Anthropic风格）
		if supportNamedEvents && strings.HasPrefix(line, "event: ") {
			eventType := line[7:] // 移除"event: "前缀
			
			// 读取下一行的data
			if scanner.Scan() {
				dataLine := scanner.Text()
				if strings.HasPrefix(dataLine, "data: ") {
					data := dataLine[6:]

					if err := processSSEEvent(eventType, []byte(data), converter, writer); err != nil {
						return err
					}

					if eventType == "message_stop" {
						return writer.WriteDone()
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

			if err := processSSEEvent("", []byte(data), converter, writer); err != nil {
				return err
			}
		}
	}

	return scanner.Err()
}

// processSSEEvent 处理单个SSE事件
func processSSEEvent(eventType string, data []byte, converter Converter, writer StreamWriter) error {
	// 调试：打印原始SSE数据
	if len(data) > 0 && len(data) < 1000 {
		fmt.Printf("[DEBUG SSE] eventType: %s, data: %s\n", eventType, string(data))
	}
	
	// 委托给转换器解析
	unifiedEvents, err := converter.ParseStreamEvent(eventType, data)
	if err != nil {
		return nil // 跳过无法解析的事件
	}

	// 处理每个统一格式事件
	for _, unifiedEvent := range unifiedEvents {
		if unifiedEvent != nil {
			// 创建一个包含统一事件的StreamChunk
			// 这样crossFormatWriter可以正确处理它
			chunk := &StreamChunk{
				EventType: eventType,
				Data:      unifiedEvent,
				IsDone:    unifiedEvent.IsDone,
			}
			
			if err := writer.WriteChunk(chunk); err != nil {
				return err
			}

			if unifiedEvent.IsDone {
				return writer.WriteDone()
			}
		}
	}
	
	return nil
}