package server

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
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
	"github.com/iBreaker/llm-gateway/pkg/debug"
	"github.com/iBreaker/llm-gateway/pkg/logger"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// ProxyHandler 代理处理器
type ProxyHandler struct {
	gatewayKeyMgr     *client.GatewayKeyManager
	upstreamMgr       *upstream.UpstreamManager
	router            *router.RequestRouter
	converter         *converter.Manager
	httpClient        *http.Client
	modelRouteConfig  *types.ModelRouteConfig
}

// httpStreamWriter HTTP流式写入器
type httpStreamWriter struct {
	writer      http.ResponseWriter
	flusher     http.Flusher
	totalTokens *int
	trace       *debug.RequestTrace
}

// WriteChunk 写入数据块
func (w *httpStreamWriter) WriteChunk(chunk *converter.StreamChunk) error {
	chunkStart := time.Now()
	var rawData []byte
	var convertedData []byte

	if chunk.IsDone {
		rawData = []byte("[DONE]")
		_, _ = fmt.Fprintf(w.writer, "data: [DONE]\n\n")
		convertedData = []byte("data: [DONE]\n\n")

		// 记录流式响应结束
		if w.trace != nil {
			w.trace.AddStreamChunk("done", rawData, convertedData, time.Since(chunkStart))
		}
	} else {
		data, err := json.Marshal(chunk.Data)
		if err != nil {
			return err
		}
		rawData = data

		if chunk.EventType != "" {
			convertedData = []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", chunk.EventType, string(data)))
			_, _ = fmt.Fprintf(w.writer, "event: %s\ndata: %s\n\n", chunk.EventType, string(data))
		} else {
			convertedData = []byte(fmt.Sprintf("data: %s\n\n", string(data)))
			_, _ = fmt.Fprintf(w.writer, "data: %s\n\n", string(data))
		}

		// 记录流式响应块
		if w.trace != nil {
			eventType := chunk.EventType
			if eventType == "" {
				eventType = "chunk"
			}
			w.trace.AddStreamChunk(eventType, rawData, convertedData, time.Since(chunkStart))
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
	modelRouteConfig *types.ModelRouteConfig,
) *ProxyHandler {
	// 验证模型路由配置
	if modelRouteConfig != nil {
		if err := modelRouteConfig.Validate(); err != nil {
			logger.Warn("模型路由配置验证失败，将禁用模型路由功能: %v", err)
			modelRouteConfig = nil
		} else {
			logger.Info("模型路由配置验证成功，共 %d 条路由规则", len(modelRouteConfig.Routes))
		}
	}
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
		gatewayKeyMgr:    gatewayKeyMgr,
		upstreamMgr:      upstreamMgr,
		router:           router,
		converter:        converter,
		modelRouteConfig: modelRouteConfig,
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
	h.handleProxyRequest(w, r, "/v1/chat/completions")
}

// HandleCompletions 处理文本完成请求
func (h *ProxyHandler) HandleCompletions(w http.ResponseWriter, r *http.Request) {
	h.handleProxyRequest(w, r, "/v1/completions")
}

// HandleMessages 处理Anthropic原生消息端点
func (h *ProxyHandler) HandleMessages(w http.ResponseWriter, r *http.Request) {
	h.handleProxyRequest(w, r, "/v1/messages")
}

// generateRequestID 生成请求ID
func (h *ProxyHandler) generateRequestID() string {
	bytes := make([]byte, 8)
	_, _ = rand.Read(bytes) // crypto/rand.Read never fails
	return hex.EncodeToString(bytes)
}

// handleProxyRequest 处理代理请求的核心逻辑
func (h *ProxyHandler) handleProxyRequest(w http.ResponseWriter, r *http.Request, clientEndpoint string) {
	startTime := time.Now()

	// 生成请求ID
	requestID := h.generateRequestID()

	// 初始化调试跟踪
	trace := debug.NewRequestTrace(requestID)

	// 1. 读取请求体
	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		if trace != nil {
			trace.SetError(err, "read_request_body")
			trace.SaveAsync()
		}
		h.writeErrorResponse(w, http.StatusBadRequest, "invalid_request_body", "Failed to read request body")
		return
	}
	defer func() { _ = r.Body.Close() }()

	// 记录原始客户端请求
	if trace != nil {
		trace.SetClientRequest(requestBody)
	}

	// 2. 先进行初步解析以获取模型信息用于模型路由决策
	tempReq, requestFormat, err := h.converter.ParseRequest(requestBody, clientEndpoint)
	if err != nil || !requestFormat.IsValid() {
		if trace != nil {
			trace.SetError(err, "parse_request")
			trace.SaveAsync()
		}
		h.writeErrorResponse(w, http.StatusBadRequest, "request_parse_error", fmt.Sprintf("Failed to parse request: %v", err))
		return
	}

	// 3. 模型路由处理（根据配置）
	var modelRouteContext *types.ModelRouteContext
	if h.modelRouteConfig != nil {
		modelRouteContext = h.modelRouteConfig.CreateContext(tempReq.Model)
	}

	// 4. 重新解析请求并应用模型路由
	proxyReq, _, err := h.converter.ParseRequestWithModelRoute(requestBody, clientEndpoint, modelRouteContext)
	if err != nil {
		if trace != nil {
			trace.SetError(err, "parse_request_with_route")
			trace.SaveAsync()
		}
		h.writeErrorResponse(w, http.StatusBadRequest, "request_parse_error", fmt.Sprintf("Failed to parse request with model route: %v", err))
		return
	}

	// 5. 设置请求上下文信息
	keyID := r.Header.Get("X-Gateway-Key-ID")
	proxyReq.GatewayKeyID = keyID

	// 记录模型路由后的请求
	if trace != nil {
		trace.SetProxyRequest(proxyReq)
	}

	// 6. 确定目标提供商（根据模型路由上下文或模型名称）
	var targetProvider types.Provider
	if modelRouteContext != nil && modelRouteContext.Enabled {
		targetProvider = modelRouteContext.TargetProvider
	} else {
		targetProvider = h.router.DetermineProvider(proxyReq.Model)
	}

	// 5.1. 通过 converter 获取上游路径
	upstreamPath, err := h.converter.GetUpstreamPath(targetProvider, clientEndpoint)
	if err != nil {
		if trace != nil {
			trace.SetError(err, "get_upstream_path")
			trace.SaveAsync()
		}
		h.writeErrorResponse(w, http.StatusInternalServerError, "upstream_path_error", fmt.Sprintf("Failed to get upstream path: %v", err))
		return
	}

	// 6. 选择上游账号
	upstreamAccount, err := h.router.SelectUpstream(targetProvider)
	if err != nil {
		if trace != nil {
			trace.SetError(err, "select_upstream")
			trace.SaveAsync()
		}
		h.writeErrorResponse(w, http.StatusServiceUnavailable, "no_upstream_available", fmt.Sprintf("No available upstream for provider %s: %v", targetProvider, err))
		return
	}
	proxyReq.UpstreamID = upstreamAccount.ID

	// 记录上下文信息
	if trace != nil {
		trace.SetContextInfo(targetProvider, clientEndpoint, upstreamPath, string(requestFormat), string(requestFormat))
	}

	// 7. 根据上游账号类型注入特殊处理
	h.converter.InjectSystemPrompt(proxyReq, upstreamAccount.Provider, upstreamAccount.Type)

	// 8. 根据stream参数选择处理方式
	if proxyReq.Stream != nil && *proxyReq.Stream {
		// 流式响应处理
		h.handleStreamResponse(w, upstreamAccount, proxyReq, upstreamPath, requestFormat, keyID, startTime, trace, modelRouteContext)
	} else {
		// 非流式响应处理
		h.handleNonStreamResponse(w, upstreamAccount, proxyReq, upstreamPath, requestFormat, keyID, startTime, trace)
	}
}

// handleNonStreamResponse 处理非流式响应
func (h *ProxyHandler) handleNonStreamResponse(w http.ResponseWriter, account *types.UpstreamAccount, request *types.ProxyRequest, upstreamPath string, requestFormat converter.Format, keyID string, startTime time.Time, trace *debug.RequestTrace) {
	conversionStart := time.Now()

	// 调用上游API获取原始响应
	upstreamStart := time.Now()
	responseBytes, err := h.callUpstreamAPIRaw(account, request, upstreamPath, trace)
	upstreamDuration := time.Since(upstreamStart)

	if err != nil {
		if trace != nil {
			trace.SetError(err, "upstream_api_call")
			trace.SetDurations(time.Since(startTime), upstreamDuration, 0)
			trace.SaveAsync()
		}
		h.handleUpstreamError(w, account, err)
		return
	}

	// 使用Manager统一处理响应转换
	var upstreamFormat converter.Format
	switch account.Provider {
	case types.ProviderAnthropic:
		upstreamFormat = converter.FormatAnthropic
	case types.ProviderOpenAI, types.ProviderQwen:
		upstreamFormat = converter.FormatOpenAI
	default:
		upstreamFormat = converter.FormatOpenAI
	}

	transformedBytes, err := h.converter.ConvertResponse(upstreamFormat, requestFormat, responseBytes)
	conversionDuration := time.Since(conversionStart)

	if err != nil {
		if trace != nil {
			trace.SetError(err, "response_conversion")
			trace.SetDurations(time.Since(startTime), upstreamDuration, conversionDuration)
			trace.SaveAsync()
		}
		h.writeErrorResponse(w, http.StatusInternalServerError, "response_transform_error", fmt.Sprintf("Failed to transform response: %v", err))
		return
	}

	// 记录转换后的客户端响应
	if trace != nil {
		trace.SetClientResponse(transformedBytes)
		trace.SetDurations(time.Since(startTime), upstreamDuration, conversionDuration)
		trace.SaveAsync()
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
func (h *ProxyHandler) handleStreamResponse(w http.ResponseWriter, account *types.UpstreamAccount, request *types.ProxyRequest, upstreamPath string, requestFormat converter.Format, keyID string, startTime time.Time, trace *debug.RequestTrace, modelRouteContext *types.ModelRouteContext) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// 获取Flusher确保实时推送
	flusher, ok := w.(http.Flusher)
	if !ok {
		if trace != nil {
			trace.SetError(fmt.Errorf("streaming not supported"), "stream_setup")
			trace.SaveAsync()
		}
		h.writeErrorResponse(w, http.StatusInternalServerError, "stream_not_supported", "Streaming not supported")
		return
	}

	// 调用上游流式API
	err := h.callUpstreamStreamAPI(w, flusher, account, request, upstreamPath, requestFormat, keyID, startTime, trace, modelRouteContext)
	if err != nil {
		if trace != nil {
			trace.SetError(err, "stream_processing")
			trace.SaveAsync()
		}
		// 流式响应中的错误处理
		h.writeStreamError(w, flusher, err)
		return
	}
}

// callUpstreamStreamAPI 调用上游流式API
func (h *ProxyHandler) callUpstreamStreamAPI(w http.ResponseWriter, flusher http.Flusher, account *types.UpstreamAccount, request *types.ProxyRequest, path string, requestFormat converter.Format, keyID string, startTime time.Time, trace *debug.RequestTrace, modelRouteContext *types.ModelRouteContext) error {
	logger.Debug("开始流式请求，上游ID: %s, Provider: %s", account.ID, account.Provider)

	// 构建上游请求
	upstreamReq, err := h.buildUpstreamRequest(account, request, path, trace)
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
	return h.processStreamResponse(w, flusher, resp.Body, account.Provider, requestFormat, keyID, account.ID, startTime, trace, modelRouteContext)
}

// processStreamResponse 处理流式响应
func (h *ProxyHandler) processStreamResponse(w http.ResponseWriter, flusher http.Flusher, responseBody io.Reader, provider types.Provider, requestFormat converter.Format, keyID, upstreamID string, startTime time.Time, trace *debug.RequestTrace, modelRouteContext *types.ModelRouteContext) error {
	var totalTokens int
	logger.Debug("开始处理流式响应，Provider: %s, RequestFormat: %v", provider, requestFormat)

	// 使用新的Manager处理流式响应

	// 创建流写入器
	writer := &httpStreamWriter{
		writer:      w,
		flusher:     flusher,
		totalTokens: &totalTokens,
		trace:       trace,
	}

	err := h.converter.ProcessStreamWithModelRoute(responseBody, provider, requestFormat, writer, modelRouteContext)

	if err != nil {
		logger.Debug("流式处理出现错误: %v", err)
		if trace != nil {
			trace.SetError(err, "stream_processing")
		}
	} else {
		logger.Debug("流式处理完成，总tokens: %d", totalTokens)
	}

	// 记录成功统计和调试信息
	duration := time.Since(startTime)
	if trace != nil {
		trace.SetDurations(duration, 0, 0)
		trace.SaveAsync()
	}
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

// callUpstreamAPIRaw 调用上游API并返回原始响应字节
func (h *ProxyHandler) callUpstreamAPIRaw(account *types.UpstreamAccount, request *types.ProxyRequest, path string, trace *debug.RequestTrace) ([]byte, error) {
	// 1. 构建上游请求
	upstreamReq, err := h.buildUpstreamRequest(account, request, path, trace)
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

	// 记录原始上游响应
	if trace != nil {
		trace.SetUpstreamResponse(responseBody)
	}

	// 4. 检查HTTP状态码
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream API error: status=%d, body=%s", resp.StatusCode, string(responseBody))
	}

	return responseBody, nil
}

// buildUpstreamRequest 构建上游请求
func (h *ProxyHandler) buildUpstreamRequest(account *types.UpstreamAccount, request *types.ProxyRequest, path string, trace *debug.RequestTrace) (*http.Request, error) {
	// 1. 根据上游提供商转换请求格式
	requestBody, err := h.converter.BuildUpstreamRequest(request, account.Provider)

	if err != nil {
		return nil, fmt.Errorf("failed to transform request for upstream: %w", err)
	}

	// 记录转换后的上游请求
	if trace != nil {
		trace.SetUpstreamRequest(requestBody)
	}

	// 2. 构建URL
	baseURL := h.upstreamMgr.GetBaseURL(account)
	url := baseURL + path

	// 3. 创建HTTP请求
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// 4. 设置通用头部
	req.Header.Set("Content-Type", "application/json")

	// 对Anthropic使用Claude Code User-Agent，其他提供商使用通用User-Agent
	if account.Provider == types.ProviderAnthropic {
		req.Header.Set("User-Agent", "claude-cli/1.0.56 (external, cli)")
	} else {
		req.Header.Set("User-Agent", "LLM-Gateway/1.0")
	}

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
