package converter

import (
	"encoding/json"
	"strings"
)

// FormatDetector 格式检测器
type FormatDetector struct{}

// Detect 检测请求格式
func (d *FormatDetector) Detect(requestBody []byte, endpoint string) Format {
	// 基于端点路径判断（优先级最高）
	if endpoint == "/v1/messages" {
		return FormatAnthropic
	}
	if endpoint == "/v1/chat/completions" {
		return FormatOpenAI
	}

	// 解析JSON数据
	var data map[string]interface{}
	if err := json.Unmarshal(requestBody, &data); err != nil {
		return FormatUnknown
	}

	// 检查Anthropic特有字段
	if _, hasSystem := data["system"]; hasSystem {
		return FormatAnthropic
	}

	// 检查模型名称
	if model, hasModel := data["model"].(string); hasModel {
		modelLower := strings.ToLower(model)
		if strings.Contains(modelLower, "claude") {
			return FormatAnthropic
		}
		if strings.Contains(modelLower, "gpt") {
			return FormatOpenAI
		}
	}

	// 检查messages字段
	if _, hasMessages := data["messages"]; hasMessages {
		return FormatOpenAI // 默认OpenAI格式
	}

	// 检查prompt字段（OpenAI遗留）
	if _, hasPrompt := data["prompt"]; hasPrompt {
		return FormatOpenAI
	}

	return FormatUnknown
}
