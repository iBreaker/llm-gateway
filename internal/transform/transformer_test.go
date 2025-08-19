package transform

import (
	"encoding/json"
	"testing"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

func TestTransformer_DetectFormat(t *testing.T) {
	transformer := NewTransformer()

	tests := []struct {
		name           string
		requestBody    string
		expectedFormat RequestFormat
	}{
		{
			name: "openai_chat_completions",
			requestBody: `{
				"model": "gpt-3.5-turbo",
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`,
			expectedFormat: FormatOpenAI,
		},
		{
			name: "anthropic_chat_completions",
			requestBody: `{
				"model": "claude-3-sonnet",
				"messages": [
					{"role": "user", "content": "Hello"}
				]
			}`,
			expectedFormat: FormatAnthropic,
		},
		{
			name: "openai_legacy_completions",
			requestBody: `{
				"model": "text-davinci-003",
				"prompt": "Hello world"
			}`,
			expectedFormat: FormatOpenAI,
		},
		{
			name: "invalid_json",
			requestBody: `{invalid json}`,
			expectedFormat: FormatUnknown,
		},
		{
			name: "empty_body",
			requestBody: `{}`,
			expectedFormat: FormatUnknown,
		},
		{
			name: "anthropic_claude_model",
			requestBody: `{
				"model": "claude-instant-1",
				"messages": [
					{"role": "user", "content": "Test"}
				]
			}`,
			expectedFormat: FormatAnthropic,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			format := transformer.DetectFormat([]byte(tt.requestBody))
			if format != tt.expectedFormat {
				t.Errorf("DetectFormat() = %v, want %v", format, tt.expectedFormat)
			}
		})
	}
}

func TestTransformer_TransformOpenAIRequest(t *testing.T) {
	transformer := NewTransformer()

	requestBody := `{
		"model": "gpt-3.5-turbo",
		"messages": [
			{"role": "system", "content": "You are a helpful assistant"},
			{"role": "user", "content": "Hello"}
		],
		"max_tokens": 100,
		"temperature": 0.7,
		"stream": false
	}`

	proxyReq, err := transformer.TransformRequest([]byte(requestBody), FormatOpenAI)
	if err != nil {
		t.Fatalf("TransformRequest() error = %v", err)
	}

	// 验证转换结果
	if proxyReq.Model != "gpt-3.5-turbo" {
		t.Errorf("TransformRequest() Model = %v, want gpt-3.5-turbo", proxyReq.Model)
	}
	if len(proxyReq.Messages) != 2 {
		t.Errorf("TransformRequest() Messages length = %d, want 2", len(proxyReq.Messages))
	}
	if proxyReq.Messages[0].Role != "system" {
		t.Errorf("TransformRequest() Messages[0].Role = %v, want system", proxyReq.Messages[0].Role)
	}
	if proxyReq.Messages[1].Role != "user" {
		t.Errorf("TransformRequest() Messages[1].Role = %v, want user", proxyReq.Messages[1].Role)
	}
	if proxyReq.MaxTokens != 100 {
		t.Errorf("TransformRequest() MaxTokens = %d, want 100", proxyReq.MaxTokens)
	}
	if proxyReq.Temperature != 0.7 {
		t.Errorf("TransformRequest() Temperature = %f, want 0.7", proxyReq.Temperature)
	}
	if proxyReq.Stream != false {
		t.Errorf("TransformRequest() Stream = %v, want false", proxyReq.Stream)
	}
	if proxyReq.OriginalFormat != string(FormatOpenAI) {
		t.Errorf("TransformRequest() OriginalFormat = %v, want %v", proxyReq.OriginalFormat, string(FormatOpenAI))
	}
}

func TestTransformer_TransformAnthropicRequest(t *testing.T) {
	transformer := NewTransformer()

	requestBody := `{
		"model": "claude-3-sonnet",
		"messages": [
			{"role": "user", "content": "Hello Claude"}
		],
		"max_tokens": 1000,
		"temperature": 0.5
	}`

	proxyReq, err := transformer.TransformRequest([]byte(requestBody), FormatAnthropic)
	if err != nil {
		t.Fatalf("TransformRequest() error = %v", err)
	}

	// 验证转换结果
	if proxyReq.Model != "claude-3-sonnet" {
		t.Errorf("TransformRequest() Model = %v, want claude-3-sonnet", proxyReq.Model)
	}
	if len(proxyReq.Messages) != 1 {
		t.Errorf("TransformRequest() Messages length = %d, want 1", len(proxyReq.Messages))
	}
	if proxyReq.Messages[0].Content != "Hello Claude" {
		t.Errorf("TransformRequest() Messages[0].Content = %v, want Hello Claude", proxyReq.Messages[0].Content)
	}
	if proxyReq.OriginalFormat != string(FormatAnthropic) {
		t.Errorf("TransformRequest() OriginalFormat = %v, want %v", proxyReq.OriginalFormat, string(FormatAnthropic))
	}
}

func TestTransformer_TransformResponse(t *testing.T) {
	transformer := NewTransformer()

	response := &types.ProxyResponse{
		ID:      "test-id",
		Object:  "chat.completion",
		Created: 1234567890,
		Model:   "gpt-3.5-turbo",
		Choices: []types.ResponseChoice{
			{
				Index: 0,
				Message: types.Message{
					Role:    "assistant",
					Content: "Hello! How can I help you today?",
				},
				FinishReason: "stop",
			},
		},
		Usage: types.ResponseUsage{
			PromptTokens:     10,
			CompletionTokens: 8,
			TotalTokens:      18,
		},
	}

	// 测试转换为OpenAI格式
	openaiBytes, err := transformer.TransformResponse(response, FormatOpenAI)
	if err != nil {
		t.Fatalf("TransformResponse(OpenAI) error = %v", err)
	}

	var openaiResp types.ProxyResponse
	err = json.Unmarshal(openaiBytes, &openaiResp)
	if err != nil {
		t.Fatalf("Unmarshal OpenAI response error = %v", err)
	}

	if openaiResp.ID != response.ID {
		t.Errorf("TransformResponse(OpenAI) ID = %v, want %v", openaiResp.ID, response.ID)
	}
	if openaiResp.Model != response.Model {
		t.Errorf("TransformResponse(OpenAI) Model = %v, want %v", openaiResp.Model, response.Model)
	}

	// 测试转换为Anthropic格式
	anthropicBytes, err := transformer.TransformResponse(response, FormatAnthropic)
	if err != nil {
		t.Fatalf("TransformResponse(Anthropic) error = %v", err)
	}

	var anthropicResp types.ProxyResponse
	err = json.Unmarshal(anthropicBytes, &anthropicResp)
	if err != nil {
		t.Fatalf("Unmarshal Anthropic response error = %v", err)
	}

	if anthropicResp.ID != response.ID {
		t.Errorf("TransformResponse(Anthropic) ID = %v, want %v", anthropicResp.ID, response.ID)
	}
}

func TestTransformer_InjectSystemPrompt(t *testing.T) {
	transformer := NewTransformer()

	tests := []struct {
		name         string
		request      *types.ProxyRequest
		provider     types.Provider
		upstreamType types.UpstreamType
		expectInject bool
	}{
		{
			name: "anthropic_oauth_should_inject",
			request: &types.ProxyRequest{
				Messages: []types.Message{
					{Role: "user", Content: "Hello"},
				},
			},
			provider:     types.ProviderAnthropic,
			upstreamType: types.UpstreamTypeOAuth,
			expectInject: true,
		},
		{
			name: "anthropic_api_key_should_not_inject",
			request: &types.ProxyRequest{
				Messages: []types.Message{
					{Role: "user", Content: "Hello"},
				},
			},
			provider:     types.ProviderAnthropic,
			upstreamType: types.UpstreamTypeAPIKey,
			expectInject: false,
		},
		{
			name: "openai_oauth_should_not_inject",
			request: &types.ProxyRequest{
				Messages: []types.Message{
					{Role: "user", Content: "Hello"},
				},
			},
			provider:     types.ProviderOpenAI,
			upstreamType: types.UpstreamTypeOAuth,
			expectInject: false,
		},
		{
			name: "anthropic_oauth_with_existing_system",
			request: &types.ProxyRequest{
				Messages: []types.Message{
					{Role: "system", Content: "Existing system prompt"},
					{Role: "user", Content: "Hello"},
				},
			},
			provider:     types.ProviderAnthropic,
			upstreamType: types.UpstreamTypeOAuth,
			expectInject: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			originalMsgCount := len(tt.request.Messages)
			
			transformer.InjectSystemPrompt(tt.request, tt.provider, tt.upstreamType)

			if tt.expectInject {
				// 检查是否注入了系统提示词
				found := false
				for _, msg := range tt.request.Messages {
					if msg.Role == "system" && msg.Content == "你是 Claude Code，Anthropic的官方CLI工具" {
						found = true
						break
					}
					if msg.Role == "system" && msg.Content != "" {
						// 检查是否合并了现有的系统提示词
						if msg.Content != "Existing system prompt" && 
						   len(msg.Content) > len("你是 Claude Code，Anthropic的官方CLI工具") {
							found = true
							break
						}
					}
				}
				if !found {
					t.Error("InjectSystemPrompt() should inject Claude Code system prompt for Anthropic OAuth")
				}
			} else {
				// 检查消息没有被修改
				if len(tt.request.Messages) != originalMsgCount {
					t.Error("InjectSystemPrompt() should not modify messages for non-Anthropic OAuth")
				}
			}
		})
	}
}

func TestTransformer_TransformUnsupportedFormat(t *testing.T) {
	transformer := NewTransformer()

	requestBody := `{"model": "test"}`

	// 测试不支持的请求格式
	_, err := transformer.TransformRequest([]byte(requestBody), FormatUnknown)
	if err == nil {
		t.Error("TransformRequest() should fail for unknown format")
	}

	// 测试不支持的响应格式
	response := &types.ProxyResponse{ID: "test"}
	_, err = transformer.TransformResponse(response, FormatUnknown)
	if err == nil {
		t.Error("TransformResponse() should fail for unknown format")
	}
}

func TestTransformer_TransformInvalidJSON(t *testing.T) {
	transformer := NewTransformer()

	invalidJSON := `{invalid json}`

	// 测试无效JSON
	_, err := transformer.TransformRequest([]byte(invalidJSON), FormatOpenAI)
	if err == nil {
		t.Error("TransformRequest() should fail for invalid JSON")
	}

	_, err = transformer.TransformRequest([]byte(invalidJSON), FormatAnthropic)
	if err == nil {
		t.Error("TransformRequest() should fail for invalid JSON")
	}
}