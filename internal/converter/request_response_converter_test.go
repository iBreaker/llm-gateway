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
		expectedFormat RequestFormat
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

	transformer := NewTransformer()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 先检测格式
			format := transformer.DetectFormat(tt.input)
			if format == FormatUnknown {
				if !tt.expectError {
					t.Errorf("DetectFormat() returned FormatUnknown for valid input")
				}
				return
			}

			proxyReq, err := transformer.TransformRequest(tt.input, format)

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

	transformer := NewTransformer()
	format := transformer.DetectFormat(input)
	proxyReq, err := transformer.TransformRequest(input, format)

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

	transformer := NewTransformer()
	format := transformer.DetectFormat(input)
	proxyReq, err := transformer.TransformRequest(input, format)

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
	if len(proxyReq.Messages) != 1 {
		t.Errorf("TransformRequest() Messages length = %d, want 1", len(proxyReq.Messages))
	}
	if proxyReq.Messages[0].Role != "user" {
		t.Errorf("TransformRequest() Messages[0].Role = %v, want user", proxyReq.Messages[0].Role)
	}
	if proxyReq.Messages[0].Content != "Hello" {
		t.Errorf("TransformRequest() Messages[0].Content = %v, want 'Hello'", proxyReq.Messages[0].Content)
	}
}

func TestTransformResponse(t *testing.T) {
	proxyResp := &types.ProxyResponse{
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
		format         RequestFormat
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

	transformer := NewTransformer()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			output, err := transformer.TransformResponse(proxyResp, tt.format)
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

	transformer := NewTransformer()
	format := transformer.DetectFormat(input)
	proxyReq, err := transformer.TransformRequest(input, format)

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
