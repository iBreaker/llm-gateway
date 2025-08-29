package converter

import (
	"encoding/json"
	"fmt"
	"io"
)

// crossConverter 跨格式转换器实现
type crossConverter struct {
	registry ConverterRegistry
}

// NewCrossConverter 创建跨格式转换器
func NewCrossConverter(registry ConverterRegistry) CrossConverter {
	return &crossConverter{
		registry: registry,
	}
}

// ConvertRequest 跨格式请求转换
func (c *crossConverter) ConvertRequest(from, to Format, data []byte) ([]byte, error) {
	// 如果格式相同，直接返回
	if from == to {
		return data, nil
	}

	// 获取源格式转换器
	fromConverter, err := c.registry.Get(from)
	if err != nil {
		return nil, fmt.Errorf("获取源格式转换器失败: %w", err)
	}

	// 获取目标格式转换器
	toConverter, err := c.registry.Get(to)
	if err != nil {
		return nil, fmt.Errorf("获取目标格式转换器失败: %w", err)
	}

	// 解析请求到内部格式
	request, err := fromConverter.ParseRequest(data)
	if err != nil {
		return nil, fmt.Errorf("解析源格式请求失败: %w", err)
	}

	// 构建目标格式请求
	result, err := toConverter.BuildRequest(request)
	if err != nil {
		return nil, fmt.Errorf("构建目标格式请求失败: %w", err)
	}

	return result, nil
}

// ConvertResponse 跨格式响应转换
func (c *crossConverter) ConvertResponse(from, to Format, data []byte) ([]byte, error) {
	// 如果格式相同，直接返回
	if from == to {
		return data, nil
	}

	// 获取源格式转换器
	fromConverter, err := c.registry.Get(from)
	if err != nil {
		return nil, fmt.Errorf("获取源格式转换器失败: %w", err)
	}

	// 获取目标格式转换器
	toConverter, err := c.registry.Get(to)
	if err != nil {
		return nil, fmt.Errorf("获取目标格式转换器失败: %w", err)
	}

	// 解析响应到内部格式
	response, err := fromConverter.ParseResponse(data)
	if err != nil {
		return nil, fmt.Errorf("解析源格式响应失败: %w", err)
	}

	// 构建目标格式响应
	result, err := toConverter.BuildResponse(response)
	if err != nil {
		return nil, fmt.Errorf("构建目标格式响应失败: %w", err)
	}

	return result, nil
}

// ConvertStream 跨格式流式转换
func (c *crossConverter) ConvertStream(from, to Format, reader io.Reader, writer StreamWriter) error {
	// 如果格式相同，直接转发
	if from == to {
		return c.forwardStream(from, reader, writer)
	}

	// 获取源格式转换器和目标格式转换器
	fromConverter, err := c.registry.Get(from)
	if err != nil {
		return fmt.Errorf("获取源格式转换器失败: %w", err)
	}

	toConverter, err := c.registry.Get(to)
	if err != nil {
		return fmt.Errorf("获取目标格式转换器失败: %w", err)
	}

	// 创建跨格式转换写入器
	crossWriter := &crossFormatWriter{
		sourceConverter: fromConverter,
		targetConverter: toConverter,
		targetWriter:    writer,
		streamState:     &StreamState{}, // 每个流式请求创建新的状态
	}

	// 使用SSE工具函数处理流式转换
	return ProcessSSEStream(reader, fromConverter, crossWriter)
}

// forwardStream 直接转发流
func (c *crossConverter) forwardStream(from Format, reader io.Reader, writer StreamWriter) error {
	// 获取转换器用于格式处理
	converter, err := c.registry.Get(from)
	if err != nil {
		return fmt.Errorf("获取转换器失败: %w", err)
	}

	// 直接使用SSE工具函数转发
	return ProcessSSEStream(reader, converter, writer)
}

// crossFormatWriter 跨格式流写入器
type crossFormatWriter struct {
	sourceConverter Converter
	targetConverter Converter
	targetWriter    StreamWriter
	streamState     *StreamState
}

// StreamState 流式转换状态
type StreamState struct {
	messageStartSent      bool
	contentBlockStartSent bool
	currentToolID         string // 当前工具调用的ID
	currentToolName       string // 当前工具调用的名称
}

// WriteChunk 写入转换后的数据块
func (w *crossFormatWriter) WriteChunk(chunk *StreamChunk) error {
	var unifiedEvents []*UnifiedStreamEvent
	
	// 检查chunk.Data是否已经是UnifiedStreamEvent
	if unifiedEvent, ok := chunk.Data.(*UnifiedStreamEvent); ok {
		// 数据已经是统一格式，直接使用
		unifiedEvents = []*UnifiedStreamEvent{unifiedEvent}
	} else {
		// 需要解析原始数据
		dataBytes, err := json.Marshal(chunk.Data)
		if err != nil {
			return fmt.Errorf("序列化流事件数据失败: %w", err)
		}

		// 先用源转换器将StreamChunk解析为统一格式
		unifiedEvents, err = w.sourceConverter.ParseStreamEvent(chunk.EventType, dataBytes)
		if err != nil {
			return fmt.Errorf("解析源格式流事件失败: %w", err)
		}
	}

	// 如果解析结果为nil或空，跳过此事件
	if len(unifiedEvents) == 0 {
		return nil
	}

	// 处理每个统一格式事件
	for _, unifiedEvent := range unifiedEvents {
		fmt.Printf("[DEBUG cross_converter] Processing unified event: Type=%v\n", unifiedEvent.Type)
		if unifiedEvent.Content != nil {
			fmt.Printf("[DEBUG cross_converter] Event content: Type=%s, ToolID=%s, ToolName=%s\n", 
				unifiedEvent.Content.Type, unifiedEvent.Content.ToolID, unifiedEvent.Content.ToolName)
		}
		
		// 检查是否需要插入前置事件（针对Anthropic目标格式）
		if w.targetConverter.GetFormat() == FormatAnthropic {
			if unifiedEvent.Type == StreamEventContentDelta {
				// 如果还没发送message_start，先发送
				if !w.streamState.messageStartSent {
					w.streamState.messageStartSent = true
					messageStartEvent := &UnifiedStreamEvent{
						Type:      StreamEventMessageStart,
						MessageID: "auto-generated-id", 
						Model:     "unknown-model",
						IsDone:    false,
					}
					fmt.Printf("[DEBUG cross_converter] Auto-generating message_start\n")
					result, err := w.targetConverter.BuildStreamEvent(messageStartEvent)
					if err != nil {
						return fmt.Errorf("构建message_start事件失败: %w", err)
					}
					if result != nil {
						if err := w.targetWriter.WriteChunk(result); err != nil {
							return err
						}
					}
				}
				
				// 如果还没发送content_block_start，先发送
				if !w.streamState.contentBlockStartSent {
					w.streamState.contentBlockStartSent = true
					
					// 安全地获取内容类型和索引
					contentType := "text" // 默认类型
					contentIndex := 0     // 默认索引
					toolID := ""
					toolName := ""
					
					if unifiedEvent.Content != nil {
						contentType = unifiedEvent.Content.Type
						contentIndex = unifiedEvent.Content.Index
						// 如果是工具调用，使用保存的工具信息或从当前事件获取
						if contentType == "tool_use" {
							// 优先使用保存的工具信息（从之前的ContentStart事件）
							if w.streamState.currentToolID != "" {
								toolID = w.streamState.currentToolID
							} else if unifiedEvent.Content.ToolID != "" {
								toolID = unifiedEvent.Content.ToolID
							}
							
							if w.streamState.currentToolName != "" {
								toolName = w.streamState.currentToolName
							} else if unifiedEvent.Content.ToolName != "" {
								toolName = unifiedEvent.Content.ToolName
							}
							
							fmt.Printf("[DEBUG cross_converter] Auto-generating ContentStart for tool: ID=%s, Name=%s (from state: ID=%s, Name=%s)\n",
								toolID, toolName, w.streamState.currentToolID, w.streamState.currentToolName)
						}
					}
					
					contentStartEvent := &UnifiedStreamEvent{
						Type: StreamEventContentStart,
						Content: &UnifiedStreamContent{
							Type:     contentType,
							Text:     "",
							Index:    contentIndex,
							ToolID:   toolID,
							ToolName: toolName,
						},
						IsDone: false,
					}
					result, err := w.targetConverter.BuildStreamEvent(contentStartEvent)
					if err != nil {
						return fmt.Errorf("构建content_block_start事件失败: %w", err)
					}
					if result != nil {
						if err := w.targetWriter.WriteChunk(result); err != nil {
							return err
						}
					}
				}
			} else if unifiedEvent.Type == StreamEventMessageStart {
				w.streamState.messageStartSent = true
			} else if unifiedEvent.Type == StreamEventContentStart {
				// 如果还没发送message_start，先发送
				if !w.streamState.messageStartSent {
					w.streamState.messageStartSent = true
					messageStartEvent := &UnifiedStreamEvent{
						Type:      StreamEventMessageStart,
						MessageID: "auto-generated-id", 
						Model:     "unknown-model",
						IsDone:    false,
					}
					fmt.Printf("[DEBUG cross_converter] Auto-generating message_start before ContentStart\n")
					result, err := w.targetConverter.BuildStreamEvent(messageStartEvent)
					if err != nil {
						return fmt.Errorf("构建message_start事件失败: %w", err)
					}
					if result != nil {
						if err := w.targetWriter.WriteChunk(result); err != nil {
							return err
						}
					}
				}
				
				// 标记已发送，防止后续ContentDelta重复生成
				w.streamState.contentBlockStartSent = true
				// 如果是工具调用，保存工具信息以供后续使用
				if unifiedEvent.Content != nil && unifiedEvent.Content.Type == "tool_use" {
					w.streamState.currentToolID = unifiedEvent.Content.ToolID
					w.streamState.currentToolName = unifiedEvent.Content.ToolName
					fmt.Printf("[DEBUG cross_converter] Received ContentStart from OpenAI: ID=%s, Name=%s\n", 
						w.streamState.currentToolID, w.streamState.currentToolName)
				}
				// ContentStart事件需要继续处理，发送给目标转换器
			}
		}
		
		// 用目标转换器将统一格式转换为目标格式
		result, err := w.targetConverter.BuildStreamEvent(unifiedEvent)
		if err != nil {
			return fmt.Errorf("构建目标格式流事件失败: %w", err)
		}

		// 如果结果不为nil，写入目标写入器
		if result != nil {
			if err := w.targetWriter.WriteChunk(result); err != nil {
				return err
			}
		}
	}

	return nil
}

// WriteDone 写入完成信号
func (w *crossFormatWriter) WriteDone() error {
	return w.targetWriter.WriteDone()
}