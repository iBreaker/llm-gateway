package types

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Provider 枚举 - LLM提供商
type Provider string

const (
	ProviderAnthropic Provider = "anthropic"
	ProviderOpenAI    Provider = "openai"
	ProviderGoogle    Provider = "google"
	ProviderAzure     Provider = "azure"
)

// Permission 枚举 - Gateway API Key权限
type Permission string

const (
	PermissionRead  Permission = "read"
	PermissionWrite Permission = "write"
	PermissionAdmin Permission = "admin"
)

// UpstreamType 枚举 - 上游账号类型
type UpstreamType string

const (
	UpstreamTypeAPIKey UpstreamType = "api-key"
	UpstreamTypeOAuth  UpstreamType = "oauth"
)

// GatewayAPIKey - Gateway API Key结构 (用于客户端访问Gateway)
type GatewayAPIKey struct {
	ID          string           `json:"id" yaml:"id"`
	Name        string           `json:"name" yaml:"name"`
	KeyHash     string           `json:"key_hash" yaml:"key_hash"`
	Permissions []Permission     `json:"permissions" yaml:"permissions"`
	Status      string           `json:"status" yaml:"status"` // active, disabled
	RateLimit   *RateLimitConfig `json:"rate_limit,omitempty" yaml:"rate_limit,omitempty"`
	Usage       *KeyUsageStats   `json:"usage,omitempty" yaml:"usage,omitempty"`
	CreatedAt   time.Time        `json:"created_at" yaml:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at" yaml:"updated_at"`
	ExpiresAt   *time.Time       `json:"expires_at,omitempty" yaml:"expires_at,omitempty"`
}

// RateLimitConfig - 限流配置
type RateLimitConfig struct {
	RequestsPerMinute int `json:"requests_per_minute" yaml:"requests_per_minute"`
	RequestsPerHour   int `json:"requests_per_hour" yaml:"requests_per_hour"`
	RequestsPerDay    int `json:"requests_per_day" yaml:"requests_per_day"`
}

// KeyUsageStats - Gateway API Key使用统计
type KeyUsageStats struct {
	TotalRequests      int64      `json:"total_requests" yaml:"total_requests"`
	SuccessfulRequests int64      `json:"successful_requests" yaml:"successful_requests"`
	ErrorRequests      int64      `json:"error_requests" yaml:"error_requests"`
	LastUsedAt         time.Time  `json:"last_used_at" yaml:"last_used_at"`
	LastErrorAt        *time.Time `json:"last_error_at,omitempty" yaml:"last_error_at,omitempty"`
	AvgLatency         float64    `json:"avg_latency_ms" yaml:"avg_latency_ms"`
}

// UpstreamAccount - 上游账号结构 (用于调用LLM服务)
type UpstreamAccount struct {
	ID              string              `json:"id" yaml:"id"`
	Name            string              `json:"name" yaml:"name"`
	Type            UpstreamType        `json:"type" yaml:"type"`
	Status          string              `json:"status" yaml:"status"` // active, disabled, error
	Provider        Provider            `json:"provider" yaml:"provider"`
	BaseURL         string              `json:"base_url,omitempty" yaml:"base_url,omitempty"`
	APIKey          string              `json:"api_key,omitempty" yaml:"api_key,omitempty"`
	ClientID        string              `json:"client_id,omitempty" yaml:"client_id,omitempty"`
	ClientSecret    string              `json:"client_secret,omitempty" yaml:"client_secret,omitempty"`
	AccessToken     string              `json:"access_token,omitempty" yaml:"access_token,omitempty"`
	RefreshToken    string              `json:"refresh_token,omitempty" yaml:"refresh_token,omitempty"`
	ExpiresAt       *time.Time          `json:"expires_at,omitempty" yaml:"expires_at,omitempty"`
	Usage           *UpstreamUsageStats `json:"usage,omitempty" yaml:"usage,omitempty"`
	LastHealthCheck *time.Time          `json:"last_health_check,omitempty" yaml:"last_health_check,omitempty"`
	HealthStatus    string              `json:"health_status,omitempty" yaml:"health_status,omitempty"`
	CreatedAt       time.Time           `json:"created_at" yaml:"created_at"`
	UpdatedAt       time.Time           `json:"updated_at" yaml:"updated_at"`
}

// UpstreamUsageStats - 上游账号使用统计
type UpstreamUsageStats struct {
	TotalRequests      int64      `json:"total_requests" yaml:"total_requests"`
	SuccessfulRequests int64      `json:"successful_requests" yaml:"successful_requests"`
	ErrorRequests      int64      `json:"error_requests" yaml:"error_requests"`
	TokensUsed         int64      `json:"tokens_used" yaml:"tokens_used"`
	LastUsedAt         time.Time  `json:"last_used_at" yaml:"last_used_at"`
	LastErrorAt        *time.Time `json:"last_error_at,omitempty" yaml:"last_error_at,omitempty"`
	AvgLatency         float64    `json:"avg_latency_ms" yaml:"avg_latency_ms"`
	ErrorRate          float64    `json:"error_rate" yaml:"error_rate"`
}

// ProxyRequest - 统一的请求结构
type ProxyRequest struct {
	Model            string                   `json:"model"`
	Messages         []Message                `json:"messages"`
	MaxTokens        int                      `json:"max_tokens,omitempty"`
	Temperature      float64                  `json:"temperature,omitempty"`
	Stream           *bool                    `json:"stream,omitempty"`
	TopP             *float64                 `json:"top_p,omitempty"`
	Tools            []map[string]interface{} `json:"tools,omitempty"`
	ToolChoice       interface{}              `json:"tool_choice,omitempty"`
	OriginalFormat   string                   `json:"-"`                    // 原始请求格式
	OriginalSystem   *SystemField             `json:"-"`                    // 原始system字段格式
	OriginalMetadata map[string]interface{}   `json:"-"`                    // 原始metadata字段
	GatewayKeyID     string                   `json:"-"`                    // 发起请求的Gateway API Key ID
	UpstreamID       string                   `json:"-"`                    // 选中的上游账号ID
}

// Message - 通用消息结构
type Message struct {
	Role       string                     `json:"role"` // system, user, assistant
	Content    interface{}                `json:"content"`
	ToolCalls  []map[string]interface{}   `json:"tool_calls,omitempty"`   // OpenAI工具调用
	ToolCallID *string                    `json:"tool_call_id,omitempty"` // OpenAI工具调用ID
	Name       *string                    `json:"name,omitempty"`         // OpenAI工具名称
}

// ProxyResponse - 统一的响应结构
type ProxyResponse struct {
	ID      string           `json:"id"`
	Object  string           `json:"object"`
	Created int64            `json:"created"`
	Model   string           `json:"model"`
	Choices []ResponseChoice `json:"choices"`
	Usage   ResponseUsage    `json:"usage"`
}

// ResponseChoice - 响应选项
type ResponseChoice struct {
	Index        int     `json:"index"`
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

// ResponseUsage - 响应使用统计
type ResponseUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// Config - 全局配置
type Config struct {
	Server           ServerConfig      `yaml:"server"`
	GatewayKeys      []GatewayAPIKey   `yaml:"gateway_keys"`
	UpstreamAccounts []UpstreamAccount `yaml:"upstream_accounts"`
	Logging          LoggingConfig     `yaml:"logging"`
	Environment      EnvironmentConfig `yaml:"environment"`
}

// ServerConfig - 服务器配置
type ServerConfig struct {
	Host    string `yaml:"host"`
	Port    int    `yaml:"port"`
	Timeout int    `yaml:"timeout_seconds"`
}

// LoggingConfig - 日志配置
type LoggingConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
	File   string `yaml:"file"`
}

// EnvironmentConfig - 环境变量配置
type EnvironmentConfig struct {
	HTTPProxy  string `yaml:"http_proxy"`
	HTTPSProxy string `yaml:"https_proxy"`
	NoProxy    string `yaml:"no_proxy"`
}

// API请求结构体

// OpenAIRequest - OpenAI API请求格式
type OpenAIRequest struct {
	Model       string                   `json:"model"`
	Messages    []Message                `json:"messages"`
	MaxTokens   int                      `json:"max_tokens,omitempty"`
	Temperature float64                  `json:"temperature,omitempty"`
	Stream      *bool                    `json:"stream,omitempty"`
	TopP        *float64                 `json:"top_p,omitempty"`
	Tools       []map[string]interface{} `json:"tools,omitempty"`
	ToolChoice  interface{}              `json:"tool_choice,omitempty"`
}

// FlexibleMessage - 支持多种content格式的消息结构
type FlexibleMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

// SystemField - 处理Anthropic system字段的两种格式
type SystemField struct {
	isString bool
	stringValue string
	arrayValue []SystemBlock
}

// SystemBlock - system数组中的单个块
type SystemBlock struct {
	Type         string                 `json:"type"`
	Text         string                 `json:"text"`
	CacheControl map[string]interface{} `json:"cache_control,omitempty"`
}

// UnmarshalJSON 自定义反序列化方法
func (s *SystemField) UnmarshalJSON(data []byte) error {
	// 尝试作为字符串解析
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		s.isString = true
		s.stringValue = str
		return nil
	}
	
	// 尝试作为数组解析
	var blocks []SystemBlock
	if err := json.Unmarshal(data, &blocks); err == nil {
		s.isString = false
		s.arrayValue = blocks
		return nil
	}
	
	return fmt.Errorf("system field must be either string or array")
}

// MarshalJSON 自定义序列化方法 - 保持原始格式
func (s SystemField) MarshalJSON() ([]byte, error) {
	if s.isString {
		// 保持字符串格式输出
		return json.Marshal(s.stringValue)
	}
	return json.Marshal(s.arrayValue)
}

// ToString 转换为字符串格式
func (s *SystemField) ToString() string {
	if s.isString {
		return s.stringValue
	}
	
	// 将数组格式转换为字符串
	var parts []string
	for _, block := range s.arrayValue {
		if block.Type == "text" {
			parts = append(parts, block.Text)
		}
	}
	return strings.Join(parts, "\n")
}

// AnthropicRequest - Anthropic API请求格式
type AnthropicRequest struct {
	Model       string                   `json:"model"`
	Messages    []FlexibleMessage        `json:"messages"`
	MaxTokens   int                      `json:"max_tokens,omitempty"`
	Temperature float64                  `json:"temperature,omitempty"`
	Stream      *bool                    `json:"stream,omitempty"`
	System      *SystemField             `json:"system,omitempty"`
	Metadata    map[string]interface{}   `json:"metadata,omitempty"`
	Tools       []map[string]interface{} `json:"tools,omitempty"`
	ToolChoice  interface{}              `json:"tool_choice,omitempty"`
}

// API响应结构体

// AnthropicContentBlock - Anthropic响应中的内容块
type AnthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// AnthropicUsage - Anthropic API使用统计
type AnthropicUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// AnthropicResponse - Anthropic API响应格式
type AnthropicResponse struct {
	ID           string                  `json:"id"`
	Type         string                  `json:"type"`
	Role         string                  `json:"role"`
	Content      []AnthropicContentBlock `json:"content"`
	Model        string                  `json:"model"`
	StopReason   string                  `json:"stop_reason"`
	StopSequence interface{}             `json:"stop_sequence"`
	Usage        AnthropicUsage          `json:"usage"`
}

// OpenAI 响应结构体
type OpenAIResponse struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Created int64          `json:"created"`
	Model   string         `json:"model"`
	Choices []OpenAIChoice `json:"choices"`
	Usage   OpenAIUsage    `json:"usage"`
}

type OpenAIChoice struct {
	Index        int     `json:"index"`
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

type OpenAIUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// 流式响应结构体
type OpenAIStreamChunk struct {
	ID      string               `json:"id"`
	Object  string               `json:"object"`
	Created int64                `json:"created"`
	Model   string               `json:"model"`
	Choices []OpenAIStreamChoice `json:"choices"`
}

type OpenAIStreamChoice struct {
	Index        int               `json:"index"`
	Delta        OpenAIStreamDelta `json:"delta"`
	FinishReason *string           `json:"finish_reason"`
}

type OpenAIStreamDelta struct {
	Role    string `json:"role,omitempty"`
	Content string `json:"content,omitempty"`
}

// Anthropic 流式事件结构体
type AnthropicContentBlockDelta struct {
	Type  string `json:"type"`
	Text  string `json:"text"`
	Index int    `json:"index"`
}

type AnthropicStreamEvent struct {
	Type  string               `json:"type"`
	Index int                  `json:"index"`
	Delta AnthropicStreamDelta `json:"delta"`
}

type AnthropicStreamDelta struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
