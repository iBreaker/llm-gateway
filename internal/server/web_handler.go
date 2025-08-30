package server

import (
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
}

// NewWebHandler 创建 Web 处理器
func NewWebHandler(configMgr *config.ConfigManager, upstreamMgr *upstream.UpstreamManager, keyMgr *client.GatewayKeyManager) *WebHandler {
	return &WebHandler{
		configMgr:   configMgr,
		upstreamMgr: upstreamMgr,
		keyMgr:      keyMgr,
	}
}

// ServeStatic 处理静态文件请求
func (h *WebHandler) ServeStatic(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	
	// 根路径返回首页
	if path == "" || path == "/" {
		path = "/static/html/index.html"
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
	
	// 保存到配置
	if err := h.configMgr.CreateUpstreamAccount(account); err != nil {
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

// API Delete API Key
func (h *WebHandler) HandleAPIKeyDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	// 从URL路径中提取ID
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 4 {
		h.writeError(w, http.StatusBadRequest, "Invalid API key ID")
		return
	}
	
	keyID := pathParts[3] // /api/v1/apikeys/{id}
	
	if err := h.configMgr.DeleteGatewayKey(keyID); err != nil {
		logger.Error("Failed to delete API key %s: %v", keyID, err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete API key")
		return
	}
	
	logger.Info("Deleted API key: %s", keyID)
	w.WriteHeader(http.StatusNoContent)
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

