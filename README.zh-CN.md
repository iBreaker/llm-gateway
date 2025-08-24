# LLM Gateway

[English](README.md) | [中文](README.zh-CN.md)

🚀 高性能、多供应商 LLM API 网关，具备智能请求路由和格式转换功能。

## 🌟 功能特性

- **多供应商支持**：无缝集成 Anthropic、OpenAI、Google 和 Azure LLM
- **格式自动检测**：自动检测并转换不同 API 格式（OpenAI ↔ Anthropic）
- **智能负载均衡**：健康优先路由策略，支持自动故障转移
- **OAuth & API Key 支持**：同时支持标准 API 密钥和 OAuth 流程（包括 Claude Code 集成）
- **CLI 管理**：全面的命令行界面，用于账号和密钥管理
- **高性能**：内置连接池、并发请求处理和优化的流式传输
- **生产就绪**：结构化日志、健康检查、监控和强大的错误处理

## 🏗️ 架构设计

```
客户端请求（任意格式） → 格式检测 → 账号选择 → 请求转换 → 上游调用 → 响应转换 → 客户端响应
```

### 核心组件

- **服务器**：HTTP 代理服务器，包含中间件链（认证 → 限流 → CORS → 日志）
- **转换器**：OpenAI 和 Anthropic API 之间的双向格式转换
- **路由器**：智能上游选择，支持健康监控
- **客户端管理器**：Gateway API 密钥管理和认证  
- **上游管理器**：多供应商账号管理，支持 OAuth
- **配置管理器**：线程安全的 YAML 配置，支持自动保存

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
# 添加 Anthropic API Key
./llm-gateway upstream add --type=api-key --provider=anthropic --name="生产账号" --key=sk-ant-xxxxx

# 添加 Anthropic OAuth (Claude Code)
./llm-gateway upstream add --type=oauth --provider=anthropic --name="claude-code"
# 跟随交互式 OAuth 流程...
```

### 3. 创建 Gateway API Key

```bash
./llm-gateway apikey add --name="团队API" --permissions="read,write"
# 请妥善保存生成的 API 密钥！
```

### 4. 启动网关

```bash
./llm-gateway server start
# 服务器在 http://localhost:3847 启动
```

### 5. 使用 OpenAI 兼容请求进行测试

```bash
curl -X POST http://localhost:3847/v1/chat/completions \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "你好！"}],
    "max_tokens": 100
  }'
```

## 📚 CLI 命令参考

### 服务器管理

```bash
./llm-gateway server start          # 启动 HTTP 服务器
./llm-gateway server status         # 显示服务器状态
```

### Gateway API Key 管理

```bash
./llm-gateway apikey add --name="团队A" --permissions="read,write"
./llm-gateway apikey list            # 列出所有 gateway 密钥
./llm-gateway apikey show <key-id>   # 显示密钥详情
./llm-gateway apikey remove <key-id> # 删除密钥
./llm-gateway apikey disable <key-id> # 禁用密钥
```

### 上游账号管理

```bash
# API Key 账号
./llm-gateway upstream add --type=api-key --provider=anthropic --name="生产环境" --key=sk-ant-xxx

# OAuth 账号  
./llm-gateway upstream add --type=oauth --provider=anthropic --name="claude-code"

./llm-gateway upstream list          # 列出所有上游账号
./llm-gateway upstream show <id>     # 显示账号详情
./llm-gateway upstream remove <id>   # 删除账号
./llm-gateway upstream enable <id>   # 启用账号
./llm-gateway upstream disable <id>  # 禁用账号
```

### OAuth 管理

```bash
./llm-gateway oauth start <upstream-id>    # 启动 OAuth 流程
./llm-gateway oauth status <upstream-id>   # 检查 OAuth 状态
./llm-gateway oauth refresh <upstream-id>  # 刷新令牌
```

### 系统监控

```bash
./llm-gateway status                # 整体系统状态
./llm-gateway health                # 健康检查
```

### 环境变量配置

```bash
./llm-gateway env list              # 显示环境变量
./llm-gateway env set --http-proxy=http://proxy:8080
./llm-gateway env show --name=http_proxy
./llm-gateway env unset --name=http_proxy
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
    name: "团队API"
    key_hash: "hashed_key"
    permissions: ["read", "write"]
    status: "active"

upstream_accounts:
  - id: "upstream_xxxxx"
    name: "生产环境-anthropic"
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
- `POST /v1/chat/completions` - OpenAI 兼容聊天完成
- `POST /v1/completions` - OpenAI 兼容文本完成  
- `POST /v1/messages` - Anthropic 原生消息端点

### 支持的请求格式

网关自动检测并转换以下格式：
- **OpenAI 格式**：与 OpenAI GPT 模型兼容
- **Anthropic 格式**：原生 Anthropic Claude API 格式

### 认证

所有 API 请求都需要在 Authorization 头中提供 Gateway API Key：
```
Authorization: Bearer your-gateway-api-key
```

## 🧪 测试

```bash
# 运行所有测试
go test ./...

# 运行带覆盖率的测试
go test -cover ./...

# 运行特定测试套件
go test ./internal/converter/...
go test ./internal/client/...
go test ./internal/upstream/...

# 集成测试
./scripts/integration-test.sh
```

## 🚦 负载均衡与故障转移

网关实现了健康优先路由策略：

1. **健康监控**：对所有上游账号进行持续健康检查
2. **智能选择**：将请求路由到具有最佳性能的健康账号
3. **自动故障转移**：故障时无缝切换到备用账号
4. **断路器**：暂时排除故障账号以防止级联故障

## 🔒 安全特性

- **API Key 认证**：网关级访问控制
- **请求验证**：输入清理和格式验证
- **速率限制**：按密钥的请求速率控制
- **安全存储**：敏感凭据的加密存储
- **环境变量**：代理配置支持
- **CORS 支持**：跨域请求处理

## 📊 监控与可观测性

- **结构化日志**：带有上下文信息的 JSON 格式日志
- **使用统计**：请求计数、成功率和延迟跟踪
- **健康指标**：账号状态和性能监控
- **错误跟踪**：详细的错误日志和分类

## 🤝 贡献

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: 添加令人惊叹的功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

### 开发环境设置

```bash
git clone https://github.com/iBreaker/llm-gateway.git
cd llm-gateway
go mod download
go run cmd/main.go --help
```

### 代码规范

- 遵循 Go 约定和 `gofmt` 格式化
- 使用有意义的变量和函数名
- 为复杂逻辑添加注释
- 为新功能编写测试

## 📄 许可证

本项目使用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🙋 支持

- **问题反馈**：[GitHub Issues](https://github.com/iBreaker/llm-gateway/issues)
- **讨论交流**：[GitHub Discussions](https://github.com/iBreaker/llm-gateway/discussions)
- **文档**：查看 `/docs` 目录获取详细文档

## 🗺️ 路线图

- [ ] 支持更多 LLM 供应商（Google Gemini、Azure OpenAI）
- [ ] 管理和监控 WebUI
- [ ] Prometheus 指标导出
- [ ] Docker Compose 部署
- [ ] Kubernetes Helm charts
- [ ] 请求缓存和去重
- [ ] 高级负载均衡策略
- [ ] 多租户支持

---

**❤️ 由 LLM Gateway 团队用心制作**