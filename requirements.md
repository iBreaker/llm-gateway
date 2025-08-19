# LLM Gateway 核心需求文档

## 1. 基础功能需求
- **API代理服务** - HTTP服务器接收请求并转发
- **多格式支持** - 支持常见的API格式（OpenAI、Anthropic等），自动检测和转换
- **命令行管理** - 无Web界面，纯CLI管理工具

## 2. 账号管理需求

### 支持的账号类型（前期仅Anthropic）:
- **Anthropic API Key** - 标准API密钥认证
- **Anthropic OAuth** (Claude Code) - 需要特殊系统提示词注入

### 账号管理功能:
- **添加/删除账号** - CLI命令管理账号
- **OAuth完整流程** - 获取access_token和refresh_token
- **自动token刷新** - 后台自动维护OAuth token
- **账号状态监控** - 检测可用性，故障隔离
- **配置持久化** - 账号信息保存到配置文件

## 3. 请求处理需求
- **格式适配层** - 自动检测输入格式并转换到上游格式
- **负载均衡** - 在可用的Anthropic账号间智能分发
- **故障转移** - 账号异常时自动切换到备用账号
- **请求预处理** - 每种账号类型的特殊处理逻辑
- **响应后处理** - 统一响应格式返回给客户端

## 4. 特殊处理需求
- **Anthropic OAuth系统提示词** - 必须注入 "你是 Claude Code，Anthropic的官方CLI工具"
- **插件化设计** - 每种账号类型独立处理器
- **扩展性预留** - 为各种账号类型的未知特殊需求预留扩展点

## 5. 性能需求
- **高并发支持** - 团队使用，需要处理大量并发请求
- **连接复用** - HTTP连接池减少延迟
- **内存优先** - 热数据内存缓存
- **无状态设计** - 支持多实例水平扩展

## 6. 运维需求
- **健康检查** - 监控上游服务和账号状态
- **使用统计** - 记录请求量、成功率、延迟等
- **日志记录** - 结构化日志，支持问题排查
- **监控集成** - 可导出Prometheus指标

## 7. 安全需求
- **API Key认证** - 客户端访问认证
- **敏感信息加密** - 账号密钥加密存储
- **权限控制** - OAuth最小权限申请

## 8. 核心工作流程
```
客户端请求(任意格式) → 格式检测 → 账号选择 → 请求转换 → 上游调用 → 响应转换 → 返回客户端
```

## 9. CLI管理命令
```bash
# 服务启动
./llm-gateway server

# API Key账号管理
./llm-gateway add-api-key --key=sk-ant-xxx --name="生产账号1"
./llm-gateway list-accounts
./llm-gateway disable-account --id=xxx
./llm-gateway enable-account --id=xxx
./llm-gateway remove-account --id=xxx

# OAuth账号管理
./llm-gateway add-oauth --client-id=xxx --client-secret=xxx --name="Claude Code团队"
./llm-gateway oauth-start --account-id=xxx
./llm-gateway oauth-callback --code=xxx --account-id=xxx
./llm-gateway oauth-refresh --account-id=xxx
./llm-gateway oauth-status

# 状态查看
./llm-gateway status
./llm-gateway stats
./llm-gateway health-check
```

## 10. 配置文件示例
```yaml
server:
  host: "0.0.0.0"
  port: 8080
  timeout_seconds: 30

auth:
  api_keys:
    - "gateway-key-12345"
    - "gateway-key-67890"

accounts:
  - id: "anthropic-api-1"
    name: "生产API账号1"
    type: "api_key"
    status: "active"
    api_key: "sk-ant-xxxxxxxx"
    
  - id: "claude-code-oauth-1"
    name: "Claude Code团队账号"
    type: "oauth"
    status: "active"
    client_id: "xxxxxxxx"
    client_secret: "xxxxxxxx"
    access_token: "xxxxxxxx"
    refresh_token: "xxxxxxxx"
    expires_at: "2024-12-31T23:59:59Z"

logging:
  level: "info"
  format: "json"
  file: "/var/log/llm-gateway.log"
```

## 11. 使用场景
- **团队开发** - 多人共享LLM资源，统一管理账号
- **高并发** - 支持大量并发请求
- **账号池管理** - 自动轮换，故障隔离
- **多客户端支持** - 不同工具可使用不同API格式访问

## 12. 技术选择
- **语言**: Go
- **架构**: 极简单体架构
- **配置**: YAML文件
- **管理**: 纯CLI，无Web界面
- **存储**: 配置文件 + 内存缓存