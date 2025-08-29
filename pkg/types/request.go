package types

import (
	"encoding/json"
	"fmt"
	"strings"
)

// UnifiedRequest - 统一的请求结构
type UnifiedRequest struct {
	Model            string                   `json:"model"`
	Messages         []Message                `json:"messages"`
	MaxTokens        int                      `json:"max_tokens,omitempty"`
	Temperature      float64                  `json:"temperature,omitempty"`
	Stream           *bool                    `json:"stream,omitempty"`
	TopP             *float64                 `json:"top_p,omitempty"`
	Tools            []map[string]interface{} `json:"tools,omitempty"`
	ToolChoice       interface{}              `json:"tool_choice,omitempty"`
	OriginalFormat   string                   `json:"-"` // 原始请求格式
	OriginalSystem   *SystemField             `json:"-"` // 原始system字段格式
	OriginalMetadata map[string]interface{}   `json:"-"` // 原始metadata字段
	GatewayKeyID     string                   `json:"-"` // 发起请求的Gateway API Key ID
	UpstreamID       string                   `json:"-"` // 选中的上游账号ID
}

// Message - 通用消息结构
type Message struct {
	Role       string                   `json:"role"` // system, user, assistant
	Content    interface{}              `json:"content"`
	ToolCalls  []map[string]interface{} `json:"tool_calls,omitempty"`   // OpenAI工具调用
	ToolCallID *string                  `json:"tool_call_id,omitempty"` // OpenAI工具调用ID
	Name       *string                  `json:"name,omitempty"`         // OpenAI工具名称
}

// SystemField - 处理Anthropic system字段的两种格式
type SystemField struct {
	isString    bool
	stringValue string
	arrayValue  []SystemBlock
}

// SystemBlock - system数组中的单个块
type SystemBlock struct {
	Type         string                 `json:"type"`
	Text         string                 `json:"text"`
	CacheControl map[string]interface{} `json:"cache_control,omitempty"`
}

// UnmarshalJSON 自定义反序列化方法
func (s *SystemField) UnmarshalJSON(data []byte) error {
	// 尝试作为字符串解析
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		s.isString = true
		s.stringValue = str
		return nil
	}

	// 尝试作为数组解析
	var blocks []SystemBlock
	if err := json.Unmarshal(data, &blocks); err == nil {
		s.isString = false
		s.arrayValue = blocks
		return nil
	}

	return fmt.Errorf("system field must be either string or array")
}

// MarshalJSON 自定义序列化方法 - 保持原始格式
func (s SystemField) MarshalJSON() ([]byte, error) {
	if s.isString {
		// 保持字符串格式输出
		return json.Marshal(s.stringValue)
	}
	return json.Marshal(s.arrayValue)
}

// ToString 转换为字符串格式
func (s *SystemField) ToString() string {
	if s.isString {
		return s.stringValue
	}

	// 将数组格式转换为字符串
	var parts []string
	for _, block := range s.arrayValue {
		if block.Type == "text" {
			parts = append(parts, block.Text)
		}
	}
	return strings.Join(parts, "\n")
}

// IsString 检查是否为字符串格式
func (s *SystemField) IsString() bool {
	return s.isString
}

// ToArray 获取数组格式的值
func (s *SystemField) ToArray() []SystemBlock {
	if s.isString {
		// 如果是字符串，转换为单个块的数组
		return []SystemBlock{
			{
				Type: "text",
				Text: s.stringValue,
			},
		}
	}
	return s.arrayValue
}

// SetArray 设置为数组格式
func (s *SystemField) SetArray(blocks []SystemBlock) {
	s.isString = false
	s.arrayValue = blocks
	s.stringValue = ""
}
