package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// AuthMiddleware 认证中间件
type AuthMiddleware struct {
	gatewayKeyMgr *client.GatewayKeyManager
}

// NewAuthMiddleware 创建认证中间件
func NewAuthMiddleware(gatewayKeyMgr *client.GatewayKeyManager) *AuthMiddleware {
	return &AuthMiddleware{
		gatewayKeyMgr: gatewayKeyMgr,
	}
}

// Authenticate 认证中间件处理函数
func (m *AuthMiddleware) Authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 提取Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			m.writeErrorResponse(w, http.StatusUnauthorized, "missing_authorization", "Authorization header is required")
			return
		}

		// 检查Bearer token格式
		if !strings.HasPrefix(authHeader, "Bearer ") {
			m.writeErrorResponse(w, http.StatusUnauthorized, "invalid_authorization_format", "Authorization header must be 'Bearer <token>'")
			return
		}

		// 提取token
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == "" {
			m.writeErrorResponse(w, http.StatusUnauthorized, "empty_token", "Authorization token cannot be empty")
			return
		}

		// 验证token
		gatewayKey, err := m.gatewayKeyMgr.ValidateKey(token)
		if err != nil {
			m.writeErrorResponse(w, http.StatusUnauthorized, "invalid_token", "Invalid or expired API key")
			return
		}

		// 检查权限（这里简单检查，后续可以根据具体API端点细化）
		if !m.hasRequiredPermission(gatewayKey, r.Method) {
			m.writeErrorResponse(w, http.StatusForbidden, "insufficient_permissions", "API key does not have required permissions")
			return
		}

		// 在请求上下文中保存Gateway Key信息，供后续处理使用
		r.Header.Set("X-Gateway-Key-ID", gatewayKey.ID)
		r.Header.Set("X-Gateway-Key-Name", gatewayKey.Name)

		// 调用下一个处理器
		next(w, r)

		// 记录使用统计（在请求完成后）
		// 这里暂时记录为成功，实际应该根据响应状态码判断
		go func() {
			err := m.gatewayKeyMgr.UpdateKeyUsage(gatewayKey.ID, true, 0)
			if err != nil {
				// 记录日志，但不影响请求处理
				// TODO: 添加日志记录
			}
		}()
	}
}

// hasRequiredPermission 检查权限
func (m *AuthMiddleware) hasRequiredPermission(key *types.GatewayAPIKey, method string) bool {
	// Admin权限可以访问所有接口
	for _, perm := range key.Permissions {
		if perm == types.PermissionAdmin {
			return true
		}
	}

	// 根据HTTP方法检查权限
	switch method {
	case "GET":
		// GET请求需要read权限
		for _, perm := range key.Permissions {
			if perm == types.PermissionRead {
				return true
			}
		}
	case "POST", "PUT", "DELETE", "PATCH":
		// 写操作需要write权限
		for _, perm := range key.Permissions {
			if perm == types.PermissionWrite {
				return true
			}
		}
	}

	return false
}

// writeErrorResponse 写入错误响应
func (m *AuthMiddleware) writeErrorResponse(w http.ResponseWriter, statusCode int, errorType, message string) {
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

// RateLimitMiddleware 限流中间件（简化版本）
type RateLimitMiddleware struct {
	gatewayKeyMgr *client.GatewayKeyManager
}

// NewRateLimitMiddleware 创建限流中间件
func NewRateLimitMiddleware(gatewayKeyMgr *client.GatewayKeyManager) *RateLimitMiddleware {
	return &RateLimitMiddleware{
		gatewayKeyMgr: gatewayKeyMgr,
	}
}

// RateLimit 限流处理
func (m *RateLimitMiddleware) RateLimit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		keyID := r.Header.Get("X-Gateway-Key-ID")
		if keyID == "" {
			// 如果没有key ID，说明认证失败，直接跳过限流
			next(w, r)
			return
		}

		// 获取Gateway Key信息
		gatewayKey, err := m.gatewayKeyMgr.GetKey(keyID)
		if err != nil {
			next(w, r)
			return
		}

		// 简单的限流检查（这里是简化版本，实际应该使用更复杂的限流算法）
		if gatewayKey.RateLimit != nil {
			// 这里可以实现令牌桶或滑动窗口算法
			// 暂时跳过具体实现，后续可以优化
		}

		next(w, r)
	}
}

// CORSMiddleware CORS中间件
func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// LoggingMiddleware 日志中间件
func LoggingMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// 创建ResponseWriter包装器来捕获状态码
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		
		next(wrapped, r)
		
		duration := time.Since(start)
		
		// 记录请求日志
		keyID := r.Header.Get("X-Gateway-Key-ID")
		if keyID == "" {
			keyID = "anonymous"
		}
		
		// TODO: 使用结构化日志记录
		_ = duration // 暂时避免未使用变量错误
		// log.Printf("[%s] %s %s - %d - %v - key:%s", 
		//     r.Method, r.URL.Path, r.RemoteAddr, wrapped.statusCode, duration, keyID)
	}
}

// responseWriter 包装器，用于捕获响应状态码
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(statusCode int) {
	rw.statusCode = statusCode
	rw.ResponseWriter.WriteHeader(statusCode)
}