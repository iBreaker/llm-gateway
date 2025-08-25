package tests

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// TestConfig 测试配置结构
type TestConfig struct {
	GatewayBaseURL string
	GatewayAPIKey  string
	DefaultModel   string
	FastModel      string
	MaxTokens      int
	Timeout        time.Duration
}

// checkAndLoadConfig 检查并加载测试配置，如果没有配置文件则跳过测试
func checkAndLoadConfig(t *testing.T) *TestConfig {
	config, err := loadTestConfig()
	if err != nil {
		t.Fatalf("加载配置失败: %v", err)
	}
	if config == nil {
		t.Skip("跳过测试: 没有找到test.env配置文件")
	}
	return config
}

// 从环境文件加载测试配置
func loadTestConfig() (*TestConfig, error) {
	// 读取 test.env 文件
	envFile := "test.env"
	file, err := os.Open(envFile)
	if err != nil {
		fmt.Printf("无法打开环境文件 %s: %v, 测试结束\n", envFile, err)
		return nil, nil
	}
	defer func() { _ = file.Close() }()

	config := &TestConfig{
		Timeout: 30 * time.Second,
	}

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), "\"")

		switch key {
		case "GATEWAY_BASE_URL":
			config.GatewayBaseURL = value
		case "GATEWAY_API_KEY":
			config.GatewayAPIKey = value
		case "DEFAULT_MODEL":
			config.DefaultModel = value
		case "FAST_MODEL":
			config.FastModel = value
		case "DEFAULT_MAX_TOKENS":
			if value != "" {
				config.MaxTokens = 100 // 默认值
				_, _ = fmt.Sscanf(value, "%d", &config.MaxTokens)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("读取环境文件失败: %v", err)
	}

	// 验证必需配置
	if config.GatewayBaseURL == "" {
		return nil, fmt.Errorf("缺少 GATEWAY_BASE_URL 配置")
	}
	if config.GatewayAPIKey == "" {
		return nil, fmt.Errorf("缺少 GATEWAY_API_KEY 配置")
	}
	if config.DefaultModel == "" {
		config.DefaultModel = "claude-3-5-sonnet-20241022"
	}
	if config.MaxTokens == 0 {
		config.MaxTokens = 100
	}

	return config, nil
}

// 发送HTTP请求的辅助函数
func makeRequest(config *TestConfig, method, endpoint string, body interface{}) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("序列化请求体失败: %v", err)
		}
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequest(method, config.GatewayBaseURL+endpoint, reqBody)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %v", err)
	}

	req.Header.Set("Authorization", "Bearer "+config.GatewayAPIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: config.Timeout}
	return client.Do(req)
}

// TestBasicOpenAIFormat 测试基础OpenAI格式
func TestBasicOpenAIFormat(t *testing.T) {
	config := checkAndLoadConfig(t)

	// 测试简单对话
	t.Run("简单对话", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Hello, how are you?",
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
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("解析响应失败: %v", err)
		}

		// 验证响应结构
		if response["id"] == nil {
			t.Error("响应缺少id字段")
		}
		if response["choices"] == nil {
			t.Error("响应缺少choices字段")
		}
		if response["usage"] == nil {
			t.Error("响应缺少usage字段")
		}

		t.Logf("OpenAI格式简单对话测试通过: %v", response["id"])
	})

	// 测试带系统消息的对话
	t.Run("带系统消息", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "system",
					"content": "You are a helpful assistant.",
				},
				{
					"role":    "user",
					"content": "What is 2+2?",
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
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("解析响应失败: %v", err)
		}

		t.Logf("OpenAI格式带系统消息测试通过: %v", response["id"])
	})
}

// TestBasicAnthropicFormat 测试基础Anthropic格式
func TestBasicAnthropicFormat(t *testing.T) {
	config := checkAndLoadConfig(t)

	// 测试简单对话
	t.Run("简单对话", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model":      config.DefaultModel,
			"max_tokens": config.MaxTokens,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Hello, how are you?",
				},
			},
		}

		resp, err := makeRequest(config, "POST", "/v1/messages", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("解析响应失败: %v", err)
		}

		// 验证响应结构
		if response["id"] == nil {
			t.Error("响应缺少id字段")
		}
		if response["content"] == nil {
			t.Error("响应缺少content字段")
		}
		if response["usage"] == nil {
			t.Error("响应缺少usage字段")
		}

		t.Logf("Anthropic格式简单对话测试通过: %v", response["id"])
	})

	// 测试带系统消息的对话
	t.Run("带系统消息-字符串格式", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model":      config.DefaultModel,
			"max_tokens": config.MaxTokens,
			"system":     "You are a helpful assistant.",
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "What is 2+2?",
				},
			},
		}

		resp, err := makeRequest(config, "POST", "/v1/messages", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("解析响应失败: %v", err)
		}

		t.Logf("Anthropic格式带系统消息(字符串)测试通过: %v", response["id"])
	})

	// 测试带系统消息的对话-数组格式
	t.Run("带系统消息-数组格式", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model":      config.DefaultModel,
			"max_tokens": config.MaxTokens,
			"system": []map[string]interface{}{
				{
					"type": "text",
					"text": "You are a helpful assistant.",
				},
			},
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "What is the capital of France?",
				},
			},
		}

		resp, err := makeRequest(config, "POST", "/v1/messages", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("解析响应失败: %v", err)
		}

		t.Logf("Anthropic格式带系统消息(数组)测试通过: %v", response["id"])
	})
}

// TestToolCalls 测试工具调用功能
func TestToolCalls(t *testing.T) {
	config := checkAndLoadConfig(t)

	// OpenAI格式工具调用
	t.Run("OpenAI格式工具调用", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "What's the weather like in Beijing?",
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
									"description": "The city and state, e.g. San Francisco, CA",
								},
							},
							"required": []string{"location"},
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
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("解析响应失败: %v", err)
		}

		t.Logf("OpenAI格式工具调用测试通过: %v", response["id"])

		// 检查是否有工具调用
		choices, ok := response["choices"].([]interface{})
		if ok && len(choices) > 0 {
			choice := choices[0].(map[string]interface{})
			message, ok := choice["message"].(map[string]interface{})
			if ok {
				if toolCalls, exists := message["tool_calls"]; exists && toolCalls != nil {
					t.Logf("检测到工具调用: %v", toolCalls)
				}
			}
		}
	})

	// Anthropic格式工具调用
	t.Run("Anthropic格式工具调用", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model":      config.DefaultModel,
			"max_tokens": config.MaxTokens,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "What's the weather like in Shanghai?",
				},
			},
			"tools": []map[string]interface{}{
				{
					"name":        "get_weather",
					"description": "Get the current weather in a given location",
					"input_schema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"location": map[string]interface{}{
								"type":        "string",
								"description": "The city and state, e.g. San Francisco, CA",
							},
						},
						"required": []string{"location"},
					},
				},
			},
		}

		resp, err := makeRequest(config, "POST", "/v1/messages", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		var response map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("解析响应失败: %v", err)
		}

		t.Logf("Anthropic格式工具调用测试通过: %v", response["id"])

		// 检查是否有工具使用
		content, ok := response["content"].([]interface{})
		if ok {
			for _, block := range content {
				if blockMap, ok := block.(map[string]interface{}); ok {
					if blockType, exists := blockMap["type"]; exists && blockType == "tool_use" {
						t.Logf("检测到工具使用: %v", blockMap["name"])
					}
				}
			}
		}
	})
}

// TestStreaming 测试流式处理
func TestStreaming(t *testing.T) {
	config := checkAndLoadConfig(t)

	// OpenAI格式流式处理
	t.Run("OpenAI格式流式", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Tell me a short story about a robot.",
				},
			},
			"max_tokens": 200,
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

		// 验证Content-Type是否为SSE
		contentType := resp.Header.Get("Content-Type")
		if !strings.Contains(contentType, "text/event-stream") {
			t.Errorf("期望Content-Type包含text/event-stream, 实际: %s", contentType)
		}

		// 读取流式响应
		scanner := bufio.NewScanner(resp.Body)
		eventCount := 0
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				eventCount++
				data := strings.TrimPrefix(line, "data: ")

				if data == "[DONE]" {
					t.Log("接收到流式响应结束标记")
					break
				}

				// 尝试解析JSON
				var event map[string]interface{}
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					if choices, ok := event["choices"].([]interface{}); ok && len(choices) > 0 {
						choice := choices[0].(map[string]interface{})
						if delta, ok := choice["delta"].(map[string]interface{}); ok {
							if content, exists := delta["content"]; exists && content != nil {
								_ = content // 内容片段存在但不处理
							}
						}
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			t.Fatalf("读取流式响应失败: %v", err)
		}

		if eventCount == 0 {
			t.Error("没有接收到任何流式事件")
		}

		t.Logf("OpenAI格式流式测试通过, 接收事件数: %d", eventCount)
	})

	// Anthropic格式流式处理
	t.Run("Anthropic格式流式", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model":      config.DefaultModel,
			"max_tokens": 200,
			"stream":     true,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "Tell me a short story about a cat.",
				},
			},
		}

		resp, err := makeRequest(config, "POST", "/v1/messages", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		// 验证Content-Type是否为SSE
		contentType := resp.Header.Get("Content-Type")
		if !strings.Contains(contentType, "text/event-stream") {
			t.Errorf("期望Content-Type包含text/event-stream, 实际: %s", contentType)
		}

		// 读取流式响应
		scanner := bufio.NewScanner(resp.Body)
		eventCount := 0
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				eventCount++
				data := strings.TrimPrefix(line, "data: ")

				// 尝试解析JSON
				var event map[string]interface{}
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					eventType, _ := event["type"].(string)
					switch eventType {
					case "content_block_delta":
						if delta, ok := event["delta"].(map[string]interface{}); ok {
							if text, exists := delta["text"]; exists && text != nil {
								_ = text // 文本增量存在但不处理
							}
						}
					case "message_stop":
						t.Log("接收到Anthropic流式响应结束标记")
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			t.Fatalf("读取流式响应失败: %v", err)
		}

		if eventCount == 0 {
			t.Error("没有接收到任何流式事件")
		}

		t.Logf("Anthropic格式流式测试通过, 接收事件数: %d", eventCount)
	})
}

// TestStreamingToolCalls 测试流式工具调用
func TestStreamingToolCalls(t *testing.T) {
	config := checkAndLoadConfig(t)

	// OpenAI格式流式工具调用
	t.Run("OpenAI格式流式工具调用", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model": config.DefaultModel,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "What's the weather like in Tokyo?",
				},
			},
			"max_tokens": config.MaxTokens,
			"stream":     true,
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
									"description": "The city and state, e.g. San Francisco, CA",
								},
							},
							"required": []string{"location"},
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

		// 验证Content-Type是否为SSE
		contentType := resp.Header.Get("Content-Type")
		if !strings.Contains(contentType, "text/event-stream") {
			t.Errorf("期望Content-Type包含text/event-stream, 实际: %s", contentType)
		}

		// 读取流式响应
		scanner := bufio.NewScanner(resp.Body)
		eventCount := 0
		toolCallDetected := false

		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				eventCount++
				data := strings.TrimPrefix(line, "data: ")

				if data == "[DONE]" {
					t.Log("接收到流式响应结束标记")
					break
				}

				// 尝试解析JSON
				var event map[string]interface{}
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					if choices, ok := event["choices"].([]interface{}); ok && len(choices) > 0 {
						choice := choices[0].(map[string]interface{})
						if delta, ok := choice["delta"].(map[string]interface{}); ok {
							if toolCalls, exists := delta["tool_calls"]; exists && toolCalls != nil {
								toolCallDetected = true
								t.Logf("检测到流式工具调用: %v", toolCalls)
							}
						}
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			t.Fatalf("读取流式响应失败: %v", err)
		}

		if eventCount == 0 {
			t.Error("没有接收到任何流式事件")
		}

		t.Logf("OpenAI格式流式工具调用测试通过, 接收事件数: %d, 检测到工具调用: %v", eventCount, toolCallDetected)
	})

	// Anthropic格式流式工具调用
	t.Run("Anthropic格式流式工具调用", func(t *testing.T) {
		requestBody := map[string]interface{}{
			"model":      config.DefaultModel,
			"max_tokens": config.MaxTokens,
			"stream":     true,
			"messages": []map[string]interface{}{
				{
					"role":    "user",
					"content": "What's the weather like in Paris?",
				},
			},
			"tools": []map[string]interface{}{
				{
					"name":        "get_weather",
					"description": "Get the current weather in a given location",
					"input_schema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"location": map[string]interface{}{
								"type":        "string",
								"description": "The city and state, e.g. San Francisco, CA",
							},
						},
						"required": []string{"location"},
					},
				},
			},
		}

		resp, err := makeRequest(config, "POST", "/v1/messages", requestBody)
		if err != nil {
			t.Fatalf("请求失败: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
		}

		// 验证Content-Type是否为SSE
		contentType := resp.Header.Get("Content-Type")
		if !strings.Contains(contentType, "text/event-stream") {
			t.Errorf("期望Content-Type包含text/event-stream, 实际: %s", contentType)
		}

		// 读取流式响应
		scanner := bufio.NewScanner(resp.Body)
		eventCount := 0
		toolUseDetected := false

		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				eventCount++
				data := strings.TrimPrefix(line, "data: ")

				// 尝试解析JSON
				var event map[string]interface{}
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					eventType, _ := event["type"].(string)

					switch eventType {
					case "content_block_start":
						if contentBlock, ok := event["content_block"].(map[string]interface{}); ok {
							if blockType, exists := contentBlock["type"]; exists && blockType == "tool_use" {
								toolUseDetected = true
								toolName, _ := contentBlock["name"].(string)
								t.Logf("检测到流式工具使用开始: %s", toolName)
							}
						}
					case "content_block_delta":
						if delta, ok := event["delta"].(map[string]interface{}); ok {
							if deltaType, exists := delta["type"]; exists && deltaType == "input_json_delta" {
								_ = deltaType // 工具输入增量存在但不处理
							}
						}
					case "message_stop":
						t.Log("接收到Anthropic流式响应结束标记")
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			t.Fatalf("读取流式响应失败: %v", err)
		}

		if eventCount == 0 {
			t.Error("没有接收到任何流式事件")
		}

		t.Logf("Anthropic格式流式工具调用测试通过, 接收事件数: %d, 检测到工具使用: %v", eventCount, toolUseDetected)
	})
}
