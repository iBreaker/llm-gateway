package converter

import (
	"fmt"
	"io"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// Converter 格式转换器核心接口
type Converter interface {
	// GetFormat 获取转换器支持的格式
	GetFormat() Format
	
	// GetUpstreamPath 根据客户端端点获取上游路径
	GetUpstreamPath(clientEndpoint string) string
	
	// ParseRequest 解析请求到内部格式
	ParseRequest(data []byte) (*types.ProxyRequest, error)
	
	// BuildRequest 构建发送给上游的请求
	BuildRequest(request *types.ProxyRequest) ([]byte, error)
	
	// ParseResponse 解析上游响应到内部格式
	ParseResponse(data []byte) (*types.ProxyResponse, error)
	
	// BuildResponse 构建返回给客户端的响应
	BuildResponse(response *types.ProxyResponse) ([]byte, error)
	
	// CreateStreamProcessor 创建流式处理器
	CreateStreamProcessor() StreamProcessor
	
	// ValidateRequest 验证请求格式
	ValidateRequest(data []byte) error
	
	// ConvertStreamChunk 转换流数据块到目标格式
	ConvertStreamChunk(chunk *StreamChunk, targetFormat Format) (*StreamChunk, error)
}

// StreamProcessor 流式处理器接口
type StreamProcessor interface {
	// GetFormat 获取处理器格式
	GetFormat() Format
	
	// ProcessStream 处理流式响应
	ProcessStream(reader io.Reader, writer StreamWriter) error
	
	// ProcessEvent 处理单个流式事件
	ProcessEvent(eventType string, data []byte) (*StreamChunk, error)
	
	// Reset 重置处理器状态
	Reset()
}

// StreamWriter 流式写入器接口
type StreamWriter interface {
	WriteChunk(chunk *StreamChunk) error
	WriteDone() error
}

// StreamChunk 统一的流式数据块
type StreamChunk struct {
	EventType string      `json:"event_type,omitempty"` // Anthropic事件类型
	Data      interface{} `json:"data"`                 // 事件数据
	Tokens    int         `json:"tokens"`               // Token统计
	IsDone    bool        `json:"is_done"`              // 是否结束
}

// ConverterRegistry 转换器注册表接口
type ConverterRegistry interface {
	Register(format Format, converter Converter)
	Get(format Format) (Converter, error)
	GetAll() map[Format]Converter
}

// CrossConverter 跨格式转换器接口
type CrossConverter interface {
	// ConvertRequest 跨格式请求转换
	ConvertRequest(from, to Format, data []byte) ([]byte, error)
	
	// ConvertResponse 跨格式响应转换
	ConvertResponse(from, to Format, data []byte) ([]byte, error)
	
	// ConvertStream 跨格式流式转换
	ConvertStream(from, to Format, reader io.Reader, writer StreamWriter) error
}

// defaultConverterRegistry 默认注册表实现
type defaultConverterRegistry struct {
	converters map[Format]Converter
}

// NewConverterRegistry 创建转换器注册表
func NewConverterRegistry() ConverterRegistry {
	registry := &defaultConverterRegistry{
		converters: make(map[Format]Converter),
	}
	
	// 注册内置转换器
	registry.Register(FormatOpenAI, NewOpenAIConverter())
	registry.Register(FormatAnthropic, NewAnthropicConverter())
	
	return registry
}

// Register 注册转换器
func (r *defaultConverterRegistry) Register(format Format, converter Converter) {
	r.converters[format] = converter
}

// Get 获取转换器
func (r *defaultConverterRegistry) Get(format Format) (Converter, error) {
	converter, exists := r.converters[format]
	if !exists {
		return nil, fmt.Errorf("不支持的格式: %s", format)
	}
	return converter, nil
}

// GetAll 获取所有转换器
func (r *defaultConverterRegistry) GetAll() map[Format]Converter {
	result := make(map[Format]Converter)
	for k, v := range r.converters {
		result[k] = v
	}
	return result
}