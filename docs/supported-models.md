# LLM Gateway 支持的模型列表

本文档记录了LLM Gateway经过测试验证支持的模型列表。

## API 格式对比

| 特性 | OpenAI | Anthropic |
|------|---------|-----------|
| **主要端点** | `/v1/chat/completions` | `/v1/messages` |
| **系统消息** | messages数组中的system角色 | 独立的system字段 |
| **必需字段** | model, messages | model, max_tokens, messages |
| **模型命名** | `gpt-4o`, `gpt-4o-mini` | `claude-3-5-sonnet`, `claude-3-5-haiku` |
| **停止参数** | stop (array/string) | stop_sequences (array) |
| **Token统计** | prompt_tokens, completion_tokens | input_tokens, output_tokens |
| **温度范围** | 0.0 - 2.0 | 0.0 - 1.0 |
| **角色支持** | system, user, assistant, function | user, assistant |

## 测试结果总览

✅ **经过验证可用的模型**  
❌ **测试失败的模型**  
⚠️ **需要进一步验证的模型**

---

## Anthropic Claude 模型

### ✅ Claude 4 系列 - 已验证可用

| 模型名称 | API 标识符 | 描述 | 状态 |
|----------|------------|------|------|
| Claude Opus 4.1 | `claude-opus-4-1-20250805` | 最新最强大的模型 | ✅ 可用 |
| Claude Opus 4.1 | `claude-opus-4-1` | Opus 4.1 别名 | ✅ 可用 |
| Claude Opus 4.0 | `claude-opus-4-20250514` | Opus 4.0 版本 | ✅ 可用 |
| Claude Opus 4.0 | `claude-opus-4-0` | Opus 4.0 别名 | ✅ 可用 |
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | Sonnet 4 版本 | ✅ 可用 |
| Claude Sonnet 4 | `claude-sonnet-4-0` | Sonnet 4 别名 | ✅ 可用 |

### ✅ Claude 3.7 系列 - 已验证可用

| 模型名称 | API 标识符 | 描述 | 状态 |
|----------|------------|------|------|
| Claude 3.7 Sonnet | `claude-3-7-sonnet-20250219` | 混合推理模型 | ✅ 可用 |
| Claude 3.7 Sonnet | `claude-3-7-sonnet-latest` | 3.7 Sonnet 最新版 | ✅ 可用 |

### ✅ Claude 3.5 系列 - 已验证可用

| 模型名称 | API 标识符 | 描述 | 状态 |
|----------|------------|------|------|
| Claude 3.5 Sonnet | `claude-3-5-sonnet-20241022` | 平衡性能模型 | ✅ 可用 |
| Claude 3.5 Sonnet | `claude-3-5-sonnet-latest` | 3.5 Sonnet 最新版 | ✅ 可用 |
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | 快速响应模型 | ✅ 可用 |
| Claude 3.5 Haiku | `claude-3-5-haiku-latest` | 3.5 Haiku 最新版 | ✅ 可用 |

### ❌ Claude 3 系列 - 测试失败

| 模型名称 | API 标识符 | 描述 | 状态 | 错误信息 |
|----------|------------|------|------|----------|
| Claude 3 Sonnet | `claude-3-sonnet` | 旧版 Sonnet | ❌ 失败 | Invalid model name |
| Claude 3 Haiku | `claude-3-haiku` | 旧版 Haiku | ❌ 失败 | Invalid model name |

### ❌ 旧版 Claude 模型 - 已废弃

| 模型名称 | API 标识符 | 状态 | 说明 |
|----------|------------|------|------|
| Claude 2.1 | `claude-2.1` | ❌ 不可用 | 模型已废弃 |
| Claude 2.0 | `claude-2.0` | ❌ 不可用 | 模型已废弃 |
| Claude 2 | `claude-2` | ❌ 不可用 | 模型已废弃 |
| Claude Instant 1.2 | `claude-instant-1.2` | ❌ 不可用 | 模型已废弃 |
| Claude Instant 1 | `claude-instant-1` | ❌ 不可用 | 模型已废弃 |
| Claude Instant | `claude-instant` | ❌ 不可用 | 模型已废弃 |

---

## 推荐使用的模型

### 按用途分类

**🚀 高性能任务**
- `claude-opus-4-1` - 最强大的推理能力
- `claude-opus-4-0` - 稳定的高性能版本

**⚡ 平衡性能**
- `claude-sonnet-4-0` - 高性能与效率平衡
- `claude-3-5-sonnet-latest` - 平衡性能模型

**💨 快速响应**
- `claude-3-5-haiku-latest` - 最快的响应速度

### 按场景分类

**代码开发和Agent任务**
```json
{
  "model": "claude-opus-4-1",
  "max_tokens": 4000,
  "messages": [{"role": "user", "content": "编写一个Python函数..."}]
}
```

**日常问答和对话**
```json
{
  "model": "claude-3-5-haiku-latest", 
  "max_tokens": 1000,
  "messages": [{"role": "user", "content": "解释一下..."}]
}
```

**复杂分析和推理**
```json
{
  "model": "claude-3-5-sonnet-latest",
  "max_tokens": 2000,
  "messages": [{"role": "user", "content": "分析以下数据..."}]
}
```

---

## 使用说明

### 1. API端点

所有Claude模型都通过以下端点访问：
- Anthropic原生格式：`POST /v1/messages`
- OpenAI兼容格式：`POST /v1/chat/completions`

### 2. 认证

使用Gateway API Key进行认证：
```bash
curl -X POST "http://localhost:3847/v1/messages" \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json"
```

### 3. 请求示例

**基础请求：**
```json
{
  "model": "claude-opus-4-1",
  "max_tokens": 1000,
  "messages": [
    {"role": "user", "content": "Hello!"}
  ]
}
```

**带系统提示的请求：**
```json
{
  "model": "claude-3-5-sonnet-latest",
  "max_tokens": 1000,
  "system": "You are a helpful assistant.",
  "messages": [
    {"role": "user", "content": "Explain quantum computing"}
  ]
}
```

---

## 模型特性对比

| 特性 | Opus 4.1 | Sonnet 4 | Sonnet 3.5 | Haiku 3.5 |
|------|----------|----------|------------|-----------|
| **推理能力** | 最强 | 很强 | 强 | 中等 |
| **响应速度** | 慢 | 中等 | 中等 | 最快 |
| **适用场景** | 复杂任务 | 平衡使用 | 平衡使用 | 快速问答 |
| **成本** | 最高 | 高 | 中等 | 最低 |
| **上下文长度** | 很长 | 长 | 长 | 中等 |

---

## 测试验证

### 运行测试

```bash
# 运行完整的Anthropic模型测试
./tests/anthropic-direct-test.sh

# 运行快速验证
curl -X POST "http://localhost:3847/v1/messages" \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-latest",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 测试结果解读

- **HTTP 200**: 模型可用，请求成功
- **HTTP 502**: 上游API错误，检查模型名称
- **HTTP 401**: 认证失败，检查API Key
- **HTTP 400**: 请求格式错误

---

## 更新记录

- **2025-01-XX**: 更新模型名称格式，将 claude-3-sonnet 更新为 claude-3-5-sonnet
- **2025-08-20**: 初始测试验证，确认Claude 4系列和3.7、3.5系列可用
- **2025-08-20**: 发现Claude 3系列旧版本已废弃，Claude 2系列完全不可用

---

## 注意事项

1. **模型可用性会变化**: 建议定期运行测试验证
2. **使用别名时要谨慎**: 生产环境建议使用具体版本号
3. **成本控制**: 高性能模型成本较高，合理选择
4. **响应时间**: 不同模型响应时间差异很大
5. **上下文限制**: 注意各模型的token限制
6. **模型命名格式**: 注意使用最新的模型命名格式，如 `claude-3-5-sonnet` 而不是 `claude-3-sonnet`