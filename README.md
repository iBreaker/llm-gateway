# LLM Gateway

一个轻量级的大语言模型API代理网关，支持多种API格式和多账号管理。

## 功能特性

### 🚀 核心功能
- **多格式支持** - 支持 OpenAI、Anthropic 等主流API格式，自动检测和转换
- **多账号管理** - 支持API Key和OAuth两种认证方式，智能负载均衡
- **故障转移** - 自动检测账号状态，故障时切换到可用账号
- **纯CLI管理** - 完全命令行管理，无Web界面依赖

### 🔐 认证支持
- **Anthropic API Key** - 标准API密钥认证
- **Anthropic OAuth** - Claude Code集成，支持完整OAuth流程
- **Gateway API Key** - 下游客户端访问控制

### 🛠 管理功能
- **配置持久化** - YAML配置文件管理
- **状态监控** - 实时健康检查和使用统计
- **权限控制** - 细粒度权限管理
- **自动刷新** - OAuth token自动维护

## 快速开始

### 安装

```bash
git clone https://github.com/iBreaker/llm-gateway.git
cd llm-gateway
go build -o llm-gateway cmd/main.go
```

### 基本使用

1. **添加上游账号**
   ```bash
   # 添加Anthropic API Key账号
   ./llm-gateway upstream add --type=api-key --key=sk-ant-xxx --name="生产账号"
   
   # 添加Claude Code OAuth账号
   ./llm-gateway upstream add --type=oauth --name="Claude Code账号"
   ```

2. **创建Gateway API Key**
   ```bash
   ./llm-gateway apikey add --name="团队A" --permissions="read,write"
   ```

3. **启动服务**
   ```bash
   ./llm-gateway server start
   ```

## CLI命令参考

### 服务管理
```bash
./llm-gateway server start           # 启动HTTP服务器
./llm-gateway server status          # 查看服务器状态
```

### 上游账号管理
```bash
./llm-gateway upstream add           # 添加上游账号
./llm-gateway upstream list          # 列出所有上游账号
./llm-gateway upstream show <id>     # 显示账号详情
./llm-gateway upstream remove <id>   # 删除账号
./llm-gateway upstream enable <id>   # 启用账号
./llm-gateway upstream disable <id>  # 禁用账号
```

### Gateway API Key管理
```bash
./llm-gateway apikey add             # 添加API Key
./llm-gateway apikey list            # 列出所有API Key
./llm-gateway apikey show <id>       # 显示Key详情
./llm-gateway apikey remove <id>     # 删除Key
./llm-gateway apikey disable <id>    # 禁用Key
```

### OAuth流程管理
```bash
./llm-gateway oauth start <id>       # 启动OAuth授权
./llm-gateway oauth status <id>      # 查看OAuth状态
./llm-gateway oauth refresh <id>     # 刷新OAuth token
```

### 系统状态
```bash
./llm-gateway status                 # 系统整体状态
./llm-gateway health                 # 健康检查
```

### 环境变量管理
```bash
./llm-gateway env list               # 显示环境变量
./llm-gateway env set --http-proxy=http://proxy:8080
./llm-gateway env unset --name=http_proxy
```

## API使用示例

启动服务后，可以使用任意兼容的客户端访问：

### OpenAI格式请求
```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer gateway-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Anthropic格式请求
```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "x-api-key: gateway-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 配置文件

默认配置文件位置：`~/.llm-gateway/config.yaml`

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  timeout: 30

gateway_keys:
  - id: "key-123"
    name: "团队A"
    permissions: ["read", "write"]
    status: "active"

upstream_accounts:
  - id: "account-456"
    name: "生产API账号"
    type: "api-key"
    provider: "anthropic"
    status: "active"
    api_key: "sk-ant-xxxxxxxx"

environment:
  http_proxy: ""
  https_proxy: ""
  no_proxy: ""
```

## 架构特点

### 格式转换
- 自动检测输入API格式（OpenAI/Anthropic）
- 智能转换到目标上游格式
- 保持语义一致性和完整性
- 支持流式和非流式响应

### 负载均衡
- 健康优先策略
- 自动故障检测和隔离
- 智能账号选择
- 请求分发和重试

### 数据安全
- 敏感信息加密存储
- 权限细粒度控制
- 安全的OAuth流程
- 日志脱敏处理

## 开发和测试

### 运行测试
```bash
go test ./...
```

### 调试模式
```bash
export DEBUG=true
./llm-gateway server start
```

### 构建
```bash
make build        # 构建二进制文件
make test         # 运行测试
make clean        # 清理构建产物
```

## 依赖要求

- Go 1.21+
- 支持的操作系统：Linux, macOS, Windows

## 贡献

欢迎提交Issue和Pull Request！

## 联系方式

如有问题，请通过GitHub Issues联系。