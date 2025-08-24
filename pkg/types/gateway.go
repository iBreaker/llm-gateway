package types

import "time"

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