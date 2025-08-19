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

## 9. CLI管理命令（子命令架构）

### 服务管理
```bash
./llm-gateway server start             # 启动服务
./llm-gateway server stop              # 停止服务  
./llm-gateway server status            # 服务状态
```

### 账号管理
```bash
# 账号CRUD操作
./llm-gateway account add --type=api-key --key=sk-ant-xxx --name="生产账号"
./llm-gateway account add --type=oauth --client-id=xxx --client-secret=xxx --name="Claude Code"
./llm-gateway account list             # 列出所有账号
./llm-gateway account show <account-id> # 显示账号详情
./llm-gateway account remove <account-id> # 删除账号
./llm-gateway account enable <account-id> # 启用账号
./llm-gateway account disable <account-id> # 禁用账号
```

### OAuth专用管理
```bash
./llm-gateway oauth start <account-id>  # 启动OAuth授权流程
./llm-gateway oauth callback --code=xxx --account-id=<account-id> # 处理OAuth回调
./llm-gateway oauth refresh <account-id> # 刷新OAuth token
./llm-gateway oauth status <account-id>  # 查看OAuth状态
```

### 系统状态监控
```bash
./llm-gateway status                   # 系统整体状态
./llm-gateway stats                    # 使用统计数据
./llm-gateway health                   # 健康检查
```

### 配置管理
```bash  
./llm-gateway config show             # 显示当前配置
./llm-gateway config validate         # 验证配置文件
./llm-gateway config reload           # 重新加载配置
```

### CLI命令层次结构
```
llm-gateway
├── server (start|stop|status)
├── account (add|list|show|remove|enable|disable)  
├── oauth (start|callback|refresh|status)
├── status
├── stats  
├── health
└── config (show|validate|reload)
```

### 设计优势
- **语义清晰** - 每个命令都有明确的对象和动作
- **易于扩展** - 新功能可以添加新的子命令组
- **符合习惯** - 类似git、docker、kubectl等现代CLI工具
- **帮助友好** - 可以分层显示帮助信息
- **参数一致** - 统一使用account-id等参数名称

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