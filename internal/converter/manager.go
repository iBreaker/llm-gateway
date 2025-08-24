package converter

import (
	"fmt"
	"io"
	"strings"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// Manager 转换器管理器 - 系统的主要入口点
type Manager struct {
	registry      ConverterRegistry
	detector      *FormatDetector
	crossConverter CrossConverter
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
	converter, err := m.registry.Get(clientFormat)
	if err != nil {
		return nil, fmt.Errorf("获取客户端转换器失败: %w", err)
	}

	return converter.BuildResponse(response)
}

// ConvertRequest 跨格式请求转换
func (m *Manager) ConvertRequest(from, to Format, data []byte) ([]byte, error) {
	return m.crossConverter.ConvertRequest(from, to, data)
}

// ConvertResponse 跨格式响应转换
func (m *Manager) ConvertResponse(from, to Format, data []byte) ([]byte, error) {
	return m.crossConverter.ConvertResponse(from, to, data)
}

// ProcessStream 处理流式响应
func (m *Manager) ProcessStream(reader io.Reader, provider types.Provider, clientFormat Format, writer StreamWriter) error {
	upstreamFormat := m.getProviderFormat(provider)
	return m.crossConverter.ConvertStream(upstreamFormat, clientFormat, reader, writer)
}

// InjectSystemPrompt 注入系统提示词
func (m *Manager) InjectSystemPrompt(request *types.ProxyRequest, provider types.Provider, upstreamType types.UpstreamType) {
	// 对Anthropic账号注入Claude Code系统提示词
	if provider == types.ProviderAnthropic {
		m.injectClaudeCodePrompt(request)
	}
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

// getProviderFormat 根据提供商获取对应格式
func (m *Manager) getProviderFormat(provider types.Provider) Format {
	switch provider {
	case types.ProviderAnthropic:
		return FormatAnthropic
	case types.ProviderOpenAI:
		return FormatOpenAI
	default:
		return FormatOpenAI // 默认OpenAI格式
	}
}

// injectClaudeCodePrompt 注入Claude Code系统提示词
func (m *Manager) injectClaudeCodePrompt(request *types.ProxyRequest) {
	claudeCodeIdentity := "You are Claude Code, Anthropic's official CLI for Claude."

	// 检查是否已包含Claude Code身份
	hasClaudeCodeIdentity := false
	for _, msg := range request.Messages {
		if msg.Role == "system" {
			content := m.contentToString(msg.Content)
			if m.containsClaudeCode(content) {
				hasClaudeCodeIdentity = true
				break
			}
		}
	}

	// 只有在不存在Claude Code身份时才注入
	if !hasClaudeCodeIdentity {
		// 检查是否已有system消息
		hasSystem := false
		for i, msg := range request.Messages {
			if msg.Role == "system" {
				// 在现有系统消息前添加Claude Code身份
				content := m.contentToString(msg.Content)
				request.Messages[i].Content = claudeCodeIdentity + "\n\n" + content
				hasSystem = true
				break
			}
		}

		// 如果没有system消息，添加一个
		if !hasSystem {
			systemMsg := types.Message{
				Role:    "system",
				Content: claudeCodeIdentity,
			}
			request.Messages = append([]types.Message{systemMsg}, request.Messages...)
		}
	}
}

// contentToString 转换内容为字符串
func (m *Manager) contentToString(content interface{}) string {
	converter := NewAnthropicConverter()
	return converter.contentToString(content)
}

// containsClaudeCode 检查内容是否包含Claude Code身份
func (m *Manager) containsClaudeCode(content string) bool {
	return len(content) > 0 && 
		(strings.Contains(content, "You are Claude Code") || 
		 strings.Contains(content, "Claude Code"))
}