package converter

import (
	"testing"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

func TestConverterUpstreamPaths(t *testing.T) {
	tests := []struct {
		name           string
		converter      Converter
		clientEndpoint string
		expectedPath   string
	}{
		{
			name:           "OpenAI Converter - chat/completions",
			converter:      NewOpenAIConverter(),
			clientEndpoint: "/v1/chat/completions",
			expectedPath:   "/v1/chat/completions",
		},
		{
			name:           "OpenAI Converter - completions",
			converter:      NewOpenAIConverter(),
			clientEndpoint: "/v1/completions",
			expectedPath:   "/v1/chat/completions",
		},
		{
			name:           "OpenAI Converter - messages (兼容)",
			converter:      NewOpenAIConverter(),
			clientEndpoint: "/v1/messages",
			expectedPath:   "/v1/chat/completions",
		},
		{
			name:           "Anthropic Converter - chat/completions",
			converter:      NewAnthropicConverter(),
			clientEndpoint: "/v1/chat/completions",
			expectedPath:   "/v1/messages",
		},
		{
			name:           "Anthropic Converter - messages",
			converter:      NewAnthropicConverter(),
			clientEndpoint: "/v1/messages",
			expectedPath:   "/v1/messages",
		},
		{
			name:           "Anthropic Converter - completions",
			converter:      NewAnthropicConverter(),
			clientEndpoint: "/v1/completions",
			expectedPath:   "/v1/messages",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := tt.converter.GetUpstreamPath(tt.clientEndpoint)
			if path != tt.expectedPath {
				t.Errorf("GetUpstreamPath() = %v, want %v", path, tt.expectedPath)
			}
		})
	}
}

func TestManagerUpstreamPath(t *testing.T) {
	manager := NewManager()

	tests := []struct {
		name           string
		provider       types.Provider
		clientEndpoint string
		expectedPath   string
		expectError    bool
	}{
		{
			name:           "Anthropic Provider",
			provider:       types.ProviderAnthropic,
			clientEndpoint: "/v1/chat/completions",
			expectedPath:   "/v1/messages",
			expectError:    false,
		},
		{
			name:           "OpenAI Provider",
			provider:       types.ProviderOpenAI,
			clientEndpoint: "/v1/chat/completions",
			expectedPath:   "/v1/chat/completions",
			expectError:    false,
		},
		{
			name:           "Qwen Provider (默认OpenAI格式)",
			provider:       types.ProviderQwen,
			clientEndpoint: "/v1/chat/completions",
			expectedPath:   "/v1/chat/completions",
			expectError:    false,
		},
		{
			name:           "Google Provider (默认OpenAI格式)",
			provider:       types.ProviderGoogle,
			clientEndpoint: "/v1/chat/completions",
			expectedPath:   "/v1/chat/completions",
			expectError:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path, err := manager.GetUpstreamPath(tt.provider, tt.clientEndpoint)
			
			if tt.expectError && err == nil {
				t.Errorf("Expected error but got none")
				return
			}
			
			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}
			
			if path != tt.expectedPath {
				t.Errorf("GetUpstreamPath() = %v, want %v", path, tt.expectedPath)
			}
		})
	}
}