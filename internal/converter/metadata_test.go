package converter

import (
	"encoding/json"
	"testing"
)

func TestMetadataPreservation(t *testing.T) {
	conv := NewRequestResponseConverter()

	tests := []struct {
		name        string
		input       string
		expectError bool
		checkFunc   func(t *testing.T, rebuilt []byte)
	}{
		{
			name: "Anthropic请求包含metadata.user_id",
			input: `{
				"model": "claude-3-sonnet-20240229",
				"system": "You are a helpful assistant",
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 100,
				"metadata": {"user_id": "user-123456"}
			}`,
			expectError: false,
			checkFunc: func(t *testing.T, rebuilt []byte) {
				var result map[string]interface{}
				if err := json.Unmarshal(rebuilt, &result); err != nil {
					t.Fatalf("解析重建请求失败: %v", err)
				}

				metadata, exists := result["metadata"]
				if !exists {
					t.Error("metadata字段丢失")
					return
				}

				metadataMap, ok := metadata.(map[string]interface{})
				if !ok {
					t.Errorf("metadata应该是对象，实际类型: %T", metadata)
					return
				}

				userID, exists := metadataMap["user_id"]
				if !exists {
					t.Error("metadata.user_id字段丢失")
					return
				}

				if userID != "user-123456" {
					t.Errorf("user_id值不匹配，期望: user-123456, 实际: %v", userID)
				}
			},
		},
		{
			name: "Anthropic请求包含复杂metadata",
			input: `{
				"model": "claude-3-sonnet-20240229",
				"system": "You are a helpful assistant",
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 100,
				"metadata": {
					"user_id": "user-789",
					"session_id": "session-abc123",
					"custom_field": "custom_value"
				}
			}`,
			expectError: false,
			checkFunc: func(t *testing.T, rebuilt []byte) {
				var result map[string]interface{}
				if err := json.Unmarshal(rebuilt, &result); err != nil {
					t.Fatalf("解析重建请求失败: %v", err)
				}

				metadata, exists := result["metadata"]
				if !exists {
					t.Error("metadata字段丢失")
					return
				}

				metadataMap := metadata.(map[string]interface{})

				expectedFields := map[string]string{
					"user_id":      "user-789",
					"session_id":   "session-abc123",
					"custom_field": "custom_value",
				}

				for field, expectedValue := range expectedFields {
					actualValue, exists := metadataMap[field]
					if !exists {
						t.Errorf("metadata.%s字段丢失", field)
						continue
					}
					if actualValue != expectedValue {
						t.Errorf("metadata.%s值不匹配，期望: %s, 实际: %v", field, expectedValue, actualValue)
					}
				}
			},
		},
		{
			name: "Anthropic请求不包含metadata",
			input: `{
				"model": "claude-3-sonnet-20240229",
				"system": "You are a helpful assistant", 
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 100
			}`,
			expectError: false,
			checkFunc: func(t *testing.T, rebuilt []byte) {
				var result map[string]interface{}
				if err := json.Unmarshal(rebuilt, &result); err != nil {
					t.Fatalf("解析重建请求失败: %v", err)
				}

				// 不包含metadata是正常的
				if _, exists := result["metadata"]; exists {
					t.Log("没有metadata字段，这是预期的行为")
				}
			},
		},
		{
			name: "字符串格式system + metadata组合",
			input: `{
				"model": "claude-3-sonnet-20240229",
				"system": "You are a helpful assistant",
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 100,
				"metadata": {"user_id": "test-user"}
			}`,
			expectError: false,
			checkFunc: func(t *testing.T, rebuilt []byte) {
				var result map[string]interface{}
				json.Unmarshal(rebuilt, &result)

				// 检查system格式保持
				system := result["system"]
				if systemStr, ok := system.(string); ok {
					if systemStr != "You are a helpful assistant" {
						t.Errorf("system字符串格式未保持")
					}
				} else {
					t.Errorf("system应该是字符串格式，实际类型: %T", system)
				}

				// 检查metadata保持
				metadata := result["metadata"]
				if metadata == nil {
					t.Error("metadata字段丢失")
				}
			},
		},
		{
			name: "数组格式system + metadata组合",
			input: `{
				"model": "claude-3-sonnet-20240229",
				"system": [{"type":"text","text":"You are a helpful assistant"}],
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 100,
				"metadata": {"user_id": "test-user"}
			}`,
			expectError: false,
			checkFunc: func(t *testing.T, rebuilt []byte) {
				var result map[string]interface{}
				json.Unmarshal(rebuilt, &result)

				// 检查system数组格式保持
				system := result["system"]
				if _, ok := system.([]interface{}); !ok {
					t.Errorf("system应该是数组格式，实际类型: %T", system)
				}

				// 检查metadata保持
				metadata := result["metadata"]
				if metadata == nil {
					t.Error("metadata字段丢失")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 解析请求
			proxyReq, err := conv.TransformRequest([]byte(tt.input), FormatAnthropic)

			if tt.expectError {
				if err == nil {
					t.Error("期望解析失败，但成功了")
				}
				return
			}

			if err != nil {
				t.Fatalf("解析请求失败: %v", err)
			}

			// 重建请求
			rebuilt, err := conv.BuildAnthropicRequest(proxyReq)
			if err != nil {
				t.Fatalf("重建请求失败: %v", err)
			}

			// 执行检查函数
			tt.checkFunc(t, rebuilt)
		})
	}
}

func TestSystemFieldPreservation(t *testing.T) {
	conv := NewRequestResponseConverter()

	tests := []struct {
		name   string
		input  string
		expect func(t *testing.T, rebuilt []byte)
	}{
		{
			name: "字符串格式system保持",
			input: `{
				"model": "claude-3-sonnet-20240229",
				"system": "You are a helpful assistant",
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 100
			}`,
			expect: func(t *testing.T, rebuilt []byte) {
				var result map[string]interface{}
				json.Unmarshal(rebuilt, &result)

				system := result["system"]
				if systemStr, ok := system.(string); ok {
					if systemStr != "You are a helpful assistant" {
						t.Errorf("system内容不匹配")
					}
				} else {
					t.Errorf("system应该保持字符串格式，实际类型: %T", system)
				}
			},
		},
		{
			name: "数组格式system保持",
			input: `{
				"model": "claude-3-sonnet-20240229",
				"system": [{"type":"text","text":"You are a helpful assistant","cache_control":{"type":"ephemeral"}}],
				"messages": [{"role": "user", "content": "Hello"}],
				"max_tokens": 100
			}`,
			expect: func(t *testing.T, rebuilt []byte) {
				var result map[string]interface{}
				json.Unmarshal(rebuilt, &result)

				system := result["system"]
				if systemArray, ok := system.([]interface{}); ok {
					if len(systemArray) != 1 {
						t.Errorf("system数组长度应该是1，实际: %d", len(systemArray))
						return
					}

					block := systemArray[0].(map[string]interface{})
					if block["type"] != "text" {
						t.Errorf("system block type不匹配")
					}
					if block["text"] != "You are a helpful assistant" {
						t.Errorf("system block text不匹配")
					}

					// 检查cache_control是否保留
					if cacheControl, exists := block["cache_control"]; exists {
						if cc, ok := cacheControl.(map[string]interface{}); ok {
							if cc["type"] != "ephemeral" {
								t.Errorf("cache_control类型不匹配")
							}
						} else {
							t.Errorf("cache_control格式错误")
						}
					} else {
						t.Errorf("cache_control字段丢失")
					}
				} else {
					t.Errorf("system应该保持数组格式，实际类型: %T", system)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			proxyReq, err := conv.TransformRequest([]byte(tt.input), FormatAnthropic)
			if err != nil {
				t.Fatalf("解析失败: %v", err)
			}

			rebuilt, err := conv.BuildAnthropicRequest(proxyReq)
			if err != nil {
				t.Fatalf("重建失败: %v", err)
			}

			tt.expect(t, rebuilt)
		})
	}
}
