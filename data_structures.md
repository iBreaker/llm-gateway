# LLM Gateway 主要数据结构设计

## 1. 账号相关结构

```go
// 账号基础类型
type AccountType string
const (
    AccountTypeAPIKey AccountType = "api_key"
    AccountTypeOAuth  AccountType = "oauth"
)

// 账号结构
type Account struct {
    ID       string      `json:"id"`
    Name     string      `json:"name"`
    Type     AccountType `json:"type"`
    Status   string      `json:"status"` // active, disabled, error
    
    // API Key字段
    APIKey string `json:"api_key,omitempty"`
    
    // OAuth字段
    ClientID     string    `json:"client_id,omitempty"`
    ClientSecret string    `json:"client_secret,omitempty"`
    AccessToken  string    `json:"access_token,omitempty"`
    RefreshToken string    `json:"refresh_token,omitempty"`
    ExpiresAt    time.Time `json:"expires_at,omitempty"`
    
    // 统计信息
    Usage *UsageStats `json:"usage,omitempty"`
    
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// 使用统计
type UsageStats struct {
    RequestCount  int64     `json:"request_count"`
    ErrorCount    int64     `json:"error_count"`
    LastUsedAt    time.Time `json:"last_used_at"`
    LastErrorAt   time.Time `json:"last_error_at"`
    AvgLatency    float64   `json:"avg_latency_ms"`
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
    OriginalFormat string  `json:"-"` // 原始请求格式
    AccountID      string  `json:"-"` // 选中的账号ID
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
    Server   ServerConfig    `yaml:"server"`
    Accounts []Account       `yaml:"accounts"`
    Auth     AuthConfig      `yaml:"auth"`
    Logging  LoggingConfig   `yaml:"logging"`
}

type ServerConfig struct {
    Host    string `yaml:"host"`
    Port    int    `yaml:"port"`
    Timeout int    `yaml:"timeout_seconds"`
}

type AuthConfig struct {
    APIKeys []string `yaml:"api_keys"` // 客户端认证用的API Key
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
// 账号管理器
type AccountManager struct {
    accounts map[string]*Account
    mutex    sync.RWMutex
}

// 负载均衡器
type LoadBalancer struct {
    accounts      []*Account
    currentIndex  int
    mutex         sync.Mutex
}

// OAuth管理器
type OAuthManager struct {
    config *Config
    client *http.Client
}
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