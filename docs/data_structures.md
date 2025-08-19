# LLM Gateway 主要数据结构设计

## 1. 下游Gateway API Key相关结构

```go
// Gateway API Key权限类型
type Permission string
const (
    PermissionRead  Permission = "read"
    PermissionWrite Permission = "write"
    PermissionAdmin Permission = "admin"
)

// Gateway API Key结构 (用于客户端访问Gateway)
type GatewayAPIKey struct {
    ID          string       `json:"id"`
    Name        string       `json:"name"`
    KeyHash     string       `json:"key_hash"`     // 存储哈希值，不存储原始key
    Permissions []Permission `json:"permissions"`
    Status      string       `json:"status"`       // active, disabled
    
    // 限流配置
    RateLimit *RateLimitConfig `json:"rate_limit,omitempty"`
    
    // 使用统计
    Usage *KeyUsageStats `json:"usage,omitempty"`
    
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
    ExpiresAt *time.Time `json:"expires_at,omitempty"` // 可选过期时间
}

// 限流配置
type RateLimitConfig struct {
    RequestsPerMinute int `json:"requests_per_minute"`
    RequestsPerHour   int `json:"requests_per_hour"`
    RequestsPerDay    int `json:"requests_per_day"`
}

// Gateway API Key使用统计
type KeyUsageStats struct {
    TotalRequests     int64     `json:"total_requests"`
    SuccessfulRequests int64    `json:"successful_requests"`
    ErrorRequests     int64     `json:"error_requests"`
    LastUsedAt        time.Time `json:"last_used_at"`
    LastErrorAt       *time.Time `json:"last_error_at,omitempty"`
    AvgLatency        float64   `json:"avg_latency_ms"`
}
```

## 2. 上游LLM服务相关结构

```go
// 上游账号类型
type UpstreamType string
const (
    UpstreamTypeAPIKey UpstreamType = "api_key"
    UpstreamTypeOAuth  UpstreamType = "oauth"
)

// LLM提供商枚举
type Provider string
const (
    ProviderAnthropic Provider = "anthropic"
    ProviderOpenAI    Provider = "openai"
    ProviderGoogle    Provider = "google"
    ProviderAzure     Provider = "azure"
)

// 上游账号结构 (用于调用LLM服务)
type UpstreamAccount struct {
    ID       string       `json:"id"`
    Name     string       `json:"name"`
    Type     UpstreamType `json:"type"`
    Status   string       `json:"status"` // active, disabled, error
    Provider Provider     `json:"provider"` // 使用枚举类型
    
    // API Key类型字段
    APIKey string `json:"api_key,omitempty"`
    
    // OAuth类型字段
    ClientID     string    `json:"client_id,omitempty"`
    ClientSecret string    `json:"client_secret,omitempty"`
    AccessToken  string    `json:"access_token,omitempty"`
    RefreshToken string    `json:"refresh_token,omitempty"`
    ExpiresAt    *time.Time `json:"expires_at,omitempty"`
    
    // 使用统计
    Usage *UpstreamUsageStats `json:"usage,omitempty"`
    
    // 健康检查
    LastHealthCheck *time.Time `json:"last_health_check,omitempty"`
    HealthStatus    string     `json:"health_status,omitempty"` // healthy, unhealthy, unknown
    
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// 上游账号使用统计
type UpstreamUsageStats struct {
    TotalRequests     int64     `json:"total_requests"`
    SuccessfulRequests int64    `json:"successful_requests"`
    ErrorRequests     int64     `json:"error_requests"`
    TokensUsed        int64     `json:"tokens_used"`
    LastUsedAt        time.Time `json:"last_used_at"`
    LastErrorAt       *time.Time `json:"last_error_at,omitempty"`
    AvgLatency        float64   `json:"avg_latency_ms"`
    ErrorRate         float64   `json:"error_rate"`
}
```

## 2. 请求/响应结构

```go
// 通用消息结构
type Message struct {
    Role    string `json:"role"`    // system, user, assistant
    Content string `json:"content"`
}

// 统一的请求结构
type ProxyRequest struct {
    Model       string    `json:"model"`
    Messages    []Message `json:"messages"`
    MaxTokens   int       `json:"max_tokens,omitempty"`
    Temperature float64   `json:"temperature,omitempty"`
    Stream      bool      `json:"stream,omitempty"`
    
    // 内部字段
    OriginalFormat  string  `json:"-"` // 原始请求格式
    GatewayKeyID    string  `json:"-"` // 发起请求的Gateway API Key ID
    UpstreamID      string  `json:"-"` // 选中的上游账号ID
}

// 统一的响应结构
type ProxyResponse struct {
    ID      string                 `json:"id"`
    Object  string                 `json:"object"`
    Created int64                  `json:"created"`
    Model   string                 `json:"model"`
    Choices []ResponseChoice       `json:"choices"`
    Usage   ResponseUsage          `json:"usage"`
}

type ResponseChoice struct {
    Index        int     `json:"index"`
    Message      Message `json:"message"`
    FinishReason string  `json:"finish_reason"`
}

type ResponseUsage struct {
    PromptTokens     int `json:"prompt_tokens"`
    CompletionTokens int `json:"completion_tokens"`
    TotalTokens      int `json:"total_tokens"`
}
```

## 3. 配置结构

```go
// 全局配置
type Config struct {
    Server          ServerConfig        `yaml:"server"`
    GatewayKeys     []GatewayAPIKey     `yaml:"gateway_keys"`     // Gateway API Key配置
    UpstreamAccounts []UpstreamAccount  `yaml:"upstream_accounts"` // 上游账号配置
    Logging         LoggingConfig       `yaml:"logging"`
}

type ServerConfig struct {
    Host    string `yaml:"host"`
    Port    int    `yaml:"port"`
    Timeout int    `yaml:"timeout_seconds"`
}

type LoggingConfig struct {
    Level  string `yaml:"level"`
    Format string `yaml:"format"`
    File   string `yaml:"file"`
}
```

## 4. 错误结构

```go
// 错误响应
type ErrorResponse struct {
    Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
    Type    string `json:"type"`
    Code    string `json:"code"`
    Message string `json:"message"`
}

// 内部错误类型
type ProxyError struct {
    Type      string
    Message   string
    AccountID string
    Upstream  error
}
```

## 5. 核心管理器结构

```go
// Gateway API Key管理器 - 管理下游客户端访问Key
type GatewayKeyManager struct {
    keys  map[string]*GatewayAPIKey  // key_id -> GatewayAPIKey
    mutex sync.RWMutex
}

// Gateway Key管理器方法
func (m *GatewayKeyManager) CreateKey(name string, permissions []Permission) (*GatewayAPIKey, string, error)
func (m *GatewayKeyManager) ValidateKey(keyHash string) (*GatewayAPIKey, error)
func (m *GatewayKeyManager) GetKey(keyID string) (*GatewayAPIKey, error)
func (m *GatewayKeyManager) ListKeys() []*GatewayAPIKey
func (m *GatewayKeyManager) DeleteKey(keyID string) error
func (m *GatewayKeyManager) UpdateKeyStatus(keyID string, status string) error

// 上游账号管理器 - 管理上游LLM服务账号
type UpstreamManager struct {
    accounts map[string]*UpstreamAccount  // upstream_id -> UpstreamAccount
    mutex    sync.RWMutex
}

// 上游账号管理器方法
func (m *UpstreamManager) AddAccount(account *UpstreamAccount) error
func (m *UpstreamManager) GetAccount(upstreamID string) (*UpstreamAccount, error)
func (m *UpstreamManager) ListAccounts() []*UpstreamAccount
func (m *UpstreamManager) ListActiveAccounts(provider Provider) []*UpstreamAccount
func (m *UpstreamManager) DeleteAccount(upstreamID string) error
func (m *UpstreamManager) UpdateAccountStatus(upstreamID string, status string) error
func (m *UpstreamManager) UpdateAccountHealth(upstreamID string, healthy bool) error

// 负载均衡器 - 选择最佳上游账号
type LoadBalancer struct {
    upstreamManager *UpstreamManager
    strategy        BalanceStrategy
    mutex          sync.Mutex
}

// 负载均衡策略
type BalanceStrategy string
const (
    StrategyRoundRobin BalanceStrategy = "round_robin"
    StrategyRandom     BalanceStrategy = "random"
    StrategyHealthFirst BalanceStrategy = "health_first"
)

// 负载均衡器方法
func (lb *LoadBalancer) SelectAccount(provider Provider) (*UpstreamAccount, error)
func (lb *LoadBalancer) MarkAccountError(upstreamID string, err error)
func (lb *LoadBalancer) MarkAccountSuccess(upstreamID string, latency time.Duration)

// OAuth管理器 - 处理OAuth流程和token刷新
type OAuthManager struct {
    upstreamManager *UpstreamManager
    httpClient     *http.Client
    mutex          sync.Mutex
}

// OAuth管理器方法
func (m *OAuthManager) StartOAuthFlow(upstreamID string) (string, error)  // 返回授权URL
func (m *OAuthManager) HandleCallback(upstreamID string, code string) error
func (m *OAuthManager) RefreshToken(upstreamID string) error
func (m *OAuthManager) IsTokenValid(upstreamID string) bool
```

## 需求回顾

### 简化后的需求
1. **API格式支持** - 支持常见API格式，自动转换
2. **账号类型** - 仅支持 Anthropic API Key 和 Anthropic OAuth (Claude Code)
3. **核心功能** - 代理、负载均衡、故障转移、OAuth完整流程
4. **管理方式** - 纯CLI管理，无Web界面
5. **性能要求** - 高并发、团队使用

### 特殊处理
- **Anthropic OAuth** 需要注入系统提示词 "你是 Claude Code"
- **多格式支持** - 客户端可使用任意常见API格式
- **扩展性** - 为各账号类型的特殊需求预留扩展点