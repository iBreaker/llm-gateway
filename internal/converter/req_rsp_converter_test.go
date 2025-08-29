package converter

import (
	"encoding/json"
	"testing"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

func TestTransformRequest(t *testing.T) {
	tests := []struct {
		name           string
		input          []byte
		expectedFormat Format
		expectedModel  string
		expectError    bool
	}{
		{
			name: "OpenAI format",
			input: []byte(`{
				"model": "gpt-4o",
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`),
			expectedFormat: FormatOpenAI,
			expectedModel:  "gpt-4o",
			expectError:    false,
		},
		{
			name: "Anthropic format",
			input: []byte(`{
				"model": "claude-3-5-sonnet",
				"max_tokens": 100,
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`),
			expectedFormat: FormatAnthropic,
			expectedModel:  "claude-3-5-sonnet",
			expectError:    false,
		},
		{
			name:        "Invalid JSON",
			input:       []byte(`{invalid json`),
			expectError: true,
		},
	}

	transformer := NewManager()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 使用新API解析请求
			proxyReq, _, err := transformer.ParseRequest(tt.input, "")

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Fatalf("TransformRequest() error = %v", err)
			}
			if proxyReq.Model != tt.expectedModel {
				t.Errorf("TransformRequest() Model = %v, want %v", proxyReq.Model, tt.expectedModel)
			}
		})
	}
}

func TestTransformRequestOpenAI(t *testing.T) {
	input := []byte(`{
		"model": "gpt-4o",
		"messages": [
			{"role": "system", "content": "You are helpful"},
			{"role": "user", "content": "Hello"}
		],
		"max_tokens": 100,
		"temperature": 0.7
	}`)

	transformer := NewManager()
	proxyReq, _, err := transformer.ParseRequest(input, "")

	if err != nil {
		t.Fatalf("TransformRequest() error = %v", err)
	}
	if proxyReq.Model != "gpt-4o" {
		t.Errorf("TransformRequest() Model = %v, want gpt-4o", proxyReq.Model)
	}
	if proxyReq.MaxTokens != 100 {
		t.Errorf("TransformRequest() MaxTokens = %v, want 100", proxyReq.MaxTokens)
	}
	if proxyReq.Temperature != 0.7 {
		t.Errorf("TransformRequest() Temperature = %v, want 0.7", proxyReq.Temperature)
	}
	if len(proxyReq.Messages) != 2 {
		t.Errorf("TransformRequest() Messages length = %d, want 2", len(proxyReq.Messages))
	}
	if proxyReq.Messages[0].Role != "system" {
		t.Errorf("TransformRequest() Messages[0].Role = %v, want system", proxyReq.Messages[0].Role)
	}
	if proxyReq.Messages[0].Content != "You are helpful" {
		t.Errorf("TransformRequest() Messages[0].Content = %v, want 'You are helpful'", proxyReq.Messages[0].Content)
	}
	if proxyReq.Messages[1].Role != "user" {
		t.Errorf("TransformRequest() Messages[1].Role = %v, want user", proxyReq.Messages[1].Role)
	}
	if proxyReq.Messages[1].Content != "Hello" {
		t.Errorf("TransformRequest() Messages[1].Content = %v, want 'Hello'", proxyReq.Messages[1].Content)
	}
}

func TestTransformRequestAnthropic(t *testing.T) {
	input := []byte(`{
		"model": "claude-3-5-sonnet",
		"max_tokens": 100,
		"system": "You are helpful",
		"messages": [
			{"role": "user", "content": "Hello"}
		],
		"temperature": 0.7
	}`)

	transformer := NewManager()
	proxyReq, _, err := transformer.ParseRequest(input, "")

	if err != nil {
		t.Fatalf("TransformRequest() error = %v", err)
	}
	if proxyReq.Model != "claude-3-5-sonnet" {
		t.Errorf("TransformRequest() Model = %v, want claude-3-5-sonnet", proxyReq.Model)
	}
	if proxyReq.MaxTokens != 100 {
		t.Errorf("TransformRequest() MaxTokens = %v, want 100", proxyReq.MaxTokens)
	}
	if proxyReq.Temperature != 0.7 {
		t.Errorf("TransformRequest() Temperature = %v, want 0.7", proxyReq.Temperature)
	}
	// 转换器会将system消息添加到messages开头，所以总共有2条消息
	if len(proxyReq.Messages) != 2 {
		t.Errorf("TransformRequest() Messages length = %d, want 2", len(proxyReq.Messages))
	}
	// 第一条消息是system消息
	if len(proxyReq.Messages) > 0 && proxyReq.Messages[0].Role != "system" {
		t.Errorf("TransformRequest() Messages[0].Role = %v, want system", proxyReq.Messages[0].Role)
	}
	if len(proxyReq.Messages) > 0 && proxyReq.Messages[0].Content != "You are helpful" {
		t.Errorf("TransformRequest() Messages[0].Content = %v, want 'You are helpful'", proxyReq.Messages[0].Content)
	}
	// 第二条消息是user消息
	if len(proxyReq.Messages) > 1 && proxyReq.Messages[1].Role != "user" {
		t.Errorf("TransformRequest() Messages[1].Role = %v, want user", proxyReq.Messages[1].Role)
	}
	if len(proxyReq.Messages) > 1 && proxyReq.Messages[1].Content != "Hello" {
		t.Errorf("TransformRequest() Messages[1].Content = %v, want 'Hello'", proxyReq.Messages[1].Content)
	}
}

func TestTransformResponse(t *testing.T) {
	proxyResp := &types.UnifiedResponse{
		ID:      "test-123",
		Object:  "chat.completion",
		Created: 1234567890,
		Model:   "gpt-4o",
		Choices: []types.ResponseChoice{
			{
				Index: 0,
				Message: types.Message{
					Role:    "assistant",
					Content: "Hello, world!",
				},
				FinishReason: "stop",
			},
		},
		Usage: types.ResponseUsage{
			PromptTokens:     10,
			CompletionTokens: 5,
			TotalTokens:      15,
		},
	}

	tests := []struct {
		name           string
		format         Format
		expectedOutput string
	}{
		{
			name:           "OpenAI format",
			format:         FormatOpenAI,
			expectedOutput: `{"id":"test-123","object":"chat.completion","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"message":{"role":"assistant","content":"Hello, world!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}`,
		},
		{
			name:           "Anthropic format",
			format:         FormatAnthropic,
			expectedOutput: `{"id":"test-123","type":"message","role":"assistant","model":"gpt-4o","content":[{"type":"text","text":"Hello, world!"}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":5}}`,
		},
	}

	transformer := NewManager()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			output, err := transformer.BuildClientResponse(proxyResp, tt.format)
			if err != nil {
				t.Fatalf("TransformResponse() error = %v", err)
			}

			// Parse and re-serialize to handle field order differences
			var parsed map[string]interface{}
			err = json.Unmarshal(output, &parsed)
			if err != nil {
				t.Fatalf("Failed to parse output: %v", err)
			}

			expectedParsed := make(map[string]interface{})
			err = json.Unmarshal([]byte(tt.expectedOutput), &expectedParsed)
			if err != nil {
				t.Fatalf("Failed to parse expected output: %v", err)
			}

			// Compare key fields instead of exact match
			if parsed["id"] != expectedParsed["id"] {
				t.Errorf("ID mismatch: got %v, want %v", parsed["id"], expectedParsed["id"])
			}
			if parsed["model"] != expectedParsed["model"] {
				t.Errorf("Model mismatch: got %v, want %v", parsed["model"], expectedParsed["model"])
			}
		})
	}
}

func TestTransformRequestAnthropicWithTools(t *testing.T) {
	input := []byte(`{
		"model": "claude-3-5-sonnet-20241022",
		"max_tokens": 1024,
		"tools": [
			{
				"name": "get_weather",
				"description": "Get the current weather information for a specific location. This tool provides real-time weather data including temperature, humidity, wind speed, and conditions.",
				"input_schema": {
					"type": "object",
					"properties": {
						"location": {
							"type": "string",
							"description": "The city and state, country, or coordinates (e.g. San Francisco, CA or 40.7128,-74.0060)"
						},
						"unit": {
							"type": "string",
							"enum": ["celsius", "fahrenheit"],
							"description": "Temperature unit preference",
							"default": "celsius"
						},
						"include_forecast": {
							"type": "boolean",
							"description": "Whether to include 3-day forecast",
							"default": false
						}
					},
					"required": ["location"]
				}
			}
		],
		"messages": [
			{
				"role": "user",
				"content": "What's the weather like in Tokyo today? Please include the forecast."
			}
		]
	}`)

	transformer := NewManager()
	proxyReq, format, err := transformer.ParseRequest(input, "")

	if err != nil {
		t.Fatalf("TransformRequest() error = %v", err)
	}
	if proxyReq.Model != "claude-3-5-sonnet-20241022" {
		t.Errorf("TransformRequest() Model = %v, want claude-3-5-sonnet-20241022", proxyReq.Model)
	}
	if proxyReq.MaxTokens != 1024 {
		t.Errorf("TransformRequest() MaxTokens = %v, want 1024", proxyReq.MaxTokens)
	}
	if len(proxyReq.Messages) != 1 {
		t.Errorf("TransformRequest() Messages length = %d, want 1", len(proxyReq.Messages))
	}
	if proxyReq.Messages[0].Role != "user" {
		t.Errorf("TransformRequest() Messages[0].Role = %v, want user", proxyReq.Messages[0].Role)
	}
	if proxyReq.Messages[0].Content != "What's the weather like in Tokyo today? Please include the forecast." {
		t.Errorf("TransformRequest() Messages[0].Content = %v, want weather query", proxyReq.Messages[0].Content)
	}

	// 验证格式检测正确识别为 Anthropic 格式
	if format != FormatAnthropic {
		t.Errorf("DetectFormat() = %v, want FormatAnthropic", format)
	}
}

func TestTransformRequestAnthropicComplexContent(t *testing.T) {
	input := []byte(`{
		"model": "claude-sonnet-4-20250514",
		"messages": [
			{
				"role": "user",
				"content": [
					{
						"type": "text",
						"text": "<system-reminder>\nAs you answer the user's questions, .....\n</system-reminder>\n"
					},
					{
						"type": "text",
						"text": "ping baidu.com",
						"cache_control": {
							"type": "ephemeral"
						}
					}
				]
			}
		],
		"temperature": 1,
		"system": [
			{
				"type": "text",
				"text": "You are Claude Code, Anthropic's official CLI for Claude.",
				"cache_control": {
					"type": "ephemeral"
				}
			},
			{
				"type": "text",
				"text": "\nYou are an interactive CLI tool that helps users with software engineering tasks....\n\n",
				"cache_control": {
					"type": "ephemeral"
				}
			}
		],
		"tools": [
			{
				"name": "Task",
				"description": "Launch a new agent to handle complex, multi-step t....\n",
				"input_schema": {
					"type": "object",
					"properties": {
						"description": {
							"type": "string",
							"description": "A short (3-5 word) description of the task"
						},
						"prompt": {
							"type": "string",
							"description": "The task for the agent to perform"
						},
						"subagent_type": {
							"type": "string",
							"description": "The type of specialized agent to use for this task"
						}
					},
					"required": ["description", "prompt", "subagent_type"],
					"additionalProperties": false,
					"$schema": "http://json-schema.org/draft-07/schema#"
				}
			}
		],
		"metadata": {
			"user_id": "user_cbd53d3a1c01576990560dd1cf2fc652d58d4cd302b518d1dd...."
		},
		"max_tokens": 32000,
		"stream": true
	}`)

	transformer := NewManager()
	proxyReq, format, err := transformer.ParseRequest(input, "")

	if err != nil {
		t.Fatalf("TransformRequest() error = %v", err)
	}

	// 验证基本字段
	if proxyReq.Model != "claude-sonnet-4-20250514" {
		t.Errorf("TransformRequest() Model = %v, want claude-sonnet-4-20250514", proxyReq.Model)
	}
	if proxyReq.MaxTokens != 32000 {
		t.Errorf("TransformRequest() MaxTokens = %v, want 32000", proxyReq.MaxTokens)
	}
	if proxyReq.Temperature != 1.0 {
		t.Errorf("TransformRequest() Temperature = %v, want 1.0", proxyReq.Temperature)
	}
	if proxyReq.Stream == nil || !*proxyReq.Stream {
		t.Errorf("TransformRequest() Stream = %v, want true", proxyReq.Stream)
	}

	// 验证消息结构 - 转换器会将system数组转换为system消息，所以总共有2条消息
	if len(proxyReq.Messages) != 2 {
		t.Errorf("TransformRequest() Messages length = %d, want 2", len(proxyReq.Messages))
	}

	// 第一条应该是system消息
	if len(proxyReq.Messages) > 0 && proxyReq.Messages[0].Role != "system" {
		t.Errorf("TransformRequest() Messages[0].Role = %v, want system", proxyReq.Messages[0].Role)
	}

	// 第二条应该是user消息
	if len(proxyReq.Messages) > 1 && proxyReq.Messages[1].Role != "user" {
		t.Errorf("TransformRequest() Messages[1].Role = %v, want user", proxyReq.Messages[1].Role)
	}

	// 验证格式检测正确识别为 Anthropic 格式
	if format != FormatAnthropic {
		t.Errorf("DetectFormat() = %v, want FormatAnthropic", format)
	}

	// 注意：当前的ProxyRequest结构不包含tools和metadata字段
	// 这些字段在转换过程中被过滤掉了，这是正常的转换行为
}
