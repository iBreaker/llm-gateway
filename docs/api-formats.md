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

### 6.4 Stream流式请求示例

#### OpenAI格式Stream请求
```bash
curl -N -X POST "http://localhost:3847/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "写一首短诗"}
    ],
    "max_tokens": 200,
    "stream": true
  }'
```

#### Anthropic格式Stream请求
```bash
curl -N -X POST "http://localhost:3847/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 200,
    "messages": [
      {"role": "user", "content": "写一首短诗"}
    ],
    "stream": true
  }'
```

#### 使用EventSource API (浏览器端)
```javascript
// 创建SSE连接
const eventSource = new EventSource('/v1/chat/completions/stream?' + 
  new URLSearchParams({
    model: 'gpt-3.5-turbo',
    message: 'Hello',
    stream: 'true'
  })
);

eventSource.onmessage = function(event) {
  if (event.data === '[DONE]') {
    eventSource.close();
    console.log('Stream completed');
    return;
  }
  
  const data = JSON.parse(event.data);
  const content = data.choices[0]?.delta?.content;
  if (content) {
    document.getElementById('output').textContent += content;
  }
};

eventSource.onerror = function(error) {
  console.error('EventSource failed:', error);
  eventSource.close();
};
```

---

## Stream格式规范

### 7.1 Stream vs 非Stream格式差异

#### 🔄 响应模式对比

| 特性 | 非Stream模式 | Stream模式 |
|------|-------------|------------|
| **HTTP连接** | 短连接，请求-响应 | 长连接，持续数据流 |
| **Content-Type** | `application/json` | `text/event-stream; charset=utf-8` |
| **数据传输** | 等待完整响应，一次性返回 | 增量传输，实时推送 |
| **响应格式** | 单个完整JSON对象 | 多个SSE事件，每个事件一行 |
| **用户体验** | 需等待完整回答 | 实时显示生成过程 |
| **错误处理** | 简单的状态码和错误JSON | 需要监听错误事件 |

### 7.2 OpenAI Stream格式

#### HTTP响应头
```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
```

#### 事件格式
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18}}

data: [DONE]
```

#### OpenAI Stream事件结构
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion.chunk",
  "created": 1677652288,
  "model": "gpt-3.5-turbo",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",    // 仅在第一个chunk
      "content": "Hello"      // 增量内容
    },
    "finish_reason": null     // 结束时为"stop"/"length"等
  }],
  "usage": {                  // 仅在最后一个chunk
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  }
}
```

### 7.3 Anthropic Stream格式

#### 事件命名
Anthropic使用命名事件，每个事件有特定的类型和用途：

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_01ABC","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","usage":{"output_tokens":3}}}

event: message_stop
data: {"type":"message_stop"}
```

### 7.4 Stream事件类型对比

#### OpenAI事件流程
```
1. 首个事件：包含role信息的delta
2. 内容事件：多个包含content的delta事件  
3. 结束事件：包含finish_reason和usage的delta
4. 终止标记：data: [DONE]
```

#### Anthropic事件流程
```
1. message_start：消息开始，包含元数据
2. content_block_start：内容块开始
3. content_block_delta：内容增量（多个）
4. content_block_stop：内容块结束
5. message_delta：使用统计更新
6. message_stop：消息结束
```

### 7.5 Stream格式转换规则

#### OpenAI → Anthropic转换

| OpenAI事件 | Anthropic事件 | 转换逻辑 |
|------------|---------------|----------|
| 首个delta（含role） | `message_start` + `content_block_start` | 生成消息开始和内容块开始事件 |
| 内容delta | `content_block_delta` | 将`delta.content`转换为`delta.text` |
| 结束delta（含finish_reason） | `content_block_stop` + `message_delta` + `message_stop` | 生成内容块结束、统计更新和消息结束 |
| `[DONE]` | - | 忽略（已通过message_stop表示结束） |

#### Anthropic → OpenAI转换

| Anthropic事件 | OpenAI事件 | 转换逻辑 |
|---------------|------------|----------|
| `message_start` | 首个delta（含role） | 提取role信息生成首个chunk |
| `content_block_start` | - | 忽略（OpenAI无此概念） |
| `content_block_delta` | 内容delta | 将`delta.text`转换为`delta.content` |
| `content_block_stop` | - | 忽略 |
| `message_delta` | - | 缓存usage信息 |
| `message_stop` | 结束delta + `[DONE]` | 生成包含finish_reason和usage的最终chunk |

### 7.6 Stream实现要点

#### 客户端JavaScript示例
```javascript
// OpenAI格式流式请求
const response = await fetch('/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{role: 'user', content: 'Hello'}],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        console.log('Stream completed');
        return;
      }
      
      try {
        const json = JSON.parse(data);
        const content = json.choices[0]?.delta?.content;
        if (content) {
          console.log(content); // 显示增量内容
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    }
  }
}
```

#### 服务端实现要点
```go
// Stream响应处理伪代码
func (h *ProxyHandler) handleStreamResponse(w http.ResponseWriter, req *types.ProxyRequest) {
    // 设置SSE响应头
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")
    
    // 创建上游stream连接
    upstreamResp, err := h.callUpstreamStream(req)
    if err != nil {
        return
    }
    defer upstreamResp.Body.Close()
    
    // 逐行读取并转换事件
    scanner := bufio.NewScanner(upstreamResp.Body)
    for scanner.Scan() {
        line := scanner.Text()
        
        // 解析SSE事件
        event := parseSSEEvent(line)
        
        // 根据格式转换事件
        convertedEvent := h.convertStreamEvent(event, req.OriginalFormat)
        
        // 写入客户端
        fmt.Fprintf(w, "data: %s\n\n", convertedEvent)
        w.(http.Flusher).Flush()
    }
}
```

### 7.7 Stream错误处理

#### 错误类型
1. **连接中断**：网络异常导致stream中断
2. **上游错误**：上游API返回错误事件
3. **格式错误**：无法解析的SSE事件
4. **超时错误**：长时间无响应

#### 错误恢复策略
```javascript
// 客户端错误恢复示例
const EventSource = require('eventsource');

const es = new EventSource('/v1/chat/completions/stream');

es.onmessage = function(event) {
  if (event.data === '[DONE]') {
    es.close();
    return;
  }
  
  try {
    const data = JSON.parse(event.data);
    // 处理正常数据
  } catch (error) {
    console.error('Parse error:', error);
    // 跳过无效事件，继续监听
  }
};

es.onerror = function(error) {
  console.error('Stream error:', error);
  // 可以实现重连逻辑
  setTimeout(() => {
    // 重新创建连接
  }, 1000);
};
```

### 7.8 Stream性能优化

#### 缓冲控制
- **最小缓冲**：减少延迟，及时推送每个事件
- **错误边界**：无效事件不影响整个流
- **连接保活**：正确处理HTTP长连接

#### 监控指标
- **首字节时间**：从请求到第一个内容chunk的延迟
- **平均延迟**：每个chunk的推送延迟
- **错误率**：stream中断和错误事件比例
- **吞吐量**：每秒传输的chunk数量

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

**4. Stream使用建议：**
- **适用场景**：长文本生成、实时对话、代码生成等需要即时反馈的场景
- **客户端处理**：使用`EventSource`或`fetch`的流式读取处理SSE响应
- **错误恢复**：实现连接中断重连机制，处理网络异常
- **性能优化**：最小化缓冲，及时刷新响应确保实时性
- **用户体验**：显示加载指示器，提供停止按钮允许用户中断stream

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

9. **Stream响应差异**：OpenAI使用统一的chunk格式，Anthropic使用命名事件；两者的事件生命周期和JSON结构完全不同。

10. **Stream连接管理**：长连接需要proper的keep-alive处理，客户端需要处理连接中断和重连。

11. **Stream错误处理**：流式传输中的错误可能出现在任何时点，需要实现robust的错误边界处理。