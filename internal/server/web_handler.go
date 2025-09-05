package server

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/config"
	"github.com/iBreaker/llm-gateway/internal/upstream"
	"github.com/iBreaker/llm-gateway/pkg/logger"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// WebHandler 处理 Web 管理界面的请求
type WebHandler struct {
	configMgr   *config.ConfigManager
	upstreamMgr *upstream.UpstreamManager
	keyMgr      *client.GatewayKeyManager
	oauthMgr    *upstream.OAuthManager
	sessions    map[string]*Session // 简单的内存session存储
}

// Session 会话信息
type Session struct {
	Token     string
	ExpiresAt time.Time
	CreatedAt time.Time
}

// NewWebHandler 创建 Web 处理器
func NewWebHandler(configMgr *config.ConfigManager, upstreamMgr *upstream.UpstreamManager, keyMgr *client.GatewayKeyManager, oauthMgr *upstream.OAuthManager) *WebHandler {
	return &WebHandler{
		configMgr:   configMgr,
		upstreamMgr: upstreamMgr,
		keyMgr:      keyMgr,
		oauthMgr:    oauthMgr,
		sessions:    make(map[string]*Session),
	}
}

// ServeStatic 处理静态文件请求
func (h *WebHandler) ServeStatic(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	
	// 根路径根据认证状态返回不同页面
	if path == "" || path == "/" {
		if h.isAuthenticated(r) {
			path = "/static/html/index.html"  // 已认证用户看到管理页面
		} else {
			path = "/static/html/login.html"  // 未认证用户看到登录页面
		}
	}
	
	// 安全检查：只允许访问 /static/ 路径下的文件
	if !strings.HasPrefix(path, "/static/") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	
	// 构建文件路径并进行安全清理
	cleanPath := filepath.Clean(path)
	if !strings.HasPrefix(cleanPath, "/static/") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	
	// 只允许特定文件扩展名
	ext := filepath.Ext(cleanPath)
	switch ext {
	case ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg":
		// 允许的文件类型
	default:
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	
	// 构建完整文件路径
	filePath := filepath.Join("web", cleanPath)
	
	// 确保最终路径仍在web目录内（防止路径穿越）
	absWebPath, err := filepath.Abs("web")
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	absFilePath, err := filepath.Abs(filePath)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if !strings.HasPrefix(absFilePath, absWebPath) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	
	// 设置Content-Type
	switch ext {
	case ".css":
		w.Header().Set("Content-Type", "text/css")
	case ".js":
		w.Header().Set("Content-Type", "application/javascript")
	case ".html":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case ".png":
		w.Header().Set("Content-Type", "image/png")
	case ".jpg", ".jpeg":
		w.Header().Set("Content-Type", "image/jpeg")
	case ".gif":
		w.Header().Set("Content-Type", "image/gif")
	case ".svg":
		w.Header().Set("Content-Type", "image/svg+xml")
	case ".ico":
		w.Header().Set("Content-Type", "image/x-icon")
	}
	
	// 设置安全头
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("X-XSS-Protection", "1; mode=block")
	
	http.ServeFile(w, r, filePath)
}

// API Health Check
func (h *WebHandler) HandleAPIHealth(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().Unix(),
		"service":   "llm-gateway",
	}
	h.writeJSON(w, http.StatusOK, response)
}

// API Get Configuration
func (h *WebHandler) HandleAPIConfig(w http.ResponseWriter, r *http.Request) {
	config := h.configMgr.Get()
	if config == nil {
		h.writeError(w, http.StatusInternalServerError, "Configuration not loaded")
		return
	}
	
	// 返回配置（隐藏敏感信息）
	safeConfig := map[string]interface{}{
		"server": config.Server,
		"proxy":  config.Proxy,
		"logging": config.Logging,
		"environment": map[string]interface{}{
			"http_proxy":  config.Environment.HTTPProxy,
			"https_proxy": config.Environment.HTTPSProxy,
			"no_proxy":    config.Environment.NoProxy,
		},
	}
	
	h.writeJSON(w, http.StatusOK, safeConfig)
}

// API List Upstream Accounts
func (h *WebHandler) HandleAPIUpstream(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleListUpstream(w, r)
	case http.MethodPost:
		h.handleCreateUpstream(w, r)
	default:
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *WebHandler) handleListUpstream(w http.ResponseWriter, r *http.Request) {
	accounts := h.configMgr.ListUpstreamAccounts()
	
	// 计算统计信息
	stats := map[string]interface{}{
		"total":   len(accounts),
		"active":  0,
		"healthy": 0,
		"by_provider": map[string]int{},
		"by_type": map[string]int{},
	}
	
	// 转换为安全的响应格式（隐藏敏感信息）
	safeAccounts := make([]map[string]interface{}, len(accounts))
	for i, account := range accounts {
		// 统计计算
		if account.Status == "active" {
			stats["active"] = stats["active"].(int) + 1
		}
		if account.HealthStatus == "healthy" {
			stats["healthy"] = stats["healthy"].(int) + 1
		}
		
		// 按提供商统计
		providerCounts := stats["by_provider"].(map[string]int)
		providerCounts[string(account.Provider)]++
		
		// 按类型统计
		typeCounts := stats["by_type"].(map[string]int)
		typeCounts[string(account.Type)]++
		
		safeAccounts[i] = map[string]interface{}{
			"id":            account.ID,
			"name":          account.Name,
			"provider":      account.Provider,
			"type":          account.Type,
			"status":        account.Status,
			"health_status": account.HealthStatus,
			"created_at":    account.CreatedAt,
			"usage":         account.Usage, // 包含使用统计
		}
	}
	
	response := map[string]interface{}{
		"data":  safeAccounts,
		"stats": stats,
	}
	
	h.writeJSON(w, http.StatusOK, response)
}

func (h *WebHandler) handleCreateUpstream(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Provider string `json:"provider"`
		Type     string `json:"type"`
		APIKey   string `json:"api_key,omitempty"`
		BaseURL  string `json:"base_url,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	
	// 验证必需字段
	if req.Name == "" || req.Provider == "" || req.Type == "" {
		h.writeError(w, http.StatusBadRequest, "Missing required fields")
		return
	}
	
	// 创建上游账号
	account := &types.UpstreamAccount{
		ID:            h.generateID("upstream"),
		Name:          req.Name,
		Provider:      types.Provider(req.Provider),
		Type:          types.UpstreamType(req.Type),
		Status:        "active",
		HealthStatus:  "unknown",
		CreatedAt:     time.Now(),
	}
	
	// Set base URL if provided
	if req.BaseURL != "" {
		account.ResourceURL = req.BaseURL
	}
	
	if req.Type == "api-key" {
		if req.APIKey == "" {
			h.writeError(w, http.StatusBadRequest, "API key is required for api-key type")
			return
		}
		account.APIKey = req.APIKey
	} else if req.Type == "oauth" {
		// Validate OAuth provider support
		if req.Provider != "anthropic" && req.Provider != "qwen" {
			h.writeError(w, http.StatusBadRequest, "OAuth is only supported for anthropic and qwen providers")
			return
		}
		// OAuth uses predefined client credentials, no additional setup needed
		logger.Info("Creating OAuth account for provider: %s", req.Provider)
	}
	
	// 通过UpstreamManager添加账号（包含业务逻辑初始化）
	if err := h.upstreamMgr.AddAccount(account); err != nil {
		logger.Error("Failed to create upstream account: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to create upstream account")
		return
	}
	
	logger.Info("Created upstream account: %s (%s)", account.Name, account.ID)
	h.writeJSON(w, http.StatusCreated, map[string]string{"id": account.ID})
}

// API Delete Upstream Account
func (h *WebHandler) HandleAPIUpstreamDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	// 从URL路径中提取ID
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		h.writeError(w, http.StatusBadRequest, "Invalid upstream ID")
		return
	}
	
	upstreamID := pathParts[3] // /api/v1/upstream/{id}
	
	if err := h.configMgr.DeleteUpstreamAccount(upstreamID); err != nil {
		logger.Error("Failed to delete upstream account %s: %v", upstreamID, err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete upstream account")
		return
	}
	
	logger.Info("Deleted upstream account: %s", upstreamID)
	w.WriteHeader(http.StatusNoContent)
}

// API List API Keys
func (h *WebHandler) HandleAPIKeys(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleListAPIKeys(w, r)
	case http.MethodPost:
		h.handleCreateAPIKey(w, r)
	default:
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *WebHandler) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	keys := h.configMgr.ListGatewayKeys()
	
	// 计算统计信息
	stats := map[string]interface{}{
		"total":          len(keys),
		"active":         0,
		"total_requests": 0,
		"by_permissions": map[string]int{},
		"recent_usage":   0,
	}
	
	// 转换为安全的响应格式（隐藏密钥值）
	safeKeys := make([]map[string]interface{}, len(keys))
	for i, key := range keys {
		// 统计计算
		if key.Status == "active" {
			stats["active"] = stats["active"].(int) + 1
		}
		
		if key.Usage != nil {
			stats["total_requests"] = stats["total_requests"].(int) + int(key.Usage.TotalRequests)
			
			// 计算最近使用（24小时内）
			if key.Usage.LastUsedAt.After(time.Now().Add(-24 * time.Hour)) {
				stats["recent_usage"] = stats["recent_usage"].(int) + 1
			}
		}
		
		// 按权限统计
		permCounts := stats["by_permissions"].(map[string]int)
		for _, perm := range key.Permissions {
			permCounts[string(perm)]++
		}
		
		safeKeys[i] = map[string]interface{}{
			"id":            key.ID,
			"name":          key.Name,
			"permissions":   key.Permissions,
			"status":        key.Status,
			"created_at":    key.CreatedAt,
			"usage":         key.Usage,
		}
	}
	
	response := map[string]interface{}{
		"data":  safeKeys,
		"stats": stats,
	}
	
	h.writeJSON(w, http.StatusOK, response)
}

func (h *WebHandler) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	
	// 验证必需字段
	if req.Name == "" {
		h.writeError(w, http.StatusBadRequest, "Name is required")
		return
	}
	
	if len(req.Permissions) == 0 {
		req.Permissions = []string{"read", "write"}
	}
	
	// 将字符串权限转换为types.Permission类型
	perms := make([]types.Permission, len(req.Permissions))
	for i, p := range req.Permissions {
		perms[i] = types.Permission(p)
	}
	
	// 生成新的 API 密钥
	key, plainKey, err := h.keyMgr.CreateKey(req.Name, perms)
	if err != nil {
		logger.Error("Failed to generate API key: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to generate API key")
		return
	}
	
	logger.Info("Generated new API key: %s (%s)", key.Name, key.ID)
	h.writeJSON(w, http.StatusCreated, map[string]string{
		"id":  key.ID,
		"key": plainKey, // 只在创建时返回原始密钥
	})
}

// HandleAPIKeyActions handles various API Key related actions
func (h *WebHandler) HandleAPIKeyActions(w http.ResponseWriter, r *http.Request) {
	// 从URL路径中解析操作
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		h.writeError(w, http.StatusBadRequest, "Invalid API key action path")
		return
	}
	
	keyID := pathParts[3] // /api/v1/apikeys/{id}
	
	// 检查是否有子路径
	if len(pathParts) == 4 {
		// /api/v1/apikeys/{id} - Delete API Key
		h.handleAPIKeyDelete(w, r, keyID)
	} else if len(pathParts) == 5 && pathParts[4] == "model-routes" {
		// /api/v1/apikeys/{id}/model-routes - Model Routes operations
		h.handleAPIKeyModelRoutes(w, r, keyID)
	} else {
		h.writeError(w, http.StatusNotFound, "API endpoint not found")
	}
}

func (h *WebHandler) handleAPIKeyDelete(w http.ResponseWriter, r *http.Request, keyID string) {
	if r.Method != http.MethodDelete {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	if err := h.configMgr.DeleteGatewayKey(keyID); err != nil {
		logger.Error("Failed to delete API key %s: %v", keyID, err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete API key")
		return
	}
	
	logger.Info("Deleted API key: %s", keyID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *WebHandler) handleAPIKeyModelRoutes(w http.ResponseWriter, r *http.Request, keyID string) {
	switch r.Method {
	case http.MethodGet:
		h.getAPIKeyModelRoutes(w, r, keyID)
	case http.MethodPut:
		h.updateAPIKeyModelRoutes(w, r, keyID)
	default:
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *WebHandler) getAPIKeyModelRoutes(w http.ResponseWriter, r *http.Request, keyID string) {
	// 获取Gateway Key
	gatewayKey, err := h.configMgr.GetGatewayKey(keyID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "API key not found")
		return
	}
	
	// 返回模型路由配置
	response := map[string]interface{}{
		"key_id":           keyID,
		"key_name":         gatewayKey.Name,
		"routes":           []interface{}{},
		"default_behavior": "passthrough",
		"enable_logging":   true,
	}
	
	if gatewayKey.ModelRoutes != nil {
		response["routes"] = gatewayKey.ModelRoutes.Routes
		response["default_behavior"] = gatewayKey.ModelRoutes.DefaultBehavior
		response["enable_logging"] = gatewayKey.ModelRoutes.EnableLogging
	}
	
	h.writeJSON(w, http.StatusOK, response)
}

func (h *WebHandler) updateAPIKeyModelRoutes(w http.ResponseWriter, r *http.Request, keyID string) {
	// 解析请求体
	var req struct {
		Routes          []types.ModelRoute `json:"routes"`
		DefaultBehavior string            `json:"default_behavior"`
		EnableLogging   bool              `json:"enable_logging"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON format")
		return
	}
	
	// 创建模型路由配置
	modelRoutes := &types.ModelRouteConfig{
		Routes:          req.Routes,
		DefaultBehavior: req.DefaultBehavior,
		EnableLogging:   req.EnableLogging,
	}
	
	// 验证配置
	if err := modelRoutes.Validate(); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid route configuration: "+err.Error())
		return
	}
	
	// 更新Gateway Key的模型路由配置
	err := h.configMgr.UpdateGatewayKey(keyID, func(key *types.GatewayAPIKey) error {
		key.ModelRoutes = modelRoutes
		return nil
	})
	
	if err != nil {
		logger.Error("Failed to update model routes for API key %s: %v", keyID, err)
		h.writeError(w, http.StatusInternalServerError, "Failed to update model routes")
		return
	}
	
	logger.Info("Updated model routes for API key: %s", keyID)
	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Model routes updated successfully",
	})
}

// 辅助方法
func (h *WebHandler) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *WebHandler) writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (h *WebHandler) generateID(prefix string) string {
	timestamp := time.Now().Unix()
	return fmt.Sprintf("%s_%d", prefix, timestamp)
}

// HandleOAuthStart 启动OAuth流程
func (h *WebHandler) HandleOAuthStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		UpstreamID string `json:"upstream_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	if req.UpstreamID == "" {
		h.writeError(w, http.StatusBadRequest, "upstream_id is required")
		return
	}

	// 获取上游账号信息
	account, err := h.configMgr.GetUpstreamAccount(req.UpstreamID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "Upstream account not found")
		return
	}

	// 根据提供商类型启动不同的OAuth流程
	switch account.Provider {
	case "anthropic":
		authURL, err := h.oauthMgr.StartOAuthFlow(req.UpstreamID)
		if err != nil {
			logger.Error("Failed to start Anthropic OAuth: %v", err)
			h.writeError(w, http.StatusInternalServerError, "Failed to start OAuth flow")
			return
		}
		h.writeJSON(w, http.StatusOK, map[string]interface{}{
			"flow_type": "authorization_code",
			"auth_url":  authURL,
			"message":   "Please visit the URL and authorize the application, then return the authorization code.",
		})
	case "qwen":
		result, err := h.upstreamMgr.StartQwenOAuth(req.UpstreamID)
		if err != nil {
			logger.Error("Failed to start Qwen OAuth: %v", err)
			h.writeError(w, http.StatusInternalServerError, "Failed to start OAuth flow")
			return
		}
		// 构造完整的授权链接，包含user_code参数
		fullVerificationURI := fmt.Sprintf("https://chat.qwen.ai/authorize?user_code=%s&client=llm-gateway", result.UserCode)
		
		h.writeJSON(w, http.StatusOK, map[string]interface{}{
			"flow_type":         "device_code",
			"device_code":       result.DeviceCode,
			"user_code":         result.UserCode,
			"verification_uri":  fullVerificationURI,
			"expires_in":        result.ExpiresIn,
			"interval":          result.Interval,
			"message":           fmt.Sprintf("Please visit %s to authorize", fullVerificationURI),
		})
	default:
		h.writeError(w, http.StatusBadRequest, "OAuth not supported for this provider")
		return
	}
}

// HandleOAuthCallback 处理OAuth回调
func (h *WebHandler) HandleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		UpstreamID string `json:"upstream_id"`
		Code       string `json:"code"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	if req.UpstreamID == "" || req.Code == "" {
		h.writeError(w, http.StatusBadRequest, "upstream_id and code are required")
		return
	}

	// 获取上游账号信息
	account, err := h.configMgr.GetUpstreamAccount(req.UpstreamID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "Upstream account not found")
		return
	}

	// 仅支持Anthropic的授权码回调
	if account.Provider != "anthropic" {
		h.writeError(w, http.StatusBadRequest, "This callback is only for Anthropic OAuth")
		return
	}

	if err := h.oauthMgr.HandleCallback(req.UpstreamID, req.Code); err != nil {
		logger.Error("Failed to complete Anthropic OAuth: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to complete OAuth flow")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{
		"message": "OAuth flow completed successfully",
	})
}

// HandleOAuthStatus 查看OAuth状态
func (h *WebHandler) HandleOAuthStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// 从URL路径中提取ID
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 5 {
		h.writeError(w, http.StatusBadRequest, "Invalid upstream ID")
		return
	}

	upstreamID := pathParts[4] // /api/v1/oauth/status/{id}

	// 获取上游账号信息
	account, err := h.configMgr.GetUpstreamAccount(upstreamID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "Upstream account not found")
		return
	}

	// 检查OAuth状态
	status, err := h.upstreamMgr.GetOAuthStatus(upstreamID)
	if err != nil {
		logger.Error("Failed to get OAuth status: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to get OAuth status")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"upstream_id": upstreamID,
		"provider":    account.Provider,
		"status":      status,
	})
}

// HandleLogin 处理登录请求
func (h *WebHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	// 获取配置
	config, err := h.configMgr.Load()
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to load configuration")
		return
	}

	// 验证密码
	if req.Password != config.Server.Web.Password {
		h.writeError(w, http.StatusUnauthorized, "Invalid password")
		return
	}

	// 生成会话token
	token, err := h.generateSessionToken()
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to generate session")
		return
	}

	// 创建会话
	session := &Session{
		Token:     token,
		ExpiresAt: time.Now().Add(24 * time.Hour), // 24小时过期
		CreatedAt: time.Now(),
	}

	h.sessions[token] = session

	// 设置cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Expires:  session.ExpiresAt,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
	})

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Login successful",
		"token":   token,
	})
}

// HandleLogout 处理登出请求
func (h *WebHandler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// 获取token
	token := h.getTokenFromRequest(r)
	if token != "" {
		// 删除会话
		delete(h.sessions, token)
	}

	// 清除cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HttpOnly: true,
		Path:     "/",
	})

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Logout successful",
	})
}

// HandleChangePassword 处理密码修改请求
func (h *WebHandler) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	if req.NewPassword == "" {
		h.writeError(w, http.StatusBadRequest, "New password cannot be empty")
		return
	}

	// 获取配置
	config, err := h.configMgr.Load()
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to load configuration")
		return
	}

	// 验证旧密码
	if req.OldPassword != config.Server.Web.Password {
		h.writeError(w, http.StatusUnauthorized, "Invalid old password")
		return
	}

	// 更新密码
	config.Server.Web.Password = req.NewPassword
	if err := h.configMgr.Save(config); err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to save configuration")
		return
	}

	logger.Info("Web password changed successfully")
	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Password changed successfully",
	})
}

// generateSessionToken 生成会话token
func (h *WebHandler) generateSessionToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(bytes), nil
}

// getTokenFromRequest 从请求中获取token
func (h *WebHandler) getTokenFromRequest(r *http.Request) string {
	// 先从cookie中获取
	if cookie, err := r.Cookie("auth_token"); err == nil {
		return cookie.Value
	}

	// 再从Header中获取
	if auth := r.Header.Get("Authorization"); auth != "" {
		if strings.HasPrefix(auth, "Bearer ") {
			return strings.TrimPrefix(auth, "Bearer ")
		}
	}

	return ""
}

// isAuthenticated 检查是否已认证
func (h *WebHandler) isAuthenticated(r *http.Request) bool {
	token := h.getTokenFromRequest(r)
	if token == "" {
		return false
	}

	session, exists := h.sessions[token]
	if !exists {
		return false
	}

	// 检查是否过期
	if time.Now().After(session.ExpiresAt) {
		delete(h.sessions, token)
		return false
	}

	return true
}

// requireAuth 认证中间件
func (h *WebHandler) requireAuth(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.isAuthenticated(r) {
			h.writeError(w, http.StatusUnauthorized, "Authentication required")
			return
		}
		handler(w, r)
	}
}

