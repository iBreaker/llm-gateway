package converter

import (
	"fmt"
	"io"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// Manager 转换器管理器 - 系统的主要入口点
type Manager struct {
	registry      ConverterRegistry
	detector      *FormatDetector
	crossConverter CrossConverter
	modelRouteContext *types.ModelRouteContext // 模型路由上下文
}

// NewManager 创建转换器管理器
func NewManager() *Manager {
	registry := NewConverterRegistry()
	return &Manager{
		registry:       registry,
		detector:       &FormatDetector{},
		crossConverter: NewCrossConverter(registry),
	}
}

// DetectFormat 检测请求格式
func (m *Manager) DetectFormat(requestBody []byte, endpoint string) Format {
	return m.detector.Detect(requestBody, endpoint)
}

// ParseRequest 解析请求（自动检测格式）
func (m *Manager) ParseRequest(requestBody []byte, endpoint string) (*types.ProxyRequest, Format, error) {
	format := m.DetectFormat(requestBody, endpoint)
	if !format.IsValid() {
		return nil, format, fmt.Errorf("无法检测请求格式")
	}

	converter, err := m.registry.Get(format)
	if err != nil {
		return nil, format, err
	}

	request, err := converter.ParseRequest(requestBody)
	if err != nil {
		return nil, format, err
	}

	// 如果有模型路由配置，替换模型名称
	if m.modelRouteContext != nil && m.modelRouteContext.HasModelRoute() {
		m.applyModelRouteToRequest(request)
	}

	return request, format, err
}

// BuildUpstreamRequest 构建上游请求
func (m *Manager) BuildUpstreamRequest(request *types.ProxyRequest, provider types.Provider) ([]byte, error) {
	// 根据提供商确定上游格式
	upstreamFormat := m.getProviderFormat(provider)
	
	converter, err := m.registry.Get(upstreamFormat)
	if err != nil {
		return nil, fmt.Errorf("获取上游转换器失败: %w", err)
	}

	return converter.BuildRequest(request)
}

// ParseUpstreamResponse 解析上游响应
func (m *Manager) ParseUpstreamResponse(responseBody []byte, provider types.Provider) (*types.ProxyResponse, error) {
	upstreamFormat := m.getProviderFormat(provider)
	
	converter, err := m.registry.Get(upstreamFormat)
	if err != nil {
		return nil, fmt.Errorf("获取上游转换器失败: %w", err)
	}

	return converter.ParseResponse(responseBody)
}

// BuildClientResponse 构建客户端响应
func (m *Manager) BuildClientResponse(response *types.ProxyResponse, clientFormat Format) ([]byte, error) {
	// 如果有模型路由配置，恢复原始模型名称
	if m.modelRouteContext != nil && m.modelRouteContext.HasModelRoute() {
		m.restoreModelInResponse(response)
	}

	converter, err := m.registry.Get(clientFormat)
	if err != nil {
		return nil, fmt.Errorf("获取客户端转换器失败: %w", err)
	}

	return converter.BuildResponse(response)
}

// ConvertRequest 跨格式请求转换
func (m *Manager) ConvertRequest(from, to Format, data []byte) ([]byte, error) {
	// 如果格式相同，直接返回
	if from == to {
		return data, nil
	}

	// 获取源格式转换器
	fromConverter, err := m.registry.Get(from)
	if err != nil {
		return nil, fmt.Errorf("获取源格式转换器失败: %w", err)
	}

	// 获取目标格式转换器
	toConverter, err := m.registry.Get(to)
	if err != nil {
		return nil, fmt.Errorf("获取目标格式转换器失败: %w", err)
	}

	// 解析请求到内部格式
	request, err := fromConverter.ParseRequest(data)
	if err != nil {
		return nil, fmt.Errorf("解析源格式请求失败: %w", err)
	}

	// 应用模型路由（如果有配置）
	if m.modelRouteContext != nil && m.modelRouteContext.HasModelRoute() {
		m.applyModelRouteToRequest(request)
	}

	// 构建目标格式请求
	result, err := toConverter.BuildRequest(request)
	if err != nil {
		return nil, fmt.Errorf("构建目标格式请求失败: %w", err)
	}

	return result, nil
}

// ConvertResponse 跨格式响应转换
func (m *Manager) ConvertResponse(from, to Format, data []byte) ([]byte, error) {
	return m.crossConverter.ConvertResponse(from, to, data)
}

// ProcessStream 处理流式响应
func (m *Manager) ProcessStream(reader io.Reader, provider types.Provider, clientFormat Format, writer StreamWriter) error {
	upstreamFormat := m.getProviderFormat(provider)
	
	// 如果需要模型替换，包装writer
	if m.modelRouteContext != nil && m.modelRouteContext.HasModelRoute() {
		writer = &modelReplaceStreamWriter{
			originalWriter: writer,
			manager:        m,
			format:         clientFormat,
		}
	}
	
	return m.crossConverter.ConvertStream(upstreamFormat, clientFormat, reader, writer)
}

// InjectSystemPrompt 注入系统提示词
func (m *Manager) InjectSystemPrompt(request *types.ProxyRequest, provider types.Provider, upstreamType types.UpstreamType) {
	// Anthropic转换器会自动处理Claude Code身份注入
	// 这里不需要做任何操作，让具体的转换器自己决定
}

// ValidateRequest 验证请求
func (m *Manager) ValidateRequest(requestBody []byte, format Format) error {
	converter, err := m.registry.Get(format)
	if err != nil {
		return err
	}

	return converter.ValidateRequest(requestBody)
}

// GetRegistry 获取转换器注册表（用于扩展）
func (m *Manager) GetRegistry() ConverterRegistry {
	return m.registry
}

// GetUpstreamPath 根据提供商和客户端端点获取上游路径
func (m *Manager) GetUpstreamPath(provider types.Provider, clientEndpoint string) (string, error) {
	format := m.getProviderFormat(provider)
	converter, err := m.registry.Get(format)
	if err != nil {
		return "", fmt.Errorf("获取提供商转换器失败: %w", err)
	}
	
	return converter.GetUpstreamPath(clientEndpoint), nil
}

// SetModelRouteContext 设置模型路由上下文
func (m *Manager) SetModelRouteContext(ctx *types.ModelRouteContext) {
	m.modelRouteContext = ctx
}

// SetModelRouteContextAndApply 设置模型路由上下文并应用到请求
func (m *Manager) SetModelRouteContextAndApply(ctx *types.ModelRouteContext, request *types.ProxyRequest) {
	m.modelRouteContext = ctx
	if ctx != nil && ctx.HasModelRoute() && request != nil {
		m.applyModelRouteToRequest(request)
	}
}

// GetModelRouteContext 获取模型路由上下文
func (m *Manager) GetModelRouteContext() *types.ModelRouteContext {
	return m.modelRouteContext
}

// ClearModelRouteContext 清除模型路由上下文
func (m *Manager) ClearModelRouteContext() {
	m.modelRouteContext = nil
}

// applyModelRouteToRequest 对请求应用模型路由
func (m *Manager) applyModelRouteToRequest(request *types.ProxyRequest) {
	if m.modelRouteContext == nil || !m.modelRouteContext.HasModelRoute() {
		return
	}

	// 如果请求的模型匹配原始模型，替换为目标模型
	if request.Model == m.modelRouteContext.OriginalModel {
		request.Model = m.modelRouteContext.TargetModel
	}
}

// restoreModelInResponse 在响应中恢复原始模型名称
func (m *Manager) restoreModelInResponse(response *types.ProxyResponse) {
	if m.modelRouteContext == nil || !m.modelRouteContext.HasModelRoute() {
		return
	}

	// 如果响应的模型匹配目标模型，恢复为原始模型
	if response.Model == m.modelRouteContext.TargetModel {
		response.Model = m.modelRouteContext.OriginalModel
	}
}

// modelReplaceStreamWriter 模型替换流式写入器
type modelReplaceStreamWriter struct {
	originalWriter StreamWriter
	manager        *Manager
	format         Format
}

// WriteChunk 写入数据块并替换模型名
func (w *modelReplaceStreamWriter) WriteChunk(chunk *StreamChunk) error {
	// 替换chunk中的模型名
	if chunk.Data != nil {
		w.replaceModelInChunk(chunk)
	}
	return w.originalWriter.WriteChunk(chunk)
}

// WriteDone 完成写入
func (w *modelReplaceStreamWriter) WriteDone() error {
	return w.originalWriter.WriteDone()
}

// replaceModelInChunk 替换数据块中的模型名
func (w *modelReplaceStreamWriter) replaceModelInChunk(chunk *StreamChunk) {
	if w.manager.modelRouteContext == nil || !w.manager.modelRouteContext.HasModelRoute() {
		return
	}

	// 如果Data是ProxyResponse类型，直接恢复原始模型名称
	if response, ok := chunk.Data.(*types.ProxyResponse); ok {
		w.manager.restoreModelInResponse(response)
		return
	}

	// 如果Data是map类型，尝试替换model字段（兜底处理）
	if dataMap, ok := chunk.Data.(map[string]interface{}); ok {
		if modelField, exists := dataMap["model"]; exists {
			if modelStr, isString := modelField.(string); isString && modelStr == w.manager.modelRouteContext.TargetModel {
				dataMap["model"] = w.manager.modelRouteContext.OriginalModel
			}
		}
	}
}

// getProviderFormat 根据提供商获取对应格式
func (m *Manager) getProviderFormat(provider types.Provider) Format {
	switch provider {
	case types.ProviderAnthropic:
		return FormatAnthropic
	case types.ProviderOpenAI:
		return FormatOpenAI
	default:
		return FormatOpenAI // 默认OpenAI格式，Qwen等也使用此格式
	}
}

