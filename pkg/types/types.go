package types

import "time"

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
	UpstreamTypeAPIKey UpstreamType = "api_key"
	UpstreamTypeOAuth  UpstreamType = "oauth"
)

// GatewayAPIKey - Gateway API Key结构 (用于客户端访问Gateway)
type GatewayAPIKey struct {
	ID          string              `json:"id" yaml:"id"`
	Name        string              `json:"name" yaml:"name"`
	KeyHash     string              `json:"key_hash" yaml:"key_hash"`
	Permissions []Permission        `json:"permissions" yaml:"permissions"`
	Status      string              `json:"status" yaml:"status"` // active, disabled
	RateLimit   *RateLimitConfig    `json:"rate_limit,omitempty" yaml:"rate_limit,omitempty"`
	Usage       *KeyUsageStats      `json:"usage,omitempty" yaml:"usage,omitempty"`
	CreatedAt   time.Time           `json:"created_at" yaml:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at" yaml:"updated_at"`
	ExpiresAt   *time.Time          `json:"expires_at,omitempty" yaml:"expires_at,omitempty"`
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
	ID              string                `json:"id" yaml:"id"`
	Name            string                `json:"name" yaml:"name"`
	Type            UpstreamType          `json:"type" yaml:"type"`
	Status          string                `json:"status" yaml:"status"` // active, disabled, error
	Provider        Provider              `json:"provider" yaml:"provider"`
	BaseURL         string                `json:"base_url,omitempty" yaml:"base_url,omitempty"`
	APIKey          string                `json:"api_key,omitempty" yaml:"api_key,omitempty"`
	ClientID        string                `json:"client_id,omitempty" yaml:"client_id,omitempty"`
	ClientSecret    string                `json:"client_secret,omitempty" yaml:"client_secret,omitempty"`
	AccessToken     string                `json:"access_token,omitempty" yaml:"access_token,omitempty"`
	RefreshToken    string                `json:"refresh_token,omitempty" yaml:"refresh_token,omitempty"`
	ExpiresAt       *time.Time            `json:"expires_at,omitempty" yaml:"expires_at,omitempty"`
	Usage           *UpstreamUsageStats   `json:"usage,omitempty" yaml:"usage,omitempty"`
	LastHealthCheck *time.Time            `json:"last_health_check,omitempty" yaml:"last_health_check,omitempty"`
	HealthStatus    string                `json:"health_status,omitempty" yaml:"health_status,omitempty"`
	CreatedAt       time.Time             `json:"created_at" yaml:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at" yaml:"updated_at"`
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
	Model          string    `json:"model"`
	Messages       []Message `json:"messages"`
	MaxTokens      int       `json:"max_tokens,omitempty"`
	Temperature    float64   `json:"temperature,omitempty"`
	Stream         bool      `json:"stream,omitempty"`
	OriginalFormat string    `json:"-"` // 原始请求格式
	GatewayKeyID   string    `json:"-"` // 发起请求的Gateway API Key ID
	UpstreamID     string    `json:"-"` // 选中的上游账号ID
}

// Message - 通用消息结构
type Message struct {
	Role    string `json:"role"`    // system, user, assistant
	Content string `json:"content"`
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