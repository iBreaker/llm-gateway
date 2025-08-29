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

	// 获取源格式转换器工厂和目标格式转换器工厂
	fromConverter, err := c.registry.Get(from)
	if err != nil {
		return fmt.Errorf("获取源格式转换器失败: %w", err)
	}

	toConverter, err := c.registry.Get(to)
	if err != nil {
		return fmt.Errorf("获取目标格式转换器失败: %w", err)
	}

	// 检查是否支持流式转换
	fromFactory, ok := fromConverter.(ConverterFactory)
	if !ok {
		return fmt.Errorf("源格式转换器不支持流式转换")
	}

	toFactory, ok := toConverter.(ConverterFactory)
	if !ok {
		return fmt.Errorf("目标格式转换器不支持流式转换")
	}

	// 为这个流创建新的转换器实例
	sourceStream := fromFactory.NewStreamConverter()
	targetStream := toFactory.NewStreamConverter()

	// 创建跨格式转换写入器
	crossWriter := &crossFormatWriter{
		sourceStream: sourceStream,
		targetStream: targetStream,
		targetWriter: writer,
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
	sourceStream StreamConverter
	targetStream StreamConverter
	targetWriter StreamWriter
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
		unifiedEvents, err = w.sourceStream.ParseStreamEvent(chunk.EventType, dataBytes)
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
		// 检查是否需要插入前置事件
		preEvents := w.targetStream.NeedPreEvents(unifiedEvent)
		for _, preEvent := range preEvents {
			result, err := w.targetStream.BuildStreamEvent(preEvent)
			if err != nil {
				return fmt.Errorf("构建前置事件失败: %w", err)
			}
			if result != nil {
				if err := w.targetWriter.WriteChunk(result); err != nil {
					return err
				}
			}
		}

		// 用目标转换器将统一格式转换为目标格式
		result, err := w.targetStream.BuildStreamEvent(unifiedEvent)
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
