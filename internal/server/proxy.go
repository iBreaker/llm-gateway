package server

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/router"
	"github.com/iBreaker/llm-gateway/internal/transform"
	"github.com/iBreaker/llm-gateway/internal/upstream"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// ProxyHandler 代理处理器
type ProxyHandler struct {
	gatewayKeyMgr *client.GatewayKeyManager
	upstreamMgr   *upstream.UpstreamManager
	router        *router.RequestRouter
	transformer   *transform.Transformer
	httpClient    *http.Client
}

// NewProxyHandler 创建代理处理器
func NewProxyHandler(
	gatewayKeyMgr *client.GatewayKeyManager,
	upstreamMgr *upstream.UpstreamManager,
	router *router.RequestRouter,
	transformer *transform.Transformer,
) *ProxyHandler {
	return &ProxyHandler{
		gatewayKeyMgr: gatewayKeyMgr,
		upstreamMgr:   upstreamMgr,
		router:        router,
		transformer:   transformer,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// HandleChatCompletions 处理聊天完成请求
func (h *ProxyHandler) HandleChatCompletions(w http.ResponseWriter, r *http.Request) {
	h.handleProxyRequest(w, r, "/v1/messages", "/v1/chat/completions") // 第二个参数是客户端端点
}

// HandleCompletions 处理文本完成请求  
func (h *ProxyHandler) HandleCompletions(w http.ResponseWriter, r *http.Request) {
	h.handleProxyRequest(w, r, "/v1/complete", "/v1/completions")
}

// HandleMessages 处理Anthropic原生消息端点
func (h *ProxyHandler) HandleMessages(w http.ResponseWriter, r *http.Request) {
	h.handleProxyRequest(w, r, "/v1/messages", "/v1/messages")
}

// handleProxyRequest 处理代理请求的核心逻辑
func (h *ProxyHandler) handleProxyRequest(w http.ResponseWriter, r *http.Request, upstreamPath, clientEndpoint string) {
	startTime := time.Now()
	
	// 1. 读取请求体
	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, "invalid_request_body", "Failed to read request body")
		return
	}
	defer r.Body.Close()

	// 2. 检测请求格式
	requestFormat := h.transformer.DetectFormatWithEndpoint(requestBody, clientEndpoint)
	if requestFormat == transform.FormatUnknown {
		h.writeErrorResponse(w, http.StatusBadRequest, "unsupported_format", "Unsupported request format")
		return
	}

	// 3. 转换请求到统一格式
	proxyReq, err := h.transformer.TransformRequest(requestBody, requestFormat)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, "request_transform_error", fmt.Sprintf("Failed to transform request: %v", err))
		return
	}

	// 4. 设置请求上下文信息
	keyID := r.Header.Get("X-Gateway-Key-ID")
	proxyReq.GatewayKeyID = keyID

	// 5. 确定目标提供商（暂时硬编码为Anthropic，后续可以根据模型名称智能路由）
	targetProvider := h.determineProvider(proxyReq.Model)

	// 6. 选择上游账号
	upstreamAccount, err := h.router.SelectUpstream(targetProvider)
	if err != nil {
		h.writeErrorResponse(w, http.StatusServiceUnavailable, "no_upstream_available", fmt.Sprintf("No available upstream for provider %s: %v", targetProvider, err))
		return
	}
	proxyReq.UpstreamID = upstreamAccount.ID

	// 7. 根据上游账号类型注入特殊处理
	h.transformer.InjectSystemPrompt(proxyReq, upstreamAccount.Provider, upstreamAccount.Type)

	// 8. 根据stream参数选择处理方式
	if proxyReq.Stream {
		// 流式响应处理
		h.handleStreamResponse(w, upstreamAccount, proxyReq, upstreamPath, requestFormat, keyID, startTime)
	} else {
		// 非流式响应处理
		h.handleNonStreamResponse(w, upstreamAccount, proxyReq, upstreamPath, requestFormat, keyID, startTime)
	}
}

// handleNonStreamResponse 处理非流式响应
func (h *ProxyHandler) handleNonStreamResponse(w http.ResponseWriter, account *types.UpstreamAccount, request *types.ProxyRequest, upstreamPath string, requestFormat transform.RequestFormat, keyID string, startTime time.Time) {
	// 调用上游API
	response, err := h.callUpstreamAPI(account, request, upstreamPath)
	if err != nil {
		h.handleUpstreamError(w, account, err)
		return
	}

	// 转换响应格式
	responseBytes, err := h.transformer.TransformResponse(response, requestFormat)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, "response_transform_error", fmt.Sprintf("Failed to transform response: %v", err))
		return
	}

	// 记录成功统计
	duration := time.Since(startTime)
	go h.recordSuccess(keyID, account.ID, duration, response.Usage.TotalTokens)

	// 返回响应
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(responseBytes)
}

// handleStreamResponse 处理流式响应
func (h *ProxyHandler) handleStreamResponse(w http.ResponseWriter, account *types.UpstreamAccount, request *types.ProxyRequest, upstreamPath string, requestFormat transform.RequestFormat, keyID string, startTime time.Time) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	// 获取Flusher确保实时推送
	flusher, ok := w.(http.Flusher)
	if !ok {
		h.writeErrorResponse(w, http.StatusInternalServerError, "stream_not_supported", "Streaming not supported")
		return
	}

	// 调用上游流式API
	err := h.callUpstreamStreamAPI(w, flusher, account, request, upstreamPath, requestFormat, keyID, startTime)
	if err != nil {
		// 流式响应中的错误处理
		h.writeStreamError(w, flusher, err)
		return
	}
}

// callUpstreamStreamAPI 调用上游流式API
func (h *ProxyHandler) callUpstreamStreamAPI(w http.ResponseWriter, flusher http.Flusher, account *types.UpstreamAccount, request *types.ProxyRequest, path string, requestFormat transform.RequestFormat, keyID string, startTime time.Time) error {
	// 构建上游请求
	upstreamReq, err := h.buildUpstreamRequest(account, request, path)
	if err != nil {
		return fmt.Errorf("failed to build upstream request: %w", err)
	}

	// 发送流式请求
	resp, err := h.httpClient.Do(upstreamReq)
	if err != nil {
		return fmt.Errorf("upstream request failed: %w", err)
	}
	defer resp.Body.Close()

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("upstream API error: status=%d", resp.StatusCode)
	}

	// 验证Content-Type是否为流式响应
	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "text/event-stream") {
		return fmt.Errorf("unexpected content type: %s", contentType)
	}

	// 不需要显式调用WriteHeader，让Go在第一次写入时自动发送200状态码
	// 这样可以避免与中间件包装器的WriteHeader冲突
	flusher.Flush()
	
	// 开始处理流式响应
	return h.processStreamResponse(w, flusher, resp.Body, account.Provider, requestFormat, keyID, account.ID, startTime)
}

// processStreamResponse 处理流式响应
func (h *ProxyHandler) processStreamResponse(w http.ResponseWriter, flusher http.Flusher, responseBody io.Reader, provider types.Provider, requestFormat transform.RequestFormat, keyID, upstreamID string, startTime time.Time) error {
	scanner := bufio.NewScanner(responseBody)
	var totalTokens int
	var firstEvent bool = true

	for scanner.Scan() {
		line := scanner.Text()
		
		// 跳过空行
		if line == "" {
			continue
		}

		// 解析SSE事件
		if strings.HasPrefix(line, "data: ") {
			data := line[6:] // 移除"data: "前缀
			
			// 处理结束标记
			if data == "[DONE]" {
				// OpenAI风格的结束标记
				if requestFormat == transform.FormatOpenAI {
					fmt.Fprintf(w, "data: [DONE]\n\n")
					flusher.Flush()
				}
				break
			}

			// 转换并写入事件
			convertedEvent, tokens, err := h.convertStreamEvent(data, provider, requestFormat, firstEvent)
			if err != nil {
				// 记录错误但继续处理
				continue
			}

			if convertedEvent != "" {
				fmt.Fprintf(w, "data: %s\n\n", convertedEvent)
				flusher.Flush()
				firstEvent = false
			}

			totalTokens += tokens
		} else if strings.HasPrefix(line, "event: ") {
			// Anthropic风格的命名事件，需要读取下一行的data
			eventType := line[7:] // 移除"event: "前缀
			if scanner.Scan() {
				dataLine := scanner.Text()
				if strings.HasPrefix(dataLine, "data: ") {
					data := dataLine[6:]
					
					// 处理命名事件
					convertedEvent, tokens, err := h.convertNamedEvent(eventType, data, requestFormat, firstEvent)
					if err != nil {
						continue
					}

					if convertedEvent != "" {
						fmt.Fprintf(w, "data: %s\n\n", convertedEvent)
						flusher.Flush()
						firstEvent = false
					}

					totalTokens += tokens

					// 处理结束事件
					if eventType == "message_stop" && requestFormat == transform.FormatOpenAI {
						fmt.Fprintf(w, "data: [DONE]\n\n")
						flusher.Flush()
						break
					}
				}
			}
		}
	}

	// 记录成功统计
	duration := time.Since(startTime)
	go h.recordSuccess(keyID, upstreamID, duration, totalTokens)

	return scanner.Err()
}

// writeStreamError 写入流式错误
func (h *ProxyHandler) writeStreamError(w http.ResponseWriter, flusher http.Flusher, err error) {
	errorEvent := map[string]interface{}{
		"error": map[string]string{
			"type":    "stream_error",
			"message": err.Error(),
		},
	}
	
	errorBytes, _ := json.Marshal(errorEvent)
	fmt.Fprintf(w, "data: %s\n\n", string(errorBytes))
	flusher.Flush()
}

// convertStreamEvent 转换流式事件（处理无命名的data事件）
func (h *ProxyHandler) convertStreamEvent(data string, provider types.Provider, targetFormat transform.RequestFormat, isFirst bool) (string, int, error) {
	// 解析JSON数据
	var eventData map[string]interface{}
	if err := json.Unmarshal([]byte(data), &eventData); err != nil {
		return "", 0, err
	}

	// 提取token使用量
	tokens := h.extractTokensFromEvent(eventData)

	// 根据提供商和目标格式转换
	if provider == types.ProviderAnthropic && targetFormat == transform.FormatOpenAI {
		// Anthropic -> OpenAI：这种情况很少见，因为Anthropic通常使用命名事件
		return h.convertAnthropicToOpenAI(eventData, isFirst)
	} else if provider == types.ProviderOpenAI && targetFormat == transform.FormatAnthropic {
		// OpenAI -> Anthropic：转换chunk为Anthropic事件
		return h.convertOpenAIToAnthropic(eventData, isFirst)
	} else {
		// 相同格式，直接透传
		return data, tokens, nil
	}
}

// convertNamedEvent 转换命名事件（处理Anthropic的event: xxx格式）
func (h *ProxyHandler) convertNamedEvent(eventType, data string, targetFormat transform.RequestFormat, isFirst bool) (string, int, error) {
	// 解析JSON数据
	var eventData map[string]interface{}
	if err := json.Unmarshal([]byte(data), &eventData); err != nil {
		return "", 0, err
	}

	// 提取token使用量
	tokens := h.extractTokensFromEvent(eventData)

	// 如果目标格式是Anthropic，直接透传
	if targetFormat == transform.FormatAnthropic {
		return data, tokens, nil
	}

	// 转换Anthropic命名事件到OpenAI格式
	return h.convertAnthropicEventToOpenAI(eventType, eventData, isFirst)
}

// extractTokensFromEvent 从事件中提取token信息
func (h *ProxyHandler) extractTokensFromEvent(eventData map[string]interface{}) int {
	// 尝试从usage字段提取
	if usage, ok := eventData["usage"].(map[string]interface{}); ok {
		if total, ok := usage["total_tokens"].(float64); ok {
			return int(total)
		}
		if output, ok := usage["output_tokens"].(float64); ok {
			return int(output)
		}
	}

	// 尝试从choices中的usage提取
	if choices, ok := eventData["choices"].([]interface{}); ok {
		for _, choice := range choices {
			if choiceMap, ok := choice.(map[string]interface{}); ok {
				if usage, ok := choiceMap["usage"].(map[string]interface{}); ok {
					if total, ok := usage["total_tokens"].(float64); ok {
						return int(total)
					}
				}
			}
		}
	}

	return 0
}

// convertOpenAIToAnthropic 转换OpenAI chunk到Anthropic事件
func (h *ProxyHandler) convertOpenAIToAnthropic(eventData map[string]interface{}, isFirst bool) (string, int, error) {
	// 简化实现：暂时只处理内容转换
	choices, ok := eventData["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", 0, nil
	}

	choice := choices[0].(map[string]interface{})
	delta, ok := choice["delta"].(map[string]interface{})
	if !ok {
		return "", 0, nil
	}

	// 检查是否有内容
	if content, ok := delta["content"].(string); ok && content != "" {
		// 构建Anthropic content_block_delta事件
		anthropicEvent := map[string]interface{}{
			"type":  "content_block_delta",
			"index": 0,
			"delta": map[string]interface{}{
				"type": "text_delta",
				"text": content,
			},
		}

		result, err := json.Marshal(anthropicEvent)
		if err != nil {
			return "", 0, err
		}

		return string(result), 0, nil
	}

	return "", 0, nil
}

// convertAnthropicToOpenAI 转换Anthropic事件到OpenAI chunk
func (h *ProxyHandler) convertAnthropicToOpenAI(eventData map[string]interface{}, isFirst bool) (string, int, error) {
	// 这是从data事件转换（少见），暂时简单处理
	return "", 0, nil
}

// convertAnthropicEventToOpenAI 转换Anthropic命名事件到OpenAI chunk
func (h *ProxyHandler) convertAnthropicEventToOpenAI(eventType string, eventData map[string]interface{}, isFirst bool) (string, int, error) {
	switch eventType {
	case "message_start":
		// 第一个chunk，包含role信息
		if isFirst {
			chunk := map[string]interface{}{
				"id":      eventData["message"].(map[string]interface{})["id"],
				"object":  "chat.completion.chunk",
				"created": time.Now().Unix(),
				"model":   eventData["message"].(map[string]interface{})["model"],
				"choices": []map[string]interface{}{
					{
						"index": 0,
						"delta": map[string]interface{}{
							"role": "assistant",
						},
						"finish_reason": nil,
					},
				},
			}
			result, err := json.Marshal(chunk)
			return string(result), 0, err
		}
		return "", 0, nil

	case "content_block_delta":
		// 内容增量
		delta, ok := eventData["delta"].(map[string]interface{})
		if !ok {
			return "", 0, nil
		}

		text, ok := delta["text"].(string)
		if !ok {
			return "", 0, nil
		}

		chunk := map[string]interface{}{
			"id":      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
			"object":  "chat.completion.chunk",
			"created": time.Now().Unix(),
			"model":   "claude-sonnet-4-20250514", // 暂时硬编码
			"choices": []map[string]interface{}{
				{
					"index": 0,
					"delta": map[string]interface{}{
						"content": text,
					},
					"finish_reason": nil,
				},
			},
		}

		result, err := json.Marshal(chunk)
		return string(result), 0, err

	case "message_stop":
		// 结束事件
		chunk := map[string]interface{}{
			"id":      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
			"object":  "chat.completion.chunk",
			"created": time.Now().Unix(),
			"model":   "claude-sonnet-4-20250514",
			"choices": []map[string]interface{}{
				{
					"index":         0,
					"delta":         map[string]interface{}{},
					"finish_reason": "stop",
				},
			},
		}

		result, err := json.Marshal(chunk)
		return string(result), 0, err

	default:
		// 其他事件类型暂不处理
		return "", 0, nil
	}
}

// determineProvider 根据模型名称确定提供商
func (h *ProxyHandler) determineProvider(model string) types.Provider {
	model = strings.ToLower(model)
	
	// 根据模型名称前缀判断提供商
	if strings.Contains(model, "claude") || strings.Contains(model, "anthropic") {
		return types.ProviderAnthropic
	}
	if strings.Contains(model, "gpt") || strings.Contains(model, "openai") {
		return types.ProviderOpenAI
	}
	if strings.Contains(model, "gemini") || strings.Contains(model, "google") {
		return types.ProviderGoogle
	}
	if strings.Contains(model, "azure") {
		return types.ProviderAzure
	}
	
	// 默认使用Anthropic
	return types.ProviderAnthropic
}

// callUpstreamAPI 调用上游API
func (h *ProxyHandler) callUpstreamAPI(account *types.UpstreamAccount, request *types.ProxyRequest, path string) (*types.ProxyResponse, error) {
	// 1. 构建上游请求
	upstreamReq, err := h.buildUpstreamRequest(account, request, path)
	if err != nil {
		return nil, fmt.Errorf("failed to build upstream request: %w", err)
	}

	// 2. 发送请求
	resp, err := h.httpClient.Do(upstreamReq)
	if err != nil {
		return nil, fmt.Errorf("upstream request failed: %w", err)
	}
	defer resp.Body.Close()

	// 3. 读取响应
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read upstream response: %w", err)
	}

	// 4. 检查响应状态
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream API error: status=%d, body=%s", resp.StatusCode, string(responseBody))
	}

	// 5. 解析响应 - 根据提供商类型处理不同的响应格式
	proxyResponse, err := h.parseUpstreamResponse(responseBody, account.Provider)
	if err != nil {
		return nil, fmt.Errorf("failed to parse upstream response: %w", err)
	}

	return proxyResponse, nil
}

// buildUpstreamRequest 构建上游请求
func (h *ProxyHandler) buildUpstreamRequest(account *types.UpstreamAccount, request *types.ProxyRequest, path string) (*http.Request, error) {
	// 1. 根据上游提供商转换请求格式
	var requestBody []byte
	var err error
	
	switch account.Provider {
	case types.ProviderAnthropic:
		requestBody, err = h.transformer.TransformToAnthropicRequest(request)
	case types.ProviderOpenAI:
		requestBody, err = h.transformer.TransformToOpenAIRequest(request)
	default:
		// 默认使用内部格式（与OpenAI兼容）
		requestBody, err = json.Marshal(request)
	}
	
	if err != nil {
		return nil, fmt.Errorf("failed to transform request for upstream: %w", err)
	}

	// 2. 构建URL (优先使用账号配置的BaseURL)
	baseURL := account.BaseURL
	if baseURL == "" {
		baseURL = h.getProviderBaseURL(account.Provider)
	}
	url := baseURL + path

	// 3. 创建HTTP请求
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// 4. 设置通用头部
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "LLM-Gateway/1.0")

	// 5. 设置认证头部
	if err := h.setAuthHeaders(req, account); err != nil {
		return nil, fmt.Errorf("failed to set auth headers: %w", err)
	}

	return req, nil
}

// parseUpstreamResponse 根据提供商类型解析上游响应
func (h *ProxyHandler) parseUpstreamResponse(responseBody []byte, provider types.Provider) (*types.ProxyResponse, error) {
	switch provider {
	case types.ProviderAnthropic:
		return h.parseAnthropicResponse(responseBody)
	case types.ProviderOpenAI:
		return h.parseOpenAIResponse(responseBody)
	default:
		// 默认尝试OpenAI格式
		return h.parseOpenAIResponse(responseBody)
	}
}

// parseAnthropicResponse 解析Anthropic API响应
func (h *ProxyHandler) parseAnthropicResponse(responseBody []byte) (*types.ProxyResponse, error) {
	// Anthropic API响应格式
	var anthropicResp struct {
		ID           string `json:"id"`
		Type         string `json:"type"`
		Role         string `json:"role"`
		Content      []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Model       string `json:"model"`
		StopReason  string `json:"stop_reason"`
		StopSequence interface{} `json:"stop_sequence"`
		Usage       struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(responseBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("failed to parse Anthropic response: %w", err)
	}

	// 转换为统一的ProxyResponse格式
	var content string
	if len(anthropicResp.Content) > 0 {
		content = anthropicResp.Content[0].Text
	}

	// 转换结束原因
	var finishReason string
	switch anthropicResp.StopReason {
	case "end_turn":
		finishReason = "stop"
	case "max_tokens":
		finishReason = "length"
	case "stop_sequence":
		finishReason = "stop"
	default:
		finishReason = "stop"
	}

	proxyResp := &types.ProxyResponse{
		ID:      anthropicResp.ID,
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   anthropicResp.Model,
		Choices: []types.ResponseChoice{
			{
				Index: 0,
				Message: types.Message{
					Role:    "assistant",
					Content: content,
				},
				FinishReason: finishReason,
			},
		},
		Usage: types.ResponseUsage{
			PromptTokens:     anthropicResp.Usage.InputTokens,
			CompletionTokens: anthropicResp.Usage.OutputTokens,
			TotalTokens:      anthropicResp.Usage.InputTokens + anthropicResp.Usage.OutputTokens,
		},
	}

	return proxyResp, nil
}

// parseOpenAIResponse 解析OpenAI API响应
func (h *ProxyHandler) parseOpenAIResponse(responseBody []byte) (*types.ProxyResponse, error) {
	var proxyResp types.ProxyResponse
	if err := json.Unmarshal(responseBody, &proxyResp); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}
	return &proxyResp, nil
}

// getProviderBaseURL 获取提供商的基础URL
func (h *ProxyHandler) getProviderBaseURL(provider types.Provider) string {
	switch provider {
	case types.ProviderAnthropic:
		return "https://api.anthropic.com"
	case types.ProviderOpenAI:
		return "https://api.openai.com"
	case types.ProviderGoogle:
		return "https://generativelanguage.googleapis.com"
	case types.ProviderAzure:
		return "https://your-resource.openai.azure.com" // 需要配置
	default:
		return "https://api.anthropic.com"
	}
}

// setAuthHeaders 设置认证头部
func (h *ProxyHandler) setAuthHeaders(req *http.Request, account *types.UpstreamAccount) error {
	switch account.Type {
	case types.UpstreamTypeAPIKey:
		switch account.Provider {
		case types.ProviderAnthropic:
			req.Header.Set("x-api-key", account.APIKey)
			req.Header.Set("anthropic-version", "2023-06-01")
		case types.ProviderOpenAI:
			req.Header.Set("Authorization", "Bearer "+account.APIKey)
		default:
			req.Header.Set("Authorization", "Bearer "+account.APIKey)
		}
	case types.UpstreamTypeOAuth:
		if account.AccessToken == "" {
			return fmt.Errorf("OAuth account missing access token")
		}
		req.Header.Set("Authorization", "Bearer "+account.AccessToken)
	default:
		return fmt.Errorf("unsupported upstream auth type: %s", account.Type)
	}
	
	return nil
}

// handleUpstreamError 处理上游错误
func (h *ProxyHandler) handleUpstreamError(w http.ResponseWriter, account *types.UpstreamAccount, err error) {
	// 记录错误到上游账号统计
	go h.router.MarkUpstreamError(account.ID, err)
	
	// 返回错误响应
	h.writeErrorResponse(w, http.StatusBadGateway, "upstream_error", fmt.Sprintf("Upstream API error: %v", err))
}

// recordSuccess 记录成功请求统计
func (h *ProxyHandler) recordSuccess(keyID, upstreamID string, latency time.Duration, tokensUsed int) {
	// 更新Gateway Key统计
	if keyID != "" {
		h.gatewayKeyMgr.UpdateKeyUsage(keyID, true, latency)
	}
	
	// 更新上游账号统计
	h.router.MarkUpstreamSuccess(upstreamID, latency, int64(tokensUsed))
}

// writeErrorResponse 写入错误响应
func (h *ProxyHandler) writeErrorResponse(w http.ResponseWriter, statusCode int, errorType, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	errorResp := map[string]interface{}{
		"error": map[string]string{
			"type":    errorType,
			"message": message,
		},
		"timestamp": time.Now().Unix(),
	}

	json.NewEncoder(w).Encode(errorResp)
}