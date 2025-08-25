package converter

import (
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

	// 获取源格式流处理器
	fromConverter, err := c.registry.Get(from)
	if err != nil {
		return fmt.Errorf("获取源格式转换器失败: %w", err)
	}

	fromProcessor := fromConverter.CreateStreamProcessor()

	// 创建转换写入器
	convertWriter := &convertStreamWriter{
		sourceConverter: fromConverter,
		targetWriter:    writer,
		targetFormat:    to,
	}

	// 处理流式转换
	return fromProcessor.ProcessStream(reader, convertWriter)
}

// forwardStream 直接转发流
func (c *crossConverter) forwardStream(from Format, reader io.Reader, writer StreamWriter) error {
	// 创建简单的转发写入器
	forwardWriter := &forwardStreamWriter{writer: writer}
	
	// 使用相应格式的SSE处理器处理流
	processor := NewSSEStreamProcessor(from)
	return processor.ProcessStream(reader, forwardWriter)
}

// convertStreamWriter 转换流写入器
type convertStreamWriter struct {
	sourceConverter Converter
	targetWriter    StreamWriter
	targetFormat    Format
}

// WriteChunk 写入转换后的数据块
func (w *convertStreamWriter) WriteChunk(chunk *StreamChunk) error {
	// 根据目标格式转换数据块
	convertedChunk, err := w.convertChunk(chunk)
	if err != nil {
		return err
	}
	
	if convertedChunk != nil {
		return w.targetWriter.WriteChunk(convertedChunk)
	}
	
	return nil
}

// WriteDone 写入完成信号
func (w *convertStreamWriter) WriteDone() error {
	return w.targetWriter.WriteDone()
}

// convertChunk 转换数据块格式
func (w *convertStreamWriter) convertChunk(chunk *StreamChunk) (*StreamChunk, error) {
	// 使用源格式converter进行格式转换
	return w.sourceConverter.ConvertStreamChunk(chunk, w.targetFormat)
}

// forwardStreamWriter 转发流写入器
type forwardStreamWriter struct {
	writer StreamWriter
}

// WriteChunk 直接转发数据块
func (w *forwardStreamWriter) WriteChunk(chunk *StreamChunk) error {
	return w.writer.WriteChunk(chunk)
}

// WriteDone 转发完成信号
func (w *forwardStreamWriter) WriteDone() error {
	return w.writer.WriteDone()
}