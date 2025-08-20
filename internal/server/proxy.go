package server

import (
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
	h.handleProxyRequest(w, r, "/v1/messages") // Anthropic使用/v1/messages端点
}

// HandleCompletions 处理文本完成请求  
func (h *ProxyHandler) HandleCompletions(w http.ResponseWriter, r *http.Request) {
	h.handleProxyRequest(w, r, "/v1/complete")
}

// handleProxyRequest 处理代理请求的核心逻辑
func (h *ProxyHandler) handleProxyRequest(w http.ResponseWriter, r *http.Request, upstreamPath string) {
	startTime := time.Now()
	
	// 1. 读取请求体
	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, "invalid_request_body", "Failed to read request body")
		return
	}
	defer r.Body.Close()

	// 2. 检测请求格式
	requestFormat := h.transformer.DetectFormat(requestBody)
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

	// 8. 调用上游API
	response, err := h.callUpstreamAPI(upstreamAccount, proxyReq, upstreamPath)
	if err != nil {
		h.handleUpstreamError(w, upstreamAccount, err)
		return
	}

	// 9. 转换响应格式
	responseBytes, err := h.transformer.TransformResponse(response, requestFormat)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, "response_transform_error", fmt.Sprintf("Failed to transform response: %v", err))
		return
	}

	// 10. 记录成功统计
	duration := time.Since(startTime)
	go h.recordSuccess(keyID, upstreamAccount.ID, duration, response.Usage.TotalTokens)

	// 11. 返回响应
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(responseBytes)
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

	// 5. 解析响应
	var proxyResponse types.ProxyResponse
	if err := json.Unmarshal(responseBody, &proxyResponse); err != nil {
		return nil, fmt.Errorf("failed to parse upstream response: %w", err)
	}

	return &proxyResponse, nil
}

// buildUpstreamRequest 构建上游请求
func (h *ProxyHandler) buildUpstreamRequest(account *types.UpstreamAccount, request *types.ProxyRequest, path string) (*http.Request, error) {
	// 1. 序列化请求体
	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
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