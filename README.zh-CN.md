# LLM Gateway

[English](README.md) | [中文](README.zh-CN.md)

🚀 高性能 LLM API 网关，具备智能格式转换和请求路由功能。

## 🌟 功能特性

- **多供应商支持**：无缝集成 Anthropic Claude 和 OpenAI 兼容的供应商
- **格式自动转换**：自动检测并转换 OpenAI 和 Anthropic API 格式
- **流式传输支持**：完整支持服务器发送事件（SSE），具备智能事件排序
- **工具调用**：不同供应商格式之间工具/函数调用的无缝转换
- **智能路由**：健康优先路由策略，支持自动故障转移
- **OAuth & API Key 支持**：同时支持 API 密钥和 OAuth 流程（包括 Claude Code 集成）
- **CLI 管理**：全面的命令行界面，用于配置管理

## 🏗️ 架构设计

```
客户端请求（任意格式） → 格式检测 → 统一内部格式 → 供应商选择 → 供应商特定格式 → 上游调用 → 响应转换 → 客户端响应
```

### 核心组件

- **格式转换器**：OpenAI 和 Anthropic 格式之间的双向转换，具备统一内部表示
- **请求路由器**：健康优先的上游选择，支持自动故障转移
- **配置管理器**：线程安全的 YAML 配置，支持持久化
- **OAuth 管理器**：处理支持 OAuth 的供应商的认证流程
- **流式处理**：每个流的状态转换器，具备智能事件生成

## 📦 安装

### 系统要求

- Go 1.21 或更高版本
- Git

### 从源码构建

```bash
git clone https://github.com/iBreaker/llm-gateway.git
cd llm-gateway
go build -o llm-gateway cmd/main.go
```

### 使用 Docker

```bash
docker build -t llm-gateway .
docker run -p 3847:3847 -v $(pwd)/config:/app/config llm-gateway
```

## 🚀 快速开始

### 1. 初始化配置

```bash
# 首次运行会在 ~/.llm-gateway/config.yaml 创建默认配置
./llm-gateway server status
```

### 2. 添加上游供应商账号

```bash
# 添加 Anthropic API 密钥
./llm-gateway upstream add --type=api-key --provider=anthropic --name="prod-account" --key=sk-ant-xxxxx

# 添加 OAuth 账号（Claude Code）
./llm-gateway upstream add --type=oauth --provider=anthropic --name="claude-code"
# 按照交互式 OAuth 流程操作...
```

### 3. 创建网关 API 密钥

```bash
./llm-gateway apikey add --name="team-api" --permissions="read,write"
# 请安全保存生成的 API 密钥！
```

### 4. 启动网关

```bash
./llm-gateway server start
# 服务器启动在 http://localhost:3847（默认端口）
```

### 5. 测试 API 请求

```bash
# OpenAI 兼容请求（如果路由到 Claude 会自动转换为 Anthropic 格式）
curl -X POST http://localhost:3847/v1/chat/completions \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "你好！"}],
    "max_tokens": 100
  }'

# Anthropic 原生格式请求
curl -X POST http://localhost:3847/v1/messages \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229", 
    "system": "你是一个有用的助手。",
    "messages": [{"role": "user", "content": "你好！"}],
    "max_tokens": 100
  }'

# 带工具调用的流式请求
curl -X POST http://localhost:3847/v1/chat/completions \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "现在几点了？"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_current_time",
        "description": "获取当前时间"
      }
    }],
    "stream": true
  }'
```

## 📚 CLI 参考

### 服务器管理

```bash
./llm-gateway server start          # 启动 HTTP 服务器
./llm-gateway server status         # 显示服务器状态
```

### 网关 API 密钥管理

```bash
./llm-gateway apikey add --name="team-a" --permissions="read,write"
./llm-gateway apikey list            # 列出所有网关密钥
./llm-gateway apikey show <key-id>   # 显示密钥详情
./llm-gateway apikey remove <key-id> # 删除密钥
```

### 上游账号管理

```bash
# API 密钥账号
./llm-gateway upstream add --type=api-key --provider=anthropic --name="prod" --key=sk-ant-xxx

# OAuth 账号  
./llm-gateway upstream add --type=oauth --provider=anthropic --name="claude-code"

./llm-gateway upstream list          # 列出所有上游账号
./llm-gateway upstream show <id>     # 显示账号详情
./llm-gateway upstream remove <id>   # 删除账号
```

### OAuth 管理

```bash
./llm-gateway oauth start <upstream-id>    # 启动 OAuth 流程
./llm-gateway oauth status <upstream-id>   # 检查 OAuth 状态
./llm-gateway oauth refresh <upstream-id>  # 刷新令牌
```

### 系统状态

```bash
./llm-gateway status                # 整体系统状态
./llm-gateway health                # 健康检查
```

### 环境配置

```bash
./llm-gateway env list              # 显示环境变量
./llm-gateway env set --http-proxy=http://proxy:8080
./llm-gateway env show --name=http_proxy
```

## 🔧 配置

网关使用位于 `~/.llm-gateway/config.yaml` 的 YAML 配置文件：

```yaml
server:
  host: "0.0.0.0"
  port: 3847
  timeout: 30

proxy:
  request_timeout: 60
  stream_timeout: 300
  connect_timeout: 10
  tls_timeout: 10
  idle_conn_timeout: 90
  response_timeout: 30

gateway_keys:
  - id: "gw_xxxxx"
    name: "team-api"
    key_hash: "hashed_key"
    permissions: ["read", "write"]
    status: "active"

upstream_accounts:
  - id: "upstream_xxxxx"
    name: "production-anthropic"
    type: "api-key"
    provider: "anthropic"
    api_key: "sk-ant-xxxxx"
    status: "active"

logging:
  level: "info"
  format: "json"

environment:
  http_proxy: ""
  https_proxy: ""
  no_proxy: "localhost,127.0.0.1,::1"
```

## 🔌 API 端点

### 健康检查
- `GET /health` - 服务健康状态

### LLM API 代理
- `POST /v1/chat/completions` - OpenAI 兼容的聊天完成
- `POST /v1/completions` - OpenAI 兼容的文本完成（映射到聊天完成）  
- `POST /v1/messages` - Anthropic 原生消息端点

### 支持的请求格式

网关自动检测并转换以下格式：

- **OpenAI 格式**：兼容 OpenAI GPT 模型和 OpenAI 兼容供应商
- **Anthropic 格式**：原生 Anthropic Claude API 格式

#### 格式转换功能

- **双向转换**：OpenAI ↔ Anthropic 格式之间的无缝转换
- **系统消息处理**：格式间系统消息的正确转换  
- **工具调用支持**：不同格式间工具/函数调用的完整转换
- **流式兼容性**：在格式转换过程中保持流式支持
- **元数据保留**：在格式转换期间保留重要元数据

### 身份验证

所有 API 请求都需要网关 API 密钥：
```
Authorization: Bearer your-gateway-api-key
```

## 🧪 测试

```bash
# 运行所有测试
go test ./...

# 运行测试并显示覆盖率
go test -cover ./...

# 运行特定测试套件
go test ./internal/converter/...           # 格式转换测试
go test ./internal/upstream/...            # 上游管理测试
go test ./tests/...                        # 集成测试

# 运行格式一致性测试
go test ./internal/converter/ -run TestRequestConsistency
go test ./internal/converter/ -run TestSpecificFieldPreservation
```

## 🚦 负载均衡与路由

网关实现健康优先路由策略：

1. **健康监控**：跟踪所有上游账号的健康状态
2. **智能选择**：优先将请求路由到健康且性能最佳的账号
3. **自动故障转移**：当主要账号失败时自动切换到备用账号
4. **供应商匹配**：根据请求格式自动选择兼容的上游供应商

## 📊 监控与可观察性

- **结构化日志**：包含上下文信息的 JSON 格式日志
- **健康跟踪**：账号状态监控和健康检查
- **调试模式**：用于排查格式转换和路由问题的详细日志

## 🔧 故障排除

### 常见问题

**问题**：流式响应中出现"Content block not found"错误
- **解决方案**：网关自动生成缺失的 `content_block_start` 事件以确保 Anthropic 格式合规

**问题**：某些供应商的工具调用无法工作  
- **解决方案**：网关在转换过程中自动处理工具调用格式差异

**问题**：OAuth 令牌过期
- **解决方案**：使用 `./llm-gateway oauth refresh <upstream-id>` 刷新令牌

### 调试模式

```bash
# 启用调试日志
LOG_LEVEL=debug ./llm-gateway server start

# 检查系统健康
./llm-gateway health

# 验证配置
./llm-gateway status
```

## 📁 项目结构

```
.
├── cmd/                    # 应用程序入口点
├── internal/               # 私有应用程序代码
│   ├── app/               # 应用程序初始化
│   ├── cli/               # CLI 命令实现  
│   ├── config/            # 配置管理
│   ├── converter/         # 格式转换逻辑
│   ├── router/            # 请求路由逻辑
│   ├── server/            # HTTP 服务器和处理程序
│   └── upstream/          # 上游供应商管理
├── pkg/                   # 公共库代码
│   ├── debug/            # 调试工具
│   ├── logger/           # 日志工具
│   └── types/            # 共享类型定义
├── tests/                 # 集成测试
├── docs/                  # 文档
└── scripts/               # 构建和工具脚本
```

## 🤝 贡献

1. Fork 此仓库
2. 创建你的功能分支（`git checkout -b feature/amazing-feature`）
3. 提交你的更改（`git commit -m 'feat: add amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 开启 Pull Request

### 开发环境设置

```bash
git clone https://github.com/iBreaker/llm-gateway.git
cd llm-gateway
go mod download
go run cmd/main.go server status
```

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🙋 支持

- **问题反馈**：[GitHub Issues](https://github.com/iBreaker/llm-gateway/issues)
- **文档**：查看 `/docs` 目录获取更多文档

## 🗺️ 路线图

- [x] ~~OpenAI ↔ Anthropic 格式转换~~
- [x] ~~智能事件排序的流式支持~~
- [x] ~~OAuth 认证流程~~
- [x] ~~工具调用格式转换~~
- [ ] 支持更多 LLM 供应商（Google Gemini、Azure OpenAI）
- [ ] 管理和监控 Web 界面
- [ ] 监控和指标端点
- [ ] 高级路由策略
- [ ] 请求缓存和优化

---

**LLM Gateway - 简化多供应商 LLM 集成**