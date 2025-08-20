package transform

import (
	"testing"
)

// TestFormatDetection 测试格式检测功能
func TestFormatDetection(t *testing.T) {
	transformer := &Transformer{}

	tests := []struct {
		name           string
		requestBody    string
		expectedFormat RequestFormat
		description    string
	}{
		{
			name: "OpenAI_ChatCompletions_GPT",
			requestBody: `{
				"model": "gpt-3.5-turbo",
				"messages": [
					{"role": "user", "content": "Hello"}
				],
				"max_tokens": 100
			}`,
			expectedFormat: FormatOpenAI,
			description:    "OpenAI格式 - GPT模型",
		},
		{
			name: "OpenAI_ChatCompletions_GPT4",
			requestBody: `{
				"model": "gpt-4",
				"messages": [
					{"role": "system", "content": "You are helpful."},
					{"role": "user", "content": "Hello"}
				],
				"temperature": 0.7
			}`,
			expectedFormat: FormatOpenAI,
			description:    "OpenAI格式 - GPT-4模型",
		},
		{
			name: "Anthropic_Claude3_Sonnet",
			requestBody: `{
				"model": "claude-3-sonnet",
				"messages": [
					{"role": "user", "content": "Hello"}
				],
				"max_tokens": 100
			}`,
			expectedFormat: FormatAnthropic,
			description:    "Anthropic格式 - Claude 3 Sonnet",
		},
		{
			name: "Anthropic_Claude3_Haiku",
			requestBody: `{
				"model": "claude-3-haiku",
				"messages": [
					{"role": "user", "content": "Quick question"}
				]
			}`,
			expectedFormat: FormatAnthropic,
			description:    "Anthropic格式 - Claude 3 Haiku",
		},
		{
			name: "Anthropic_Claude3_Opus",
			requestBody: `{
				"model": "claude-3-opus",
				"messages": [
					{"role": "user", "content": "Complex task"}
				],
				"system": "You are an expert."
			}`,
			expectedFormat: FormatAnthropic,
			description:    "Anthropic格式 - Claude 3 Opus",
		},
		{
			name: "OpenAI_Legacy_Completions",
			requestBody: `{
				"model": "text-davinci-003",
				"prompt": "Once upon a time",
				"max_tokens": 50
			}`,
			expectedFormat: FormatOpenAI,
			description:    "OpenAI格式 - 旧版文本完成",
		},
		{
			name: "Unknown_Format_NoMessages",
			requestBody: `{
				"unknown_field": "value",
				"invalid_format": true
			}`,
			expectedFormat: FormatUnknown,
			description:    "未知格式 - 缺少messages和prompt字段",
		},
		{
			name: "Invalid_JSON",
			requestBody: `{invalid json content`,
			expectedFormat: FormatUnknown,
			description:    "无效JSON格式",
		},
		{
			name: "Empty_Request",
			requestBody: `{}`,
			expectedFormat: FormatUnknown,
			description:    "空请求体",
		},
		{
			name: "Mixed_Case_Model_Claude",
			requestBody: `{
				"model": "CLAUDE-3-SONNET",
				"messages": [{"role": "user", "content": "test"}]
			}`,
			expectedFormat: FormatOpenAI, // 当前实现是大小写敏感的
			description:    "大写Claude模型名",
		},
		{
			name: "Messages_Without_Model",
			requestBody: `{
				"messages": [{"role": "user", "content": "test"}],
				"max_tokens": 100
			}`,
			expectedFormat: FormatOpenAI,
			description:    "有messages但无model字段，默认OpenAI",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			format := transformer.DetectFormat([]byte(tt.requestBody))
			if format != tt.expectedFormat {
				t.Errorf("格式检测错误:\n  测试用例: %s\n  描述: %s\n  期望格式: %s\n  实际格式: %s",
					tt.name, tt.description, tt.expectedFormat, format)
			} else {
				t.Logf("✅ %s - %s: 检测为 %s", tt.name, tt.description, format)
			}
		})
	}
}

// BenchmarkFormatDetection 性能基准测试
func BenchmarkFormatDetection(b *testing.B) {
	transformer := &Transformer{}
	
	testCases := []struct {
		name string
		body string
	}{
		{
			name: "OpenAI",
			body: `{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}`,
		},
		{
			name: "Anthropic",
			body: `{"model":"claude-3-sonnet","messages":[{"role":"user","content":"Hello"}]}`,
		},
		{
			name: "Legacy",
			body: `{"model":"text-davinci-003","prompt":"Hello"}`,
		},
	}

	for _, tc := range testCases {
		b.Run(tc.name, func(b *testing.B) {
			bodyBytes := []byte(tc.body)
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				transformer.DetectFormat(bodyBytes)
			}
		})
	}
}