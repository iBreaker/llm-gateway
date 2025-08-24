package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/converter"
	"github.com/iBreaker/llm-gateway/internal/router"
	"github.com/iBreaker/llm-gateway/internal/upstream"
	"github.com/iBreaker/llm-gateway/pkg/logger"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// ProxyHandler 代理处理器
type ProxyHandler struct {
	gatewayKeyMgr *client.GatewayKeyManager
	upstreamMgr   *upstream.UpstreamManager
	router        *router.RequestRouter
	converter     *converter.Manager
	httpClient    *http.Client
}

// httpStreamWriter HTTP流式写入器
type httpStreamWriter struct {
	writer      http.ResponseWriter
	flusher     http.Flusher
	totalTokens *int
}

// WriteChunk 写入数据块
func (w *httpStreamWriter) WriteChunk(chunk *converter.StreamChunk) error {
	if chunk.IsDone {
		_, _ = fmt.Fprintf(w.writer, "data: [DONE]\n\n")
	} else {
		data, err := json.Marshal(chunk.Data)
		if err != nil {
			return err
		}
		
		if chunk.EventType != "" {
			_, _ = fmt.Fprintf(w.writer, "event: %s\ndata: %s\n\n", chunk.EventType, string(data))
		} else {
			_, _ = fmt.Fprintf(w.writer, "data: %s\n\n", string(data))
		}
	}
	
	w.flusher.Flush()
	*w.totalTokens += chunk.Tokens
	return nil
}

// WriteDone 写入完成信号
func (w *httpStreamWriter) WriteDone() error {
	_, _ = fmt.Fprintf(w.writer, "data: [DONE]\n\n")
	w.flusher.Flush()
	return nil
}

// NewProxyHandler 创建代理处理器
func NewProxyHandler(
	gatewayKeyMgr *client.GatewayKeyManager,
	upstreamMgr *upstream.UpstreamManager,
	router *router.RequestRouter,
	converter *converter.Manager,
	proxyConfig *types.ProxyConfig,
) *ProxyHandler {
	// 设置超时配置，使用传入的配置或默认值
	streamTimeout := 5 * time.Minute // 默认5分钟
	if proxyConfig != nil && proxyConfig.StreamTimeout > 0 {
		streamTimeout = time.Duration(proxyConfig.StreamTimeout) * time.Second
	}

	idleTimeout := 90 * time.Second // 默认90秒
	if proxyConfig != nil && proxyConfig.IdleConnTimeout > 0 {
		idleTimeout = time.Duration(proxyConfig.IdleConnTimeout) * time.Second
	}

	tlsTimeout := 10 * time.Second // 默认10秒
	if proxyConfig != nil && proxyConfig.TLSTimeout > 0 {
		tlsTimeout = time.Duration(proxyConfig.TLSTimeout) * time.Second
	}

	responseTimeout := 30 * time.Second // 默认30秒
	if proxyConfig != nil && proxyConfig.ResponseTimeout > 0 {
		responseTimeout = time.Duration(proxyConfig.ResponseTimeout) * time.Second
	}

	return &ProxyHandler{
		gatewayKeyMgr: gatewayKeyMgr,
		upstreamMgr:   upstreamMgr,
		router:        router,
		converter:     converter,
		httpClient: &http.Client{
			Timeout: streamTimeout,
			Transport: &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				IdleConnTimeout:       idleTimeout,
				TLSHandshakeTimeout:   tlsTimeout,
				ResponseHeaderTimeout: responseTimeout,
			},
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
	defer func() { _ = r.Body.Close() }()

	// 2. 解析请求（自动检测格式）
	proxyReq, requestFormat, err := h.converter.ParseRequest(requestBody, clientEndpoint)
	if err != nil || !requestFormat.IsValid() {
		h.writeErrorResponse(w, http.StatusBadRequest, "request_parse_error", fmt.Sprintf("Failed to parse request: %v", err))
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
	h.converter.InjectSystemPrompt(proxyReq, upstreamAccount.Provider, upstreamAccount.Type)

	// 8. 根据stream参数选择处理方式
	if proxyReq.Stream != nil && *proxyReq.Stream {
		// 流式响应处理
		h.handleStreamResponse(w, upstreamAccount, proxyReq, upstreamPath, requestFormat, keyID, startTime)
	} else {
		// 非流式响应处理
		h.handleNonStreamResponse(w, upstreamAccount, proxyReq, upstreamPath, requestFormat, keyID, startTime)
	}
}

// handleNonStreamResponse 处理非流式响应
func (h *ProxyHandler) handleNonStreamResponse(w http.ResponseWriter, account *types.UpstreamAccount, request *types.ProxyRequest, upstreamPath string, requestFormat converter.Format, keyID string, startTime time.Time) {
	// 调用上游API获取原始响应
	responseBytes, err := h.callUpstreamAPIRaw(account, request, upstreamPath)
	if err != nil {
		h.handleUpstreamError(w, account, err)
		return
	}

	// 使用Manager统一处理响应转换
	var upstreamFormat converter.Format
	switch account.Provider {
	case types.ProviderAnthropic:
		upstreamFormat = converter.FormatAnthropic
	case types.ProviderOpenAI:
		upstreamFormat = converter.FormatOpenAI
	default:
		upstreamFormat = converter.FormatOpenAI
	}
	
	transformedBytes, err := h.converter.ConvertResponse(upstreamFormat, requestFormat, responseBytes)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, "response_transform_error", fmt.Sprintf("Failed to transform response: %v", err))
		return
	}

	// 记录成功统计
	duration := time.Since(startTime)
	// TODO: 从transformedBytes中提取token使用信息
	go h.recordSuccess(keyID, account.ID, duration, 0)

	// 返回响应
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(transformedBytes)
}

// handleStreamResponse 处理流式响应
func (h *ProxyHandler) handleStreamResponse(w http.ResponseWriter, account *types.UpstreamAccount, request *types.ProxyRequest, upstreamPath string, requestFormat converter.Format, keyID string, startTime time.Time) {
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
func (h *ProxyHandler) callUpstreamStreamAPI(w http.ResponseWriter, flusher http.Flusher, account *types.UpstreamAccount, request *types.ProxyRequest, path string, requestFormat converter.Format, keyID string, startTime time.Time) error {
	logger.Debug("开始流式请求，上游ID: %s, Provider: %s", account.ID, account.Provider)

	// 构建上游请求
	upstreamReq, err := h.buildUpstreamRequest(account, request, path)
	if err != nil {
		logger.Debug("构建上游请求失败: %v", err)
		return fmt.Errorf("failed to build upstream request: %w", err)
	}

	logger.Debug("发送流式请求到: %s", upstreamReq.URL.String())

	// 发送流式请求
	resp, err := h.httpClient.Do(upstreamReq)
	if err != nil {
		logger.Debug("上游请求失败: %v", err)
		return fmt.Errorf("upstream request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	logger.Debug("收到上游响应，状态码: %d", resp.StatusCode)

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		logger.Debug("上游API返回错误状态码: %d", resp.StatusCode)
		return fmt.Errorf("upstream API error: status=%d", resp.StatusCode)
	}

	// 验证Content-Type是否为流式响应
	contentType := resp.Header.Get("Content-Type")
	logger.Debug("响应Content-Type: %s", contentType)
	if !strings.HasPrefix(contentType, "text/event-stream") {
		logger.Debug("非流式响应Content-Type: %s", contentType)
		return fmt.Errorf("unexpected content type: %s", contentType)
	}

	// 不需要显式调用WriteHeader，让Go在第一次写入时自动发送200状态码
	// 这样可以避免与中间件包装器的WriteHeader冲突
	flusher.Flush()

	logger.Debug("开始处理流式响应")
	// 开始处理流式响应
	return h.processStreamResponse(w, flusher, resp.Body, account.Provider, requestFormat, keyID, account.ID, startTime)
}

// processStreamResponse 处理流式响应
func (h *ProxyHandler) processStreamResponse(w http.ResponseWriter, flusher http.Flusher, responseBody io.Reader, provider types.Provider, requestFormat converter.Format, keyID, upstreamID string, startTime time.Time) error {
	var totalTokens int
	logger.Debug("开始处理流式响应，Provider: %s, RequestFormat: %v", provider, requestFormat)

	// 使用新的Manager处理流式响应

	// 创建流写入器
	writer := &httpStreamWriter{
		writer:      w,
		flusher:     flusher,
		totalTokens: &totalTokens,
	}

	err := h.converter.ProcessStream(responseBody, provider, requestFormat, writer)

	if err != nil {
		logger.Debug("流式处理出现错误: %v", err)
	} else {
		logger.Debug("流式处理完成，总tokens: %d", totalTokens)
	}

	// 记录成功统计
	duration := time.Since(startTime)
	go h.recordSuccess(keyID, upstreamID, duration, totalTokens)

	return err
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
	_, _ = fmt.Fprintf(w, "data: %s\n\n", string(errorBytes))
	flusher.Flush()
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

// callUpstreamAPIRaw 调用上游API并返回原始响应字节
func (h *ProxyHandler) callUpstreamAPIRaw(account *types.UpstreamAccount, request *types.ProxyRequest, path string) ([]byte, error) {
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
	defer func() { _ = resp.Body.Close() }()

	// 3. 读取响应
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read upstream response: %w", err)
	}

	// 4. 检查HTTP状态码
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream API error: status=%d, body=%s", resp.StatusCode, string(responseBody))
	}

	return responseBody, nil
}

// buildUpstreamRequest 构建上游请求
func (h *ProxyHandler) buildUpstreamRequest(account *types.UpstreamAccount, request *types.ProxyRequest, path string) (*http.Request, error) {
	// 1. 根据上游提供商转换请求格式
	requestBody, err := h.converter.BuildUpstreamRequest(request, account.Provider)

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

	// 5. 设置认证头部 - 调用Upstream模块处理
	authHeaders, err := h.upstreamMgr.GetAuthHeaders(account.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get auth headers: %w", err)
	}

	for key, value := range authHeaders {
		req.Header.Set(key, value)
	}

	return req, nil
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
		_ = h.gatewayKeyMgr.UpdateKeyUsage(keyID, true, latency)
	}

	// 更新上游账号统计
	h.router.MarkUpstreamSuccess(upstreamID, latency, int64(tokensUsed))
}

// writeErrorResponse 写入错误响应
func (h *ProxyHandler) writeErrorResponse(w http.ResponseWriter, statusCode int, errorType, message string) {
	// 记录错误日志到控制台
	log.Printf("[ERROR] HTTP %d - %s: %s", statusCode, errorType, message)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	errorResp := map[string]interface{}{
		"error": map[string]string{
			"type":    errorType,
			"message": message,
		},
		"timestamp": time.Now().Unix(),
	}

	_ = json.NewEncoder(w).Encode(errorResp)
}
