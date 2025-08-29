package types

// Provider 枚举 - LLM提供商
type Provider string

const (
	ProviderAnthropic Provider = "anthropic"
	ProviderOpenAI    Provider = "openai"
	ProviderGoogle    Provider = "google"
	ProviderAzure     Provider = "azure"
	ProviderQwen      Provider = "qwen"
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
