# LLM Gateway API 格式规范

本文档详细描述了LLM Gateway支持的两种主要API格式：OpenAI格式和Anthropic格式。

## 目录

1. [核心差异对比](#核心差异对比)
2. [OpenAI API 格式](#openai-api-格式)
3. [Anthropic API 格式](#anthropic-api-格式)
4. [格式检测规则](#格式检测规则)
5. [格式转换映射](#格式转换映射)
6. [错误响应格式](#错误响应格式)
7. [Stream格式规范](#stream格式规范)
8. [最佳实践](#最佳实践)

---

## 核心差异对比

### 📊 主要特性对比

| 特性 | OpenAI | Anthropic |
|------|--------|-----------|
| **主要端点** | `/v1/chat/completions` | `/v1/messages` |
| **系统消息** | `messages`数组中的`system`角色 | 独立的`system`字段 |
| **必需字段** | `model`, `messages` | `model`, `max_tokens`, `messages` |
| **模型命名** | `gpt-4o`, `gpt-4o-mini` | `claude-3-5-sonnet`, `claude-3-5-haiku` |
| **停止参数** | `stop` (array/string) | `stop_sequences` (array) |
| **Token统计** | `prompt_tokens`, `completion_tokens` | `input_tokens`, `output_tokens` |
| **温度范围** | 0.0 - 2.0 | 0.0 - 1.0 |
| **角色支持** | `system`, `user`, `assistant`, `function` | `user`, `assistant` |

### 🔧 请求格式对比

**OpenAI 请求示例：**
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 100,
  "temperature": 0.7,
  "stop": ["Human:", "AI:"]
}
```

**Anthropic 请求示例：**
```json
{
  "model": "claude-3-5-sonnet",
  "max_tokens": 100,
  "system": "You are helpful.",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "stop_sequences": ["Human:", "AI:"]
}
```

### 📤 响应格式对比

**OpenAI 响应：**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

**Anthropic 响应：**
```json
{
  "id": "msg_123", 
  "type": "message",
  "role": "assistant",
  "content": [{
    "type": "text",
    "text": "Hello! How can I help you?"
  }],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 20,
    "output_tokens": 10
  }
}
```

---

## OpenAI API 格式

### 请求格式

**完整请求示例：**
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 100,
  "temperature": 0.7,
  "top_p": 1.0,
  "n": 1,
  "stream": false,
  "stop": ["Human:", "AI:"],
  "presence_penalty": 0.0,
  "frequency_penalty": 0.0,
  "logit_bias": {},
  "user": "user123"
}
```

**必需字段：**
- `model`: 模型标识符
- `messages`: 对话消息数组

**可选字段：**
- `max_tokens`: 最大生成token数
- `temperature`: 温度参数 (0.0-2.0)
- `top_p`: 核采样参数
- `n`: 生成回复数量
- `stream`: 是否流式响应
- `stop`: 停止序列
- `presence_penalty`: 存在惩罚
- `frequency_penalty`: 频率惩罚
- `logit_bias`: 对数偏差
- `user`: 用户标识

### 响应格式

**成功响应：**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

**字段说明：**

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `id` | string | ✅ | 响应唯一标识符 |
| `object` | string | ✅ | 对象类型 |
| `created` | integer | ✅ | 创建时间戳 |
| `model` | string | ✅ | 模型标识符 (如: gpt-4o, gpt-4o-mini) |
| `choices` | array | ✅ | 生成的选择列表 |
| `usage` | object | ✅ | Token使用统计 |

**Choices 字段：**

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `index` | integer | ✅ | 选择索引 |
| `message` | object | ✅ | 生成的消息 |
| `finish_reason` | string | ✅ | 完成原因 |

**Usage 字段：**

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `prompt_tokens` | integer | ✅ | 输入token数 |
| `completion_tokens` | integer | ✅ | 输出token数 |
| `total_tokens` | integer | ✅ | 总token数 |

---

## Anthropic API 格式

### 请求格式

**完整请求示例：**
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 100,
  "system": "You are a helpful assistant.",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "top_p": 1.0,
  "top_k": 40,
  "stop_sequences": ["Human:", "AI:"],
  "stream": false,
  "metadata": {
    "user_id": "user123"
  }
}
```

**必需字段：**
- `model`: 模型标识符
- `max_tokens`: 最大生成token数
- `messages`: 对话消息数组

**可选字段：**
- `system`: 系统提示词
- `temperature`: 温度参数 (0.0-1.0)
- `top_p`: 核采样参数
- `top_k`: Top-K采样参数
- `stop_sequences`: 停止序列数组
- `stream`: 是否流式响应
- `metadata`: 元数据

### 响应格式

**成功响应：**
```json
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you today?"
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 20,
    "output_tokens": 10
  }
}
```

**字段说明：**

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `id` | string | ✅ | 响应唯一标识符 |
| `type` | string | ✅ | 消息类型 |
| `role` | string | ✅ | 角色标识 |
| `content` | array | ✅ | 内容数组 |
| `model` | string | ✅ | 模型标识符 (如: claude-3-5-sonnet-20241022) |
| `stop_reason` | string | ✅ | 停止原因 |
| `stop_sequence` | string/null | ✅ | 触发的停止序列 |
| `usage` | object | ✅ | Token使用统计 |

**Content 字段：**

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `type` | string | ✅ | 内容类型 (text, image) |
| `text` | string | ✅ | 文本内容 |

**Usage 字段：**

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `input_tokens` | integer | ✅ | 输入token数 |
| `output_tokens` | integer | ✅ | 输出token数 |

### 支持的模型

| 模型名称 | 标识符 | 描述 |
|----------|--------|------|
| Claude 3.5 Sonnet | `claude-3-5-sonnet-20241022` | 平衡性能和速度 |
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | 快速响应模型 |

---

## 格式检测规则

### 检测逻辑

Gateway会自动检测请求格式并转换为相应的上游格式：

1. **OpenAI格式检测**：
   - 端点：`/v1/chat/completions`
   - 必需字段：`model`, `messages`
   - 可选字段：`max_tokens`, `temperature`, `top_p`, `n`, `stream`, `stop`

2. **Anthropic格式检测**：
   - 端点：`/v1/messages`
   - 必需字段：`model`, `max_tokens`, `messages`
   - 可选字段：`system`, `temperature`, `top_p`, `top_k`, `stop_sequences`, `stream`

### 转换映射

**OpenAI → Anthropic：**
```json
// 输入 (OpenAI格式)
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 100,
  "temperature": 0.7,
  "stop": ["Human:", "AI:"]
}

// 转换后 (Anthropic格式)
{
  "model": "claude-3-5-sonnet",
  "max_tokens": 100,
  "system": "You are helpful.",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "stop_sequences": ["Human:", "AI:"]
}
```

**Anthropic → OpenAI：**
```json
// 输入 (Anthropic格式)
{
  "model": "claude-3-5-sonnet",
  "max_tokens": 100,
  "system": "You are helpful.",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "stop_sequences": ["Human:", "AI:"]
}

// 转换后 (OpenAI格式)
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 100,
  "temperature": 0.7,
  "stop": ["Human:", "AI:"]
}
```

---

## 错误响应格式

### OpenAI 错误格式

```json
{
  "error": {
    "message": "Invalid model name",
    "type": "invalid_request_error",
    "param": "model",
    "code": "invalid_model"
  }
}
```

### Anthropic 错误格式

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "Invalid model name"
  }
}
```

### 通用错误码

| HTTP状态码 | 错误类型 | 描述 |
|------------|----------|------|
| 400 | `invalid_request_error` | 请求参数错误 |
| 401 | `authentication_error` | 认证失败 |
| 403 | `permission_error` | 权限不足 |
| 404 | `not_found_error` | 资源不存在 |
| 429 | `rate_limit_error` | 请求频率超限 |
| 500 | `server_error` | 服务器内部错误 |
| 502 | `upstream_error` | 上游服务错误 |

---

## Stream格式规范

### OpenAI Stream格式

**开始：**
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

```

**内容：**
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}

```

**结束：**
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18}}

data: [DONE]
```

### Anthropic Stream格式

**开始：**
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}

```

**内容：**
```
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: ping
data: {"type":"ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

```

**结束：**
```
event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":8}}

event: message_stop
data: {"type":"message_stop"}
```

---

## 最佳实践

### 模型选择建议

**OpenAI模型：**
- **通用对话**: `gpt-4o` - 最新最强大的模型
- **快速响应**: `gpt-4o-mini` - 快速且经济的选择
- **代码生成**: `gpt-4o` - 代码能力强

**Anthropic模型：**
- **平衡性能**: `claude-3-5-sonnet` - 性能与速度平衡
- **快速问答**: `claude-3-5-haiku` - 响应速度快，成本低
- **复杂推理**: `claude-opus-4-1` - 推理能力强

### 参数调优建议

**温度参数：**
- **创造性任务**: 0.7-1.0
- **事实性回答**: 0.0-0.3
- **平衡使用**: 0.3-0.7

**Token限制：**
- **简短回答**: 100-500 tokens
- **详细解释**: 500-2000 tokens
- **长文档**: 2000+ tokens

**停止序列：**
- **对话控制**: 设置明确的结束标记
- **格式控制**: 控制输出格式
- **长度控制**: 避免过长回复

### 错误处理建议

1. **重试机制**: 实现指数退避重试
2. **降级策略**: 失败时切换到备用模型
3. **监控告警**: 设置错误率监控
4. **日志记录**: 记录详细错误信息

### 性能优化建议

1. **连接复用**: 使用HTTP连接池
2. **批量请求**: 合并多个小请求
3. **缓存策略**: 缓存常见请求结果
4. **异步处理**: 非阻塞请求处理

---

## 更新记录

- **2025-01-XX**: 更新模型名称，将过时的模型名称更新为最新版本
- **2025-XX-XX**: 初始版本，支持OpenAI和Anthropic格式