package transform

import (
	"bytes"
	"net/http"
	"testing"
)

func TestDetectFormat(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    string
		expectedFormat RequestFormat
		description    string
	}{
		{
			name: "openai_chat_completions",
			requestBody: `{
				"model": "gpt-4o",
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`,
			expectedFormat: FormatOpenAI,
			description:    "OpenAI格式 - GPT-4o模型",
		},
		{
			name: "openai_gpt4",
			requestBody: `{
				"model": "gpt-4o-mini",
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`,
			expectedFormat: FormatOpenAI,
			description:    "OpenAI格式 - GPT-4o-mini模型",
		},
		{
			name: "anthropic_claude_sonnet",
			requestBody: `{
				"model": "claude-3-5-sonnet",
				"max_tokens": 100,
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`,
			expectedFormat: FormatAnthropic,
			description:    "Anthropic格式 - Claude 3.5 Sonnet模型",
		},
		{
			name: "anthropic_claude_haiku",
			requestBody: `{
				"model": "claude-3-5-haiku",
				"max_tokens": 100,
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`,
			expectedFormat: FormatAnthropic,
			description:    "Anthropic格式 - Claude 3.5 Haiku模型",
		},
		{
			name: "anthropic_with_system",
			requestBody: `{
				"model": "claude-3-5-sonnet",
				"max_tokens": 100,
				"system": "You are helpful",
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`,
			expectedFormat: FormatAnthropic,
			description:    "Anthropic格式 - 带system字段",
		},
		{
			name: "openai_legacy_completions",
			requestBody: `{
				"model": "text-davinci-003",
				"prompt": "Hello world"
			}`,
			expectedFormat: FormatOpenAI,
			description:    "OpenAI遗留格式 - text-davinci-003",
		},
		{
			name:           "invalid_json",
			requestBody:    `{invalid json`,
			expectedFormat: FormatUnknown,
			description:    "无效JSON格式",
		},
		{
			name:           "empty_body",
			requestBody:    `{}`,
			expectedFormat: FormatUnknown,
			description:    "空请求体",
		},
		{
			name: "anthropic_claude_model_case_insensitive",
			requestBody: `{
				"model": "CLAUDE-3-5-SONNET",
				"max_tokens": 100,
				"messages": [
					{"role": "user", "content": "Test"}
				]
			}`,
			expectedFormat: FormatAnthropic,
			description:    "Anthropic格式 - 模型名大小写不敏感",
		},
	}

	transformer := NewTransformer()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			format := transformer.DetectFormat([]byte(tt.requestBody))
			if format != tt.expectedFormat {
				t.Errorf("DetectFormat() = %v, want %v for %s", format, tt.expectedFormat, tt.description)
			}
		})
	}
}

func TestDetectFormatWithEndpoint(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    string
		endpoint       string
		expectedFormat RequestFormat
		description    string
	}{
		{
			name: "openai_endpoint_override",
			requestBody: `{
				"model": "claude-3-5-sonnet",
				"messages": [{"role": "user", "content": "Hello"}]
			}`,
			endpoint:       "/v1/chat/completions",
			expectedFormat: FormatOpenAI,
			description:    "OpenAI端点覆盖模型名判断",
		},
		{
			name: "anthropic_endpoint_override",
			requestBody: `{
				"model": "gpt-4o",
				"messages": [{"role": "user", "content": "Hello"}]
			}`,
			endpoint:       "/v1/messages",
			expectedFormat: FormatAnthropic,
			description:    "Anthropic端点覆盖模型名判断",
		},
	}

	transformer := NewTransformer()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			format := transformer.DetectFormatWithEndpoint([]byte(tt.requestBody), tt.endpoint)
			if format != tt.expectedFormat {
				t.Errorf("DetectFormatWithEndpoint() = %v, want %v for %s", format, tt.expectedFormat, tt.description)
			}
		})
	}
}

func TestDetectFormatFromHTTPRequest(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    string
		url            string
		expectedFormat RequestFormat
		description    string
	}{
		{
			name:           "openai_url",
			requestBody:    `{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}`,
			url:            "/v1/chat/completions",
			expectedFormat: FormatOpenAI,
			description:    "OpenAI URL路径",
		},
		{
			name:           "anthropic_url",
			requestBody:    `{"model":"claude-3-5-sonnet","messages":[{"role":"user","content":"Hello"}]}`,
			url:            "/v1/messages",
			expectedFormat: FormatAnthropic,
			description:    "Anthropic URL路径",
		},
	}

	transformer := NewTransformer()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("POST", tt.url, bytes.NewBufferString(tt.requestBody))
			if err != nil {
				t.Fatalf("Failed to create request: %v", err)
			}

			format := transformer.DetectFormatWithEndpoint([]byte(tt.requestBody), req.URL.Path)
			if format != tt.expectedFormat {
				t.Errorf("DetectFormatFromHTTPRequest() = %v, want %v for %s", format, tt.expectedFormat, tt.description)
			}
		})
	}
}
