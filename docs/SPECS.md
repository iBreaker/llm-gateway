# 产品功能规格说明书

## 文档概述

本文档详细描述 LLM Gateway 的各项功能规格，按照开发优先级排序，包括功能模块、交互流程、数据结构和业务规则。

## 功能模块详细规格（按优先级排序）

### 1. 上游账号池管理模块（高优先级）

#### 1.1 账号添加
**功能描述**：支持添加和验证 Claude Code 和 Gemini CLI 账号

**支持的账号类型**：
- Claude Code 账号
- Gemini CLI 账号

**Claude Code 账号字段**：
```json
{
  "name": "账号名称",
  "type": "claude-code",
  "credentials": {
    "session_key": "会话密钥",
    "api_endpoint": "API 端点",
    "user_agent": "用户代理"
  },
  "config": {
    "max_concurrent": 10,
    "timeout": 30000,
    "retry_count": 3
  }
}
```

**Gemini CLI 账号字段**：
```json
{
  "name": "账号名称", 
  "type": "gemini-cli",
  "credentials": {
    "api_key": "API 密钥",
    "project_id": "项目ID"
  },
  "config": {
    "max_concurrent": 5,
    "timeout": 30000,
    "retry_count": 3
  }
}
```

#### 1.2 账号验证
**验证流程**：
1. 解析账号凭据
2. 发送测试请求
3. 验证响应格式
4. 检查账号配额
5. 保存验证结果

**验证状态**：
- `pending`: 等待验证
- `valid`: 验证通过
- `invalid`: 验证失败
- `expired`: 凭据过期
- `quota_exceeded`: 配额耗尽

#### 1.3 健康检查
**检查频率**：每 5 分钟检查一次

**检查项目**：
- 账号可用性
- 响应时间
- 错误率统计
- 配额使用情况

**异常处理**：
- 连续 3 次失败标记为不可用
- 自动切换到备用账号
- 发送告警通知

### 2. API Key 管理模块（高优先级）

#### 2.1 API Key 生成
**生成规则**：
- 使用 UUID v4 + 时间戳
- 格式：`llmgw_` + 32位随机字符串
- 支持自定义前缀

**权限级别**：
- `read`: 只读权限，仅查看统计
- `write`: 读写权限，可以调用 API
- `admin`: 管理权限，可以管理账号池

#### 2.2 使用限制
**限制类型**：
- 每分钟请求数限制
- 每小时请求数限制
- 每日请求数限制
- 总配额限制

**限制策略**：
- 滑动窗口算法
- 超出限制返回 429 状态码
- 支持突发流量缓冲

#### 2.3 统计追踪
**统计维度**：
- 请求总数
- 成功/失败次数
- 平均响应时间
- 使用的上游账号
- 请求时间分布

### 3. 智能路由模块（高优先级）

#### 3.1 负载均衡算法
**算法选项**：
1. **轮询 (Round Robin)**：依次分配请求
2. **加权轮询 (Weighted Round Robin)**：根据账号权重分配
3. **最少连接 (Least Connections)**：选择连接数最少的账号
4. **响应时间优先 (Fastest Response)**：选择响应时间最短的账号

#### 3.2 故障转移
**转移策略**：
- 主账号失败时自动切换到备用账号
- 支持多级备用账号
- 失败重试机制（最多3次）
- 熔断器模式防止级联故障

#### 3.3 智能调度
**调度因子**：
- 账号可用性 (40%)
- 响应时间 (30%)
- 成功率 (20%)
- 配额剩余 (10%)

**调度公式**：
```
Score = Availability * 0.4 + (1/ResponseTime) * 0.3 + SuccessRate * 0.2 + QuotaRemaining * 0.1
```

### 4. 使用统计模块（高优先级）

#### 4.1 使用量统计
**统计项目**：
- API 调用次数
- 数据传输量
- 处理时间
- 错误次数

**统计精度**：
- 实时统计（Redis 缓存或内存缓存）
- 分钟级聚合（每分钟写入数据库）
- 小时级聚合（定时任务）
- 日级聚合（定时任务）

#### 4.2 报告生成
**报告类型**：
- 使用量报告
- 成本分析报告
- 性能分析报告
- 错误统计报告

**导出格式**：
- PDF 报告
- Excel 表格
- CSV 数据
- JSON API

### 5. 用户认证与授权模块（中优先级）

#### 5.1 用户注册
**功能描述**：支持用户通过邮箱注册账号

**输入参数**：
- 邮箱地址（必填，格式验证）
- 密码（必填，8-32位，包含数字和字母）
- 确认密码（必填，与密码一致）
- 用户名称（可选）

**业务规则**：
- 邮箱不可重复注册
- 密码强度检查
- 发送邮箱验证码
- 注册成功后创建用户记录

**输出结果**：
- 成功：返回用户 ID 和待验证状态
- 失败：返回具体错误信息

#### 5.2 用户登录
**功能描述**：支持邮箱密码登录

**输入参数**：
- 邮箱地址
- 密码
- 记住登录（可选）

**业务规则**：
- 密码错误超过 5 次锁定账号 30 分钟
- 未验证邮箱的用户需要先验证
- 登录成功生成 JWT Token

**输出结果**：
- 成功：返回 Access Token 和 Refresh Token
- 失败：返回错误信息和剩余尝试次数

#### 5.3 权限管理
**角色定义**：
- **系统管理员**：系统最高权限
- **普通用户**：基础使用权限
- **只读用户**：仅查看权限

**权限矩阵**：
```
功能 / 角色          | 系统管理员 | 普通用户 | 只读用户
--------------------|----------|---------|--------
账号池管理           | ✓        | ✗       | ✗
API Key 管理        | ✓        | ✓       | ✗
使用统计查看         | ✓        | ✓       | ✓
系统配置            | ✓        | ✗       | ✗
```

### 6. 计费系统模块（中优先级）

#### 6.1 计费模式
**计费方式**：
1. **按调用次数**：每次 API 调用计费
2. **按处理时间**：根据实际处理时间计费
3. **按数据量**：根据输入/输出数据量计费
4. **包月套餐**：固定月费，包含一定用量

**定价示例**：
```json
{
  "pricing": {
    "per_request": 0.01,
    "per_minute": 0.05,
    "per_mb": 0.001
  },
  "packages": [
    {
      "name": "基础版",
      "monthly_fee": 29,
      "included_requests": 10000,
      "overage_rate": 0.008
    }
  ]
}
```

#### 6.2 发票生成
**发票内容**：
- 计费周期
- 使用量详情
- 费用明细
- 税费计算
- 支付信息

### 7. 监控告警模块（中优先级）

#### 7.1 监控指标
**系统指标**：
- CPU 使用率
- 内存使用率
- 磁盘使用率
- 网络流量

**业务指标**：
- API 请求量
- 响应时间分布
- 错误率
- 账号可用性

#### 7.2 告警规则
**告警级别**：
- `info`: 信息提醒
- `warning`: 警告提醒  
- `error`: 错误告警
- `critical`: 严重故障

**通知方式**：
- 邮件通知
- 短信通知
- 钉钉/企业微信
- Webhook 回调

### 8. Web 管理界面（中优先级）

#### 8.1 仪表盘
**概览信息**：
- 实时使用统计
- 账号状态总览
- 近期告警信息
- 成本趋势图表

#### 8.2 账号管理页面
**功能特性**：
- 账号列表展示
- 添加/编辑/删除账号
- 批量操作
- 状态筛选
- 健康检查结果

#### 8.3 统计报告页面
**报告类型**：
- 使用量报告
- 成本分析报告
- 性能分析报告
- 用户行为报告

**导出格式**：
- PDF 报告
- Excel 表格
- CSV 数据
- API 接口

### 9. 多租户管理模块（低优先级）

#### 9.1 租户创建
**功能描述**：创建新的租户组织

**输入参数**：
- 租户名称（必填，2-50字符）
- 租户描述（可选，最多200字符）
- 联系邮箱（必填）
- 行业类型（可选）

**业务规则**：
- 租户名称不可重复
- 自动生成租户 ID
- 创建者自动成为租户管理员
- 初始化默认配置

#### 9.2 用户邀请
**功能描述**：邀请用户加入租户

**输入参数**：
- 邀请用户邮箱
- 用户角色
- 邀请消息（可选）

**业务流程**：
1. 验证邀请者权限
2. 检查被邀请用户是否已存在
3. 发送邀请邮件
4. 记录邀请状态
5. 被邀请用户确认后加入租户

## 数据模型设计

### 核心表结构

#### users 表
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar_url VARCHAR(500),
  email_verified BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### upstream_accounts 表
```sql
CREATE TABLE upstream_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  credentials JSONB NOT NULL,
  config JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  health_check_at TIMESTAMP,
  health_status JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### api_keys 表
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  rate_limits JSONB DEFAULT '{}',
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### usage_stats 表
```sql
CREATE TABLE usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  upstream_account_id UUID REFERENCES upstream_accounts(id),
  request_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_response_time INTEGER DEFAULT 0,
  data_transferred BIGINT DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 接口规范

### API 设计原则
- RESTful 风格
- JSON 格式数据
- HTTP 状态码标准化
- 统一错误处理格式
- API 版本管理 (`/api/v1/`)

### 认证方式
```http
Authorization: Bearer <jwt_token>
X-API-Key: <api_key>
```

### 响应格式
```json
{
  "success": true,
  "data": {},
  "message": "操作成功",
  "timestamp": "2025-07-31T10:00:00Z",
  "request_id": "req_123456"
}
```

### 错误格式
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "参数验证失败",
    "details": [
      {
        "field": "email",
        "message": "邮箱格式不正确"
      }
    ]
  },
  "timestamp": "2025-07-31T10:00:00Z",
  "request_id": "req_123456"
}
```

---

*文档版本: v1.1*  
*最后更新: 2025-07-31*
*修订说明: 重新按优先级组织模块结构，修复业务逻辑冲突*