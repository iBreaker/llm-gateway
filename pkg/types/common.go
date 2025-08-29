package types

// FlexibleMessage - 支持多种content格式的消息结构
type FlexibleMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}
