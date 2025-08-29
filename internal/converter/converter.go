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
	ParseRequest(data []byte) (*types.UnifiedRequest, error)

	// BuildRequest 构建发送给上游的请求
	BuildRequest(request *types.UnifiedRequest) ([]byte, error)

	// ParseResponse 解析上游响应到内部格式
	ParseResponse(data []byte) (*types.UnifiedResponse, error)

	// BuildResponse 构建返回给客户端的响应
	BuildResponse(response *types.UnifiedResponse) ([]byte, error)

	// ParseStreamEvent 解析流式事件到统一内部格式
	ParseStreamEvent(eventType string, data []byte) ([]*UnifiedStreamEvent, error)

	// BuildStreamEvent 从统一内部格式构建流式事件
	BuildStreamEvent(event *UnifiedStreamEvent) (*StreamChunk, error)

	// ValidateRequest 验证请求格式
	ValidateRequest(data []byte) error
}


// StreamWriter 流式写入器接口
type StreamWriter interface {
	WriteChunk(chunk *StreamChunk) error
	WriteDone() error
}

// StreamChunk 统一的流式数据块
// StreamEventType 统一流式事件类型
type StreamEventType int

const (
	StreamEventUnknown StreamEventType = iota
	StreamEventMessageStart
	StreamEventContentStart
	StreamEventContentDelta
	StreamEventContentStop
	StreamEventMessageStop
)

// UnifiedStreamContent 统一流式内容
type UnifiedStreamContent struct {
	Type      string `json:"type"`                 // text, tool_use
	Text      string `json:"text,omitempty"`       // 文本内容
	ToolName  string `json:"tool_name,omitempty"`  // 工具名称
	ToolID    string `json:"tool_id,omitempty"`    // 工具ID
	ToolInput string `json:"tool_input,omitempty"` // 工具输入(JSON字符串)
	Index     int    `json:"index"`                // 内容块索引
}

// UnifiedStreamEvent 统一内部流式事件
type UnifiedStreamEvent struct {
	Type      StreamEventType       `json:"type"`
	Content   *UnifiedStreamContent `json:"content,omitempty"`
	MessageID string                `json:"message_id,omitempty"`
	Model     string                `json:"model,omitempty"`
	Usage     map[string]int        `json:"usage,omitempty"`
	IsDone    bool                  `json:"is_done"`
}

// StreamChunk 流式数据块 (保持向后兼容)
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
