package types

// AnthropicRequest - Anthropic API请求格式
type AnthropicRequest struct {
	Model       string                   `json:"model"`
	Messages    []FlexibleMessage        `json:"messages"`
	MaxTokens   int                      `json:"max_tokens,omitempty"`
	Temperature float64                  `json:"temperature,omitempty"`
	Stream      *bool                    `json:"stream,omitempty"`
	System      *SystemField             `json:"system,omitempty"`
	Metadata    map[string]interface{}   `json:"metadata,omitempty"`
	Tools       []map[string]interface{} `json:"tools,omitempty"`
	ToolChoice  interface{}              `json:"tool_choice,omitempty"`
}

// AnthropicContentBlock - Anthropic响应中的内容块
type AnthropicContentBlock struct {
	Type  string      `json:"type"`
	Text  string      `json:"text,omitempty"`
	ID    string      `json:"id,omitempty"`    // tool_use类型的ID
	Name  string      `json:"name,omitempty"`  // tool_use类型的工具名称
	Input interface{} `json:"input,omitempty"` // tool_use类型的输入参数
}

// AnthropicUsage - Anthropic API使用统计
type AnthropicUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// AnthropicResponse - Anthropic API响应格式
type AnthropicResponse struct {
	ID           string                  `json:"id"`
	Type         string                  `json:"type"`
	Role         string                  `json:"role"`
	Content      []AnthropicContentBlock `json:"content"`
	Model        string                  `json:"model"`
	StopReason   string                  `json:"stop_reason"`
	StopSequence interface{}             `json:"stop_sequence"`
	Usage        AnthropicUsage          `json:"usage"`
}

// Anthropic 流式事件结构体
type AnthropicContentBlockDelta struct {
	Type  string `json:"type"`
	Text  string `json:"text"`
	Index int    `json:"index"`
}

type AnthropicStreamEvent struct {
	Type  string               `json:"type"`
	Index int                  `json:"index"`
	Delta AnthropicStreamDelta `json:"delta"`
}

type AnthropicStreamDelta struct {
	Type string `json:"type"`
	Text string `json:"text"`
}