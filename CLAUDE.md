# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Gateway is a high-performance proxy service for Anthropic's LLM APIs, designed for team usage with simplified architecture. The project is a complete rewrite focusing on two specific account types: Anthropic API Key and Anthropic OAuth (Claude Code).

## Architecture

### Core Components
- **API Proxy Server** - HTTP server handling multi-format requests (OpenAI, Anthropic)
- **Account Manager** - Manages two types: API Key and OAuth accounts
- **Load Balancer** - Distributes requests across available accounts
- **OAuth Manager** - Handles complete OAuth flow for Claude Code accounts
- **Format Adapter** - Auto-detects and converts between API formats

### Key Data Flow
```
Client Request (any format) → Format Detection → Account Selection → Request Transform → Upstream Call → Response Transform → Client Response
```

## Development Commands

### Build and Run
```bash
go build -o llm-gateway .
./llm-gateway server
```

### Account Management
```bash
# API Key accounts
./llm-gateway add-api-key --key=sk-ant-xxx --name="Production Account"
./llm-gateway list-accounts

# OAuth accounts (Claude Code)
./llm-gateway add-oauth --client-id=xxx --client-secret=xxx --name="Claude Code Team"
./llm-gateway oauth-start --account-id=xxx
./llm-gateway oauth-callback --code=xxx --account-id=xxx

# Status monitoring
./llm-gateway status
./llm-gateway health-check
```

## Critical Implementation Details

### Anthropic OAuth Special Handling
- **System Prompt Injection**: OAuth accounts MUST inject "你是 Claude Code，Anthropic的官方CLI工具" as system message
- **Token Management**: Automatic refresh of access tokens before expiration
- **Authentication Flow**: Complete OAuth 2.0 flow implementation required

### Account Types
1. **API Key**: Standard authentication with `sk-ant-` prefixed keys
2. **OAuth**: Claude Code specific with client credentials and token management

### Configuration Structure
- **YAML-based**: All configuration in config.yaml
- **Account Storage**: Encrypted sensitive data in configuration
- **Runtime State**: In-memory caching for performance

### Error Handling
- **Upstream Failures**: Automatic failover between accounts
- **Token Expiry**: Transparent token refresh for OAuth accounts
- **Format Errors**: Graceful handling of unsupported request formats

## Design Principles

### Simplicity Focus
- **Single Binary**: Server and CLI management in one executable
- **Minimal Dependencies**: Pure Go with standard library focus
- **Configuration-Driven**: Account management through config files
- **Stateless Design**: Supports horizontal scaling

### Performance Requirements
- **High Concurrency**: Designed for team usage with many concurrent requests
- **Connection Pooling**: HTTP client reuse for upstream connections
- **Memory-First**: Hot data cached in memory for speed

### Extensibility
- **Plugin Architecture**: Each account type has independent processor
- **Format Adapters**: Pluggable request/response format converters
- **Future Providers**: Architecture ready for additional LLM providers

## Directory Structure

```
llm-gateway/
├── cmd/
│   └── main.go          # 程序入口
├── internal/
│   ├── client/          # 客户端处理模块
│   │   ├── server.go    # HTTP服务器
│   │   └── auth.go      # 客户端认证
│   ├── transform/       # 请求响应转换模块
│   │   ├── detector.go  # 格式检测
│   │   ├── openai.go    # OpenAI转换器
│   │   └── anthropic.go # Anthropic转换器
│   ├── router/          # 路由模块  
│   │   ├── balancer.go  # 负载均衡
│   │   └── selector.go  # 账号选择
│   ├── upstream/        # 上游模块
│   │   ├── manager.go   # 账号管理
│   │   ├── oauth.go     # OAuth处理
│   │   └── client.go    # 上游调用
│   └── config/
│       └── config.go    # 配置管理
├── pkg/
│   └── types/
│       └── types.go     # 公共类型
├── configs/
│   └── config.yaml      # 配置文件
├── go.mod
├── go.sum
└── docs/               # 文档目录
    ├── requirements.md
    └── data_structures.md
```

## Three-Module Architecture

### 1. Client Module (`internal/client/`) - 客户端处理模块

#### `server.go` - HTTP服务器
- **HTTP路由** - 定义API端点 (`/v1/chat/completions`, `/v1/messages` 等)
- **中间件管理** - CORS、日志、恢复、超时
- **服务生命周期** - 优雅启动和关闭
- **健康检查端点** - `/health`, `/ready`

#### `auth.go` - 客户端认证
- **API Key验证** - 验证Gateway客户端的API Key
- **权限控制** - 基于API Key的访问控制
- **认证中间件** - HTTP请求拦截和验证
- **认证缓存** - 提高验证性能

### Transform Module (`internal/transform/`) - 请求响应转换模块

#### `detector.go` - 格式检测器
- **自动检测** - 识别OpenAI/Anthropic请求格式
- **格式验证** - 验证请求格式的完整性
- **错误处理** - 不支持格式的错误响应

#### `openai.go` - OpenAI转换器
- **请求解析** - 解析OpenAI格式请求
- **响应构建** - 构建OpenAI格式响应
- **参数映射** - OpenAI参数到内部格式的映射

#### `anthropic.go` - Anthropic转换器
- **请求解析** - 解析Anthropic格式请求
- **响应构建** - 构建Anthropic格式响应
- **格式标准化** - 转换为内部统一格式

### 2. Router Module (`internal/router/`) - 路由模块

#### `selector.go` - 账号选择器
- **选择策略** - 轮询、随机、权重、健康度优先
- **账号过滤** - 根据模型类型过滤可用账号
- **状态检查** - 实时检查账号可用性
- **选择缓存** - 缓存选择结果提高性能

#### `balancer.go` - 负载均衡器
- **负载算法** - 实现多种负载均衡算法
- **故障检测** - 检测上游账号异常
- **自动切换** - 故障账号自动剔除和恢复
- **监控指标** - 收集负载均衡相关指标

### 3. Upstream Module (`internal/upstream/`) - 上游模块

#### `manager.go` - 账号管理器
- **账号CRUD** - 增删改查账号配置
- **状态管理** - 跟踪账号状态 (active/disabled/error)
- **配置持久化** - 保存账号配置到文件
- **使用统计** - 记录每个账号的使用情况
- **健康检查** - 定期检查账号可用性

#### `oauth.go` - OAuth处理器
- **OAuth流程** - 完整的OAuth 2.0授权流程
- **Token管理** - access_token和refresh_token管理
- **自动刷新** - token过期前自动刷新
- **状态跟踪** - OAuth账号状态监控
- **安全存储** - 敏感信息加密存储
- **请求增强** - OAuth特有的业务逻辑处理（如Claude Code系统提示词注入）

#### `client.go` - 上游客户端
- **HTTP客户端** - 管理与上游服务的HTTP连接
- **API调用** - 执行对上游服务的实际调用
- **响应处理** - 处理上游API响应
- **连接池** - HTTP连接复用和管理
- **重试机制** - 请求失败重试策略

## Module Data Flow

```
客户端请求
    ↓
[Client] server.go 接收请求
    ↓
[Client] auth.go 验证客户端
    ↓
[Transform] detector.go 检测请求格式
    ↓
[Transform] openai.go/anthropic.go 解析为内部格式
    ↓
[Router] selector.go 选择可用账号
    ↓
[Router] balancer.go 负载均衡决策
    ↓
[Upstream] manager.go 获取账号信息
    ↓
[Upstream] oauth.go 处理OAuth token + 请求增强 (如需要)
    ↓
[Upstream] client.go 调用上游API
    ↓
[Transform] anthropic.go 处理上游响应
    ↓
[Transform] openai.go/anthropic.go 转换为客户端格式
    ↓
响应返回客户端
```

## Module Responsibilities and Boundaries

### 1. Client Module (`internal/client/`) - 客户端连接层
**✅ 核心职责**:
- HTTP服务器管理 - 接收请求、路由、中间件
- 客户端认证 - 验证Gateway API Key
- 连接管理 - 处理HTTP连接生命周期

**❌ 不负责**:
- 请求格式解析
- 业务逻辑处理
- 上游服务管理

### 2. Transform Module (`internal/transform/`) - 格式转换层
**✅ 核心职责**:
- 格式检测 - 自动识别请求格式类型
- 数据转换 - 请求/响应的格式标准化
- 格式验证 - 确保数据完整性

**❌ 不负责**:
- 账号相关逻辑
- 业务规则处理
- OAuth认证流程

### 3. Router Module (`internal/router/`) - 路由决策层
**✅ 核心职责**:
- 账号选择 - 根据策略选择可用账号
- 负载均衡 - 请求分发和故障检测
- 路由决策 - 确定请求处理路径

**❌ 不负责**:
- 账号生命周期管理
- 格式转换处理
- 上游API调用

### 4. Upstream Module (`internal/upstream/`) - 上游服务层
**✅ 核心职责**:
- 账号管理 - CRUD操作、状态跟踪
- OAuth处理 - 完整OAuth流程及业务增强
- API调用 - 实际的上游服务调用
- 特殊逻辑 - 提供商特有的业务规则

**❌ 不负责**:
- 客户端认证
- 请求格式转换
- 路由策略决策

## Cross-Cutting Concerns

### Error Handling - 错误处理分工
- **Transform Module** - 格式错误、转换失败
- **Router Module** - 路由失败、无可用账号
- **Upstream Module** - 上游API错误、OAuth错误
- **Client Module** - HTTP错误、认证失败

### Configuration Management - 配置管理分工
- **Config Module** - 统一配置加载和验证
- **各业务模块** - 定义各自需要的配置结构
- **配置热更新** - Config模块负责，各模块响应变更

### Logging and Monitoring - 日志监控分工
- **Client Module** - 请求日志、认证日志
- **Transform Module** - 格式转换日志
- **Router Module** - 路由决策日志、负载均衡指标
- **Upstream Module** - 上游调用日志、账号状态日志

## Design Principles: Separation of Concerns

### Transform vs Upstream Responsibilities

#### Transform Module - 纯格式处理
- **职责范围** - 仅处理数据格式转换，不包含业务逻辑
- **输入输出** - 接收原始请求，输出标准化格式
- **无状态** - 不依赖账号信息或认证状态
- **可复用** - 格式转换逻辑可在不同场景复用

#### Upstream Module - 业务逻辑处理
- **账号相关** - 处理不同账号类型的特殊需求
- **认证逻辑** - OAuth流程、token管理、系统提示词注入
- **状态管理** - 跟踪账号状态、使用统计
- **业务规则** - 实现特定提供商的业务要求

### Anthropic OAuth特殊处理示例
```go
// Transform模块：纯格式转换
transformer := transform.NewAnthropicTransformer()
request, err := transformer.ParseRequest(rawData)

// Upstream模块：业务逻辑增强
oauthProcessor := upstream.NewOAuthProcessor()
if account.Type == "oauth" {
    err := oauthProcessor.EnhanceRequest(request, account)
    // 注入系统提示词等OAuth特有处理
}

// Transform模块：格式输出
response := transformer.BuildResponse(result)
```

## Data Flow Validation

### Complete Request Processing Flow
```
1. 客户端请求 → [Client] server.go 接收
2. [Client] auth.go 验证客户端 → 认证通过/失败
3. [Transform] detector.go 检测格式 → 格式类型识别
4. [Transform] openai.go/anthropic.go 解析 → 内部标准格式
5. [Router] selector.go 选择账号 → 可用账号列表
6. [Router] balancer.go 负载均衡 → 目标账号
7. [Upstream] manager.go 获取账号信息 → 账号详情
8. [Upstream] oauth.go 增强请求 → 添加业务逻辑(如系统提示词)
9. [Upstream] client.go 调用上游 → 上游API响应
10. [Transform] anthropic.go 处理响应 → 标准化响应
11. [Transform] openai.go/anthropic.go 转换 → 客户端格式
12. [Client] server.go 返回响应 → 客户端接收
```

### Error Flow Examples
```
格式错误: [Transform] detector.go → 400 Bad Request
认证失败: [Client] auth.go → 401 Unauthorized  
无可用账号: [Router] selector.go → 503 Service Unavailable
OAuth失败: [Upstream] oauth.go → 401/403 Auth Error
上游错误: [Upstream] client.go → 根据上游错误码处理
```

### Module Interaction Validation
- ✅ **Client → Transform**: 传递原始请求数据
- ✅ **Transform → Router**: 传递标准化请求 + 格式类型
- ✅ **Router → Upstream**: 传递请求 + 选中账号信息
- ✅ **Upstream → Transform**: 传递上游响应
- ✅ **Transform → Client**: 传递格式化响应

## Infrastructure Components

### Configuration and Types

#### `internal/config/config.go` - 配置管理
- **配置加载** - YAML文件和环境变量
- **配置验证** - 验证配置完整性和正确性
- **热重载** - 支持配置热更新 (可选)
- **默认值** - 提供合理的默认配置

#### `pkg/types/types.go` - 公共类型
- **请求响应结构** - 标准化的请求和响应类型
- **账号类型定义** - Account、UsageStats等
- **错误类型** - 统一的错误处理类型
- **配置类型** - 配置文件对应的结构体

### Core Application
- **cmd/main.go** - CLI command parsing and application entry point