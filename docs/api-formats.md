# LLM Gateway API 格式规范

本文档详细描述了LLM Gateway支持的两种主要API格式：OpenAI格式和Anthropic格式。

## 目录

1. [核心差异对比](#核心差异对比)
2. [OpenAI API 格式](#openai-api-格式)
3. [Anthropic API 格式](#anthropic-api-格式)
4. [格式检测规则](#格式检测规则)
5. [格式转换映射](#格式转换映射)
6. [错误响应格式](#错误响应格式)
7. [最佳实践](#最佳实践)

---

## 核心差异对比

### 📊 主要特性对比

| 特性 | OpenAI | Anthropic |
|------|--------|-----------|
| **主要端点** | `/v1/chat/completions` | `/v1/messages` |
| **系统消息** | `messages`数组中的`system`角色 | 独立的`system`字段 |
| **必需字段** | `model`, `messages` | `model`, `max_tokens`, `messages` |
| **模型命名** | `gpt-3.5-turbo`, `gpt-4` | `claude-3-sonnet`, `claude-3-haiku` |
| **停止参数** | `stop` (array/string) | `stop_sequences` (array) |
| **Token统计** | `prompt_tokens`, `completion_tokens` | `input_tokens`, `output_tokens` |
| **温度范围** | 0.0 - 2.0 | 0.0 - 1.0 |
| **角色支持** | `system`, `user`, `assistant`, `function` | `user`, `assistant` |

### 🔧 请求格式对比

**OpenAI 请求示例：**
```json
{
  "model": "gpt-3.5-turbo",
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
  "model": "claude-3-sonnet",
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

### 1.1 Chat Completions API

**端点：** `POST /v1/chat/completions`

**请求格式：**

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user", 
      "content": "Hello, how are you?"
    },
    {
      "role": "assistant",
      "content": "I'm doing well, thank you!"
    }
  ],
  "max_tokens": 150,
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

**响应格式：**

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-3.5-turbo-0613",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm an AI assistant. How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 56,
    "completion_tokens": 31,
    "total_tokens": 87
  }
}
```

### 1.2 Text Completions API (Legacy)

**端点：** `POST /v1/completions`

**请求格式：**

```json
{
  "model": "text-davinci-003",
  "prompt": "Translate the following English text to French: 'Hello, world!'",
  "max_tokens": 60,
  "temperature": 0.7,
  "top_p": 1.0,
  "n": 1,
  "stream": false,
  "stop": ["\n"],
  "presence_penalty": 0.0,
  "frequency_penalty": 0.0,
  "best_of": 1,
  "logit_bias": {},
  "user": "user123"
}
```

**响应格式：**

```json
{
  "id": "cmpl-uqkvlQyYK7bGYrRHQ0eXlWi7",
  "object": "text_completion", 
  "created": 1589478378,
  "model": "text-davinci-003",
  "choices": [
    {
      "text": "\n\nBonjour, le monde!",
      "index": 0,
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 5,
    "completion_tokens": 7,
    "total_tokens": 12
  }
}
```

### 1.3 OpenAI 字段说明

#### 请求字段：

| 字段名 | 类型 | 必需 | 描述 |
|--------|------|------|------|
| `model` | string | ✅ | 模型标识符 (如: gpt-3.5-turbo, gpt-4) |
| `messages` | array | ✅ | 消息数组 (Chat API) |
| `prompt` | string | ✅ | 文本提示 (Completion API) |
| `max_tokens` | integer | ❌ | 最大生成token数 |
| `temperature` | number | ❌ | 随机性控制 (0.0-2.0) |
| `top_p` | number | ❌ | 核采样参数 (0.0-1.0) |
| `n` | integer | ❌ | 生成选择数量 |
| `stream` | boolean | ❌ | 是否流式响应 |
| `stop` | array/string | ❌ | 停止序列 |
| `presence_penalty` | number | ❌ | 存在惩罚 (-2.0-2.0) |
| `frequency_penalty` | number | ❌ | 频率惩罚 (-2.0-2.0) |
| `logit_bias` | object | ❌ | logit偏置 |
| `user` | string | ❌ | 用户标识 |

#### 消息角色：

- `system`: 系统消息，设置AI行为
- `user`: 用户消息  
- `assistant`: AI助手响应
- `function`: 函数调用结果 (Functions API)

---

## Anthropic API 格式

### 2.1 Messages API

**端点：** `POST /v1/messages`

**请求格式：**

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Hello, Claude"
    }
  ],
  "system": "You are a helpful AI assistant.",
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "stop_sequences": ["Human:", "Assistant:"],
  "stream": false,
  "metadata": {
    "user_id": "user123"
  }
}
```

**响应格式：**

```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant", 
  "content": [
    {
      "type": "text",
      "text": "Hello! I'm Claude, an AI assistant. How can I help you today?"
    }
  ],
  "model": "claude-3-sonnet-20240229",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 25
  }
}
```

### 2.2 Anthropic 字段说明

#### 请求字段：

| 字段名 | 类型 | 必需 | 描述 |
|--------|------|------|------|
| `model` | string | ✅ | 模型标识符 (如: claude-3-sonnet-20240229) |
| `max_tokens` | integer | ✅ | 最大生成token数 |
| `messages` | array | ✅ | 消息数组 |
| `system` | string | ❌ | 系统提示 |
| `temperature` | number | ❌ | 随机性控制 (0.0-1.0) |
| `top_p` | number | ❌ | 核采样参数 (0.0-1.0) |
| `top_k` | integer | ❌ | Top-K采样参数 |
| `stop_sequences` | array | ❌ | 停止序列 |
| `stream` | boolean | ❌ | 是否流式响应 |
| `metadata` | object | ❌ | 元数据信息 |

#### 消息角色：

- `user`: 用户消息
- `assistant`: Claude助手响应

**注意：** Anthropic不使用`system`角色，而是使用单独的`system`字段。

### 2.3 支持的Claude模型

| 模型名称 | 标识符 | 描述 |
|----------|--------|------|
| Claude 3 Opus | `claude-3-opus-20240229` | 最强大的模型 |
| Claude 3 Sonnet | `claude-3-sonnet-20240229` | 平衡性能和速度 |
| Claude 3 Haiku | `claude-3-haiku-20240307` | 快速响应模型 |

---

## 格式检测规则

LLM Gateway使用以下规则自动检测请求格式：

### 3.1 检测逻辑

```go
func (t *Transformer) DetectFormat(requestBody []byte) RequestFormat {
    var data map[string]interface{}
    if err := json.Unmarshal(requestBody, &data); err != nil {
        return FormatUnknown
    }

    // 检查是否有Anthropic特有的字段
    if _, hasMessages := data["messages"]; hasMessages {
        if model, hasModel := data["model"].(string); hasModel {
            if strings.Contains(model, "claude") || strings.Contains(model, "anthropic") {
                return FormatAnthropic
            }
        }
        // 默认认为是OpenAI格式
        return FormatOpenAI
    }

    // 检查是否有旧版本的prompt字段
    if _, hasPrompt := data["prompt"]; hasPrompt {
        return FormatOpenAI
    }

    return FormatUnknown
}
```

### 3.2 检测规则表

| 条件 | 检测结果 |
|------|----------|
| 包含`messages`字段 + 模型名包含"claude" | `FormatAnthropic` |
| 包含`messages`字段 + 模型名包含"anthropic" | `FormatAnthropic` |
| 包含`messages`字段 + 其他模型名 | `FormatOpenAI` |
| 包含`prompt`字段 | `FormatOpenAI` |
| 都不包含 | `FormatUnknown` |

---

## 格式转换映射

### 4.1 请求字段映射

| OpenAI | Anthropic | 转换规则 |
|--------|-----------|----------|
| `messages[].role="system"` | `system` | 提取system消息到单独字段 |
| `messages[].role="user"` | `messages[].role="user"` | 直接映射 |
| `messages[].role="assistant"` | `messages[].role="assistant"` | 直接映射 |
| `max_tokens` | `max_tokens` | 直接映射 |
| `temperature` | `temperature` | 直接映射 |
| `top_p` | `top_p` | 直接映射 |
| `stop` | `stop_sequences` | 字段名转换 |
| `stream` | `stream` | 直接映射 |

### 4.2 响应字段映射

| Anthropic | OpenAI | 转换规则 |
|-----------|---------|----------|
| `id` | `id` | 直接映射 |
| `content[0].text` | `choices[0].message.content` | 提取文本内容 |
| `model` | `model` | 直接映射 |
| `stop_reason` | `choices[0].finish_reason` | 停止原因映射 |
| `usage.input_tokens` | `usage.prompt_tokens` | 字段名转换 |
| `usage.output_tokens` | `usage.completion_tokens` | 字段名转换 |

### 4.3 停止原因映射

| Anthropic | OpenAI | 描述 |
|-----------|---------|------|
| `end_turn` | `stop` | 正常结束 |
| `max_tokens` | `length` | 达到最大长度 |
| `stop_sequence` | `stop` | 遇到停止序列 |

---

## 错误响应格式

### 5.1 OpenAI 错误格式

```json
{
  "error": {
    "message": "Invalid API key provided",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

### 5.2 Anthropic 错误格式

```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key"
  }
}
```

### 5.3 LLM Gateway 统一错误格式

Gateway返回OpenAI兼容的错误格式：

```json
{
  "error": {
    "message": "错误描述",
    "type": "错误类型",
    "code": "错误代码"
  },
  "timestamp": 1677652288
}
```

### 5.4 常见错误类型

| 错误类型 | HTTP状态码 | 描述 |
|----------|------------|------|
| `missing_authorization` | 401 | 缺少Authorization头 |
| `invalid_api_key` | 401 | 无效的API密钥 |
| `unsupported_format` | 400 | 不支持的请求格式 |
| `invalid_request_body` | 400 | 无效的请求体 |
| `request_transform_error` | 400 | 请求转换失败 |
| `no_upstream_available` | 503 | 无可用上游服务 |
| `upstream_error` | 502 | 上游服务错误 |
| `rate_limit_exceeded` | 429 | 超过速率限制 |

---

## 使用示例

### 6.1 发送OpenAI格式请求

```bash
curl -X POST "http://localhost:3847/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 100
  }'
```

### 6.2 发送Anthropic格式请求

```bash
curl -X POST "http://localhost:3847/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -d '{
    "model": "claude-3-sonnet",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 100
  }'
```

### 6.3 使用Anthropic原生端点

```bash
curl -X POST "http://localhost:3847/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -d '{
    "model": "claude-3-haiku",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

---

## 最佳实践

### 🎯 支持的模型列表

**OpenAI 模型：**
| 模型 | 标识符 | 用途 |
|------|--------|------|
| GPT-3.5 Turbo | `gpt-3.5-turbo` | 通用对话 |
| GPT-4 | `gpt-4` | 高级推理 |
| GPT-4 Turbo | `gpt-4-turbo` | 快速高级推理 |
| Text Davinci | `text-davinci-003` | 文本完成(旧版) |

**Anthropic 模型：**
| 模型 | 标识符 | 用途 |
|------|--------|------|
| Claude 3 Opus | `claude-3-opus-20240229` | 最强推理能力 |
| Claude 3 Sonnet | `claude-3-sonnet-20240229` | 平衡性能 |
| Claude 3 Haiku | `claude-3-haiku-20240307` | 快速响应 |

### ⚙️ 完整参数映射表

| 功能 | OpenAI参数 | Anthropic参数 | 转换说明 |
|------|------------|---------------|----------|
| 模型选择 | `model` | `model` | 直接映射 |
| 最大长度 | `max_tokens` (可选) | `max_tokens` (必需) | Anthropic必需 |
| 随机性 | `temperature` (0.0-2.0) | `temperature` (0.0-1.0) | 范围不同 |
| 核采样 | `top_p` | `top_p` | 直接映射 |
| Top-K采样 | ❌ | `top_k` | Anthropic独有 |
| 停止词 | `stop` | `stop_sequences` | 字段名不同 |
| 系统提示 | `messages[role=system]` | `system` | 结构转换 |
| 流式输出 | `stream` | `stream` | 直接映射 |
| 用户标识 | `user` | `metadata.user_id` | 结构不同 |
| 存在惩罚 | `presence_penalty` | ❌ | OpenAI独有 |
| 频率惩罚 | `frequency_penalty` | ❌ | OpenAI独有 |
| logit偏置 | `logit_bias` | ❌ | OpenAI独有 |

### 🚫 错误代码对比

| 错误类型 | OpenAI | Anthropic | Gateway统一 |
|----------|---------|-----------|-------------|
| 认证错误 | `invalid_api_key` | `authentication_error` | `invalid_api_key` |
| 请求错误 | `invalid_request_error` | `invalid_request_error` | `invalid_request_error` |
| 速率限制 | `rate_limit_exceeded` | `rate_limit_error` | `rate_limit_exceeded` |
| 服务错误 | `server_error` | `api_error` | `server_error` |
| 超长输入 | `context_length_exceeded` | `invalid_request_error` | `context_length_exceeded` |

### 💡 使用建议

**1. Gateway使用建议：**
- **统一使用OpenAI格式**：客户端统一使用OpenAI格式，Gateway自动转换
- **明确指定模型**：使用完整的模型标识符避免歧义
- **合理设置超时**：考虑不同模型的响应时间差异
- **错误处理**：统一处理Gateway返回的OpenAI格式错误

**2. 模型选择建议：**
| 场景 | 推荐模型 | 理由 |
|------|----------|------|
| 快速问答 | `claude-3-haiku` | 响应速度快，成本低 |
| 复杂推理 | `claude-3-opus` 或 `gpt-4` | 推理能力强 |
| 通用对话 | `claude-3-sonnet` 或 `gpt-3.5-turbo` | 性能平衡 |
| 代码生成 | `gpt-4` | 代码能力强 |
| 创意写作 | `claude-3-opus` | 创意能力强 |

**3. 成本优化建议：**
- 优先使用Haiku模型处理简单请求
- 合理设置`max_tokens`控制成本
- 使用系统提示引导模型给出简洁回答
- 实施请求缓存避免重复调用

### 🔍 格式检测流程图

```
请求包含字段检查：
├── 有 "messages" 字段？
│   ├── 是 → 检查 "model" 字段
│   │   ├── 包含 "claude" → Anthropic格式
│   │   ├── 包含 "anthropic" → Anthropic格式  
│   │   └── 其他 → OpenAI格式
│   └── 否 → 检查 "prompt" 字段
│       ├── 有 → OpenAI格式 (Legacy)
│       └── 无 → Unknown格式
```

---

## 注意事项

1. **模型名称大小写敏感**：格式检测基于模型名称，确保使用正确的大小写。

2. **必需字段差异**：Anthropic要求`max_tokens`字段，而OpenAI中是可选的。

3. **系统消息处理**：OpenAI使用`messages`数组中的`system`角色，Anthropic使用单独的`system`字段。

4. **流式响应差异**：两种API的流式响应格式不同，需要相应的转换逻辑。

5. **错误处理**：Gateway统一返回OpenAI兼容的错误格式，便于客户端处理。

6. **Token使用统计**：字段名称不同但含义相同，Gateway会进行适当转换。

7. **参数范围差异**：注意temperature等参数的取值范围在两个API中不同。

8. **角色支持差异**：Anthropic不支持`function`角色，系统消息使用独立字段。