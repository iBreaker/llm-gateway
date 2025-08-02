# 系统配置数据库存储方案

## 概述

所有应用配置都存储在 `system_configs` 表中，使用 JSON 格式存储配置值。环境变量仅保留数据库连接信息。

## 配置分类

### 1. 应用基础配置
```json
{
  "key": "app.port",
  "value": 13000,
  "description": "应用服务端口"
}

{
  "key": "app.log_level", 
  "value": "info",
  "description": "日志级别 (debug/info/warn/error)"
}

{
  "key": "app.cors_origins",
  "value": ["http://localhost:13000", "https://yourdomain.com"],
  "description": "允许的 CORS 源"
}
```

### 2. 安全配置
```json
{
  "key": "security.jwt_secret",
  "value": "your-jwt-secret-key",
  "description": "JWT 签名密钥"
}

{
  "key": "security.api_key_salt",
  "value": "your-api-key-salt",
  "description": "API Key 哈希盐值"
}

{
  "key": "security.encryption_key",
  "value": "your-32-character-encryption-key",
  "description": "数据加密密钥"
}

{
  "key": "security.session_timeout",
  "value": 86400,
  "description": "会话超时时间（秒）"
}
```

### 3. 限流配置
```json
{
  "key": "rate_limit.default_per_minute",
  "value": 100,
  "description": "默认每分钟请求限制"
}

{
  "key": "rate_limit.default_per_hour", 
  "value": 1000,
  "description": "默认每小时请求限制"
}

{
  "key": "rate_limit.admin_per_minute",
  "value": 1000,
  "description": "管理员每分钟请求限制"
}
```

### 4. 上游服务配置
```json
{
  "key": "upstream.default_timeout",
  "value": 30000,
  "description": "上游服务默认超时时间（毫秒）"
}

{
  "key": "upstream.default_retry_count",
  "value": 3,
  "description": "上游服务默认重试次数"
}

{
  "key": "upstream.max_concurrent",
  "value": 10,
  "description": "上游服务最大并发数"
}

{
  "key": "upstream.health_check_interval",
  "value": 300000,
  "description": "健康检查间隔（毫秒）"
}
```

### 5. 通知配置
```json
{
  "key": "notification.email.enabled",
  "value": false,
  "description": "是否启用邮件通知"
}

{
  "key": "notification.email.smtp",
  "value": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "auth": {
      "user": "your-email@gmail.com",
      "pass": "your-app-password"
    }
  },
  "description": "SMTP 邮件配置"
}

{
  "key": "notification.webhook.enabled",
  "value": false,
  "description": "是否启用 Webhook 通知"
}

{
  "key": "notification.webhook.url",
  "value": "https://hooks.slack.com/services/xxx",
  "description": "Webhook 通知 URL"
}
```

### 6. 监控配置
```json
{
  "key": "monitoring.metrics_enabled",
  "value": true,
  "description": "是否启用指标收集"
}

{
  "key": "monitoring.metrics_port",
  "value": 19090,
  "description": "指标服务端口"
}

{
  "key": "monitoring.alert_thresholds",
  "value": {
    "error_rate": 0.05,
    "response_time_p95": 2000,
    "cpu_usage": 0.8,
    "memory_usage": 0.85
  },
  "description": "告警阈值配置"
}
```

## 配置访问方式

### 1. 同步获取配置
```typescript
const config = await getConfig('app.port', 13000); // 默认值 13000
```

### 2. 批量获取配置
```typescript
const configs = await getConfigs([
  'app.port',
  'app.log_level',
  'security.jwt_secret'
]);
```

### 3. 更新配置
```typescript
await setConfig('app.log_level', 'debug');
```

### 4. 配置缓存
配置支持内存缓存，减少数据库查询：
- 缓存时间：5分钟
- 配置更新时自动清除缓存
- 支持手动刷新缓存

## 配置管理接口

### GET /api/admin/configs
获取所有配置列表

### GET /api/admin/configs/:key  
获取指定配置

### PUT /api/admin/configs/:key
更新指定配置

### POST /api/admin/configs
批量更新配置

### DELETE /api/admin/configs/cache
清除配置缓存

## 安全考虑

1. **敏感配置加密**：密钥类配置在数据库中加密存储
2. **权限控制**：只有管理员可以修改系统配置
3. **审计日志**：所有配置变更都记录在 `audit_logs` 表中
4. **配置验证**：配置更新前进行格式和有效性验证

## 默认配置

系统首次启动时会自动初始化所有默认配置，确保应用正常运行。