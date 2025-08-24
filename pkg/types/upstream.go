package types

import "time"

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