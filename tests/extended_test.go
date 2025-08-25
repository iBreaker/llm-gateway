package tests

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// TestErrorHandling 测试错误处理
func TestErrorHandling(t *testing.T) {
	config, err := loadTestConfig()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}

	t.Run("无效API Key", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Hello",
				},
			},
			"max_tokens": config.MaxTokens,
		}

		// 使用无效的API Key
		req, _ := http.NewRequest("POST", config.GatewayBaseURL+"/v1/chat/completions", bytes.NewReader(func() []byte {
			data, _ := json.Marshal(requestBody)
			return data
		}()))
		req.Header.Set("Authorization", "Bearer invalid_key")
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: config.Timeout}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode == http.StatusOK {
			t.Error("期望请求失败，但收到成功响应")
		}

		var errorResponse map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&errorResponse)
		t.Logf("错误响应: %v", errorResponse)
	})

	t.Run("无效模型名称", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": "invalid-model-name",
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Hello",
				},
			},
			"max_tokens": config.MaxTokens,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		// 可能会成功（如果服务器处理了模型映射）或失败
		body, _ := io.ReadAll(resp.Body)
		t.Logf("模型测试响应 (状态码 %d): %s", resp.StatusCode, string(body))
	})

	t.Run("空消息内容", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "",
				},
			},
			"max_tokens": config.MaxTokens,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		body, _ := io.ReadAll(resp.Body)
		t.Logf("空消息测试响应 (状态码 %d): %s", resp.StatusCode, string(body))
	})

	t.Run("超大Token限制", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Hello",
				},
			},
			"max_tokens": 999999,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		body, _ := io.ReadAll(resp.Body)
		t.Logf("超大Token测试响应 (状态码 %d): %s", resp.StatusCode, string(body))
	})
}

// TestComplexMessages 测试复杂消息格式
func TestComplexMessages(t *testing.T) {
	config, err := loadTestConfig()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}

	t.Run("多轮对话", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "My name is Alice.",
				},
				{
					"role":    "assistant",
					"content": "Hello Alice! It's nice to meet you.",
				},
				{
					"role":    "user",
					"content": "What's my name?",
				},
			},
			"max_tokens": config.MaxTokens,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&response)
		t.Logf("多轮对话测试通过: %v", response["id"])
	})

	t.Run("长文本消息", func(t *testing.T) {
		longText := strings.Repeat("This is a long text message. ", 50)
		
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": longText,
				},
			},
			"max_tokens": config.MaxTokens,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&response)
		t.Logf("长文本消息测试通过: %v", response["id"])
	})

	t.Run("特殊字符处理", func(t *testing.T) {
		specialText := "测试中文 🚀 Special chars: @#$%^&*()[]{}|\\:;\"'<>,.?/~`"
		
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": specialText,
				},
			},
			"max_tokens": config.MaxTokens,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&response)
		t.Logf("特殊字符处理测试通过: %v", response["id"])
	})
}

// TestAdvancedToolCalls 测试高级工具调用场景
func TestAdvancedToolCalls(t *testing.T) {
	config, err := loadTestConfig()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}

	t.Run("多个工具定义", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "What's the weather in Tokyo and what time is it there?",
				},
			},
			"max_tokens": config.MaxTokens,
			"tools": []map[string]interface{}{
				{
					"type": "function",
					"function": map[string]interface{}{
						"name":        "get_weather",
						"description": "Get the current weather in a given location",
						"parameters": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"location": map[string]interface{}{
									"type":        "string",
									"description": "The city and country, e.g. Tokyo, Japan",
								},
							},
							"required": []string{"location"},
						},
					},
				},
				{
					"type": "function",
					"function": map[string]interface{}{
						"name":        "get_time",
						"description": "Get the current time in a given timezone",
						"parameters": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"timezone": map[string]interface{}{
									"type":        "string",
									"description": "The timezone, e.g. Asia/Tokyo",
								},
							},
							"required": []string{"timezone"},
						},
					},
				},
			},
			"tool_choice": "auto",
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&response)
		t.Logf("多个工具定义测试通过: %v", response["id"])
	})

	t.Run("复杂工具参数", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Create a user profile for John Doe",
				},
			},
			"max_tokens": config.MaxTokens,
			"tools": []map[string]interface{}{
				{
					"type": "function",
					"function": map[string]interface{}{
						"name":        "create_user_profile",
						"description": "Create a user profile with detailed information",
						"parameters": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"name": map[string]interface{}{
									"type":        "string",
									"description": "Full name of the user",
								},
								"age": map[string]interface{}{
									"type":        "integer",
									"description": "Age of the user",
									"minimum":     0,
									"maximum":     120,
								},
								"preferences": map[string]interface{}{
									"type": "object",
									"properties": map[string]interface{}{
										"theme": map[string]interface{}{
											"type": "string",
											"enum": []string{"light", "dark", "auto"},
										},
										"notifications": map[string]interface{}{
											"type": "boolean",
										},
									},
								},
								"tags": map[string]interface{}{
									"type": "array",
									"items": map[string]interface{}{
										"type": "string",
									},
								},
							},
							"required": []string{"name"},
						},
					},
				},
			},
			"tool_choice": "auto",
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&response)
		t.Logf("复杂工具参数测试通过: %v", response["id"])
	})
}

// TestPerformance 测试性能相关场景
func TestPerformance(t *testing.T) {
	config, err := loadTestConfig()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}

	t.Run("并发请求", func(t *testing.T) {
		concurrency := 3
		results := make(chan bool, concurrency)

		for i := 0; i < concurrency; i++ {
			go func(id int) {
				requestBody := map[string]interface{}{
					"model": config.DefaultModel,
					"messages": []map[string]interface{}{
						{
							"role":    "user",
							"content": fmt.Sprintf("Hello from goroutine %d", id),
						},
					},
					"max_tokens": 50,
				}

				resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
				if err != nil {
					t.Errorf("并发请求 %d 失败: %v", id, err)
					results <- false
					return
				}
				defer func() { _ = resp.Body.Close() }()

				success := resp.StatusCode == http.StatusOK
				results <- success
				
				if success {
					t.Logf("并发请求 %d 成功", id)
				}
			}(i)
		}

		successCount := 0
		for i := 0; i < concurrency; i++ {
			if <-results {
				successCount++
			}
		}

		t.Logf("并发测试完成: %d/%d 成功", successCount, concurrency)
		
		if successCount < concurrency/2 {
			t.Errorf("并发测试失败率过高: %d/%d", concurrency-successCount, concurrency)
		}
	})

	t.Run("响应时间测试", func(t *testing.T) {
		start := time.Now()
		
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Say hello",
				},
			},
			"max_tokens": 10,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		duration := time.Since(start)
		
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		t.Logf("响应时间测试: %v", duration)
		
		if duration > 10*time.Second {
			t.Errorf("响应时间过长: %v", duration)
		}
	})
}

// TestCrossFormatCompatibility 测试跨格式兼容性
func TestCrossFormatCompatibility(t *testing.T) {
	config, err := loadTestConfig()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}

	testCases := []struct {
		name     string
		endpoint string
		format   string
	}{
		{"OpenAI格式", "/v1/chat/completions", "openai"},
		{"Anthropic格式", "/v1/messages", "anthropic"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var requestBody map[string]interface{}

			if tc.format == "openai" {
				requestBody = map[string]interface{}{
					"model": config.DefaultModel,
					"messages": []map[string]interface{}{
						{
							"role":    "system",
							"content": "You are a helpful assistant that responds with exactly 5 words.",
						},
						{
							"role":    "user",
							"content": "Count to three",
						},
					},
					"max_tokens": 20,
				}
			} else {
				requestBody = map[string]interface{}{
					"model":      config.DefaultModel,
					"max_tokens": 20,
					"system":     "You are a helpful assistant that responds with exactly 5 words.",
					"messages": []map[string]interface{}{
						{
							"role":    "user",
							"content": "Count to three",
						},
					},
				}
			}

			resp, err := makeRequest(config, "POST", tc.endpoint, requestBody)
			if err != nil {
				t.Fatalf("请求失败: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
			}

			var response map[string]interface{}
			_ = json.NewDecoder(resp.Body).Decode(&response)
			t.Logf("%s兼容性测试通过: %v", tc.name, response["id"])
		})
	}
}

// TestStreamingRobustness 测试流式处理的健壮性
func TestStreamingRobustness(t *testing.T) {
	config, err := loadTestConfig()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}

	t.Run("长时间流式", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Tell me a detailed story about a space adventure. Make it long and interesting.",
				},
			},
			"max_tokens": 500,
			"stream":     true,
		}

		resp, err := makeRequest(config, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		scanner := bufio.NewScanner(resp.Body)
		eventCount := 0
		totalContent := ""
		
		start := time.Now()
		timeout := 30 * time.Second
		
		for scanner.Scan() {
			if time.Since(start) > timeout {
				t.Logf("流式响应超时，已接收事件数: %d", eventCount)
				break
			}
			
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				eventCount++
				data := strings.TrimPrefix(line, "data: ")
				
				if data == "[DONE]" {
					t.Log("接收到流式响应结束标记")
					break
				}

				var event map[string]interface{}
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					if choices, ok := event["choices"].([]interface{}); ok && len(choices) > 0 {
						choice := choices[0].(map[string]interface{})
						if delta, ok := choice["delta"].(map[string]interface{}); ok {
							if content, exists := delta["content"]; exists && content != nil {
								totalContent += fmt.Sprintf("%v", content)
							}
						}
					}
				}
			}
		}

		duration := time.Since(start)
		t.Logf("长时间流式测试完成: 事件数=%d, 内容长度=%d, 耗时=%v", 
			eventCount, len(totalContent), duration)

		if eventCount == 0 {
			t.Error("没有接收到任何流式事件")
		}
	})

	t.Run("流式中断恢复", func(t *testing.T) {
		// 模拟网络中断情况下的流式处理
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Count from 1 to 10 slowly",
				},
			},
			"max_tokens": 100,
			"stream":     true,
		}

		// 设置较短的超时来模拟中断
		shortTimeoutConfig := *config
		shortTimeoutConfig.Timeout = 5 * time.Second

		resp, err := makeRequest(&shortTimeoutConfig, "POST", "/v1/chat/completions", requestBody)
		if err != nil {
			// 预期可能会超时
			t.Logf("流式中断测试 - 预期的超时错误: %v", err)
			return
		}
		defer func() { _ = resp.Body.Close() }()

		scanner := bufio.NewScanner(resp.Body)
		eventCount := 0
		
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				eventCount++
				if eventCount > 5 {
					// 人为中断
					break
				}
			}
		}

		t.Logf("流式中断测试完成，接收事件数: %d", eventCount)
	})
}