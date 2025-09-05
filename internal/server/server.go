package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/config"
	"github.com/iBreaker/llm-gateway/internal/converter"
	"github.com/iBreaker/llm-gateway/internal/router"
	"github.com/iBreaker/llm-gateway/internal/upstream"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// ConfigManager 配置管理器接口
type ConfigManager interface {
	Get() *types.Config
	ListUpstreamAccounts() []*types.UpstreamAccount
	CreateUpstreamAccount(account *types.UpstreamAccount) error
	DeleteUpstreamAccount(id string) error
	ListGatewayKeys() []*types.GatewayAPIKey
	DeleteGatewayKey(id string) error
}

// HTTPServer HTTP服务器
type HTTPServer struct {
	mux          *http.ServeMux
	config       *types.ServerConfig
	clientMgr    *client.GatewayKeyManager
	upstreamMgr  *upstream.UpstreamManager
	router       *router.RequestRouter
	converter    *converter.Manager
	server       *http.Server
	authMW       *AuthMiddleware
	rateLimitMW  *RateLimitMiddleware
	proxyHandler *ProxyHandler
	configMgr    ConfigManager
	oauthMgr     *upstream.OAuthManager
}

// NewServer 创建新的HTTP服务器
func NewServer(
	config *types.Config,
	clientMgr *client.GatewayKeyManager,
	upstreamMgr *upstream.UpstreamManager,
	router *router.RequestRouter,
	converter *converter.Manager,
	configMgr ConfigManager,
	oauthMgr *upstream.OAuthManager,
) *HTTPServer {
	mux := http.NewServeMux()

	// 创建中间件
	authMW := NewAuthMiddleware(clientMgr)
	rateLimitMW := NewRateLimitMiddleware(clientMgr)

	// 创建代理处理器
	proxyHandler := NewProxyHandler(clientMgr, upstreamMgr, router, converter, &config.Proxy, &config.ModelRoutes)

	s := &HTTPServer{
		mux:          mux,
		config:       &config.Server,
		clientMgr:    clientMgr,
		upstreamMgr:  upstreamMgr,
		router:       router,
		converter:    converter,
		authMW:       authMW,
		rateLimitMW:  rateLimitMW,
		proxyHandler: proxyHandler,
		configMgr:    configMgr,
		oauthMgr:     oauthMgr,
	}

	s.setupRoutes()
	s.setupWebRoutes()
	return s
}

// setupRoutes 设置路由
func (s *HTTPServer) setupRoutes() {
	// 健康检查路由（无需认证）
	s.mux.HandleFunc("/health", CORSMiddleware(LoggingMiddleware(s.handleHealth)))

	// API代理路由（需要完整的中间件链）
	s.mux.HandleFunc("/v1/chat/completions", s.withMiddleware(s.proxyHandler.HandleChatCompletions))
	s.mux.HandleFunc("/v1/completions", s.withMiddleware(s.proxyHandler.HandleCompletions))
	s.mux.HandleFunc("/v1/messages", s.withMiddleware(s.proxyHandler.HandleMessages)) // Anthropic原生端点
}

// setupWebRoutes 设置Web管理界面路由
func (s *HTTPServer) setupWebRoutes() {
	// 由于接口限制，这里需要具体的ConfigManager实现类型
	// 这个方法需要在调用方传入具体的类型
	if configMgr, ok := s.configMgr.(*config.ConfigManager); ok {
		webHandler := NewWebHandler(configMgr, s.upstreamMgr, s.clientMgr, s.oauthMgr)
		
		// 根路径提供web管理界面
		s.mux.HandleFunc("/", webHandler.ServeStatic)
		
		// 静态资源路径
		s.mux.HandleFunc("/static/", webHandler.ServeStatic)
		
		// 公开的认证端点（不需要认证）
		s.mux.HandleFunc("/api/v1/login", CORSMiddleware(LoggingMiddleware(webHandler.HandleLogin)))
		s.mux.HandleFunc("/api/v1/logout", CORSMiddleware(LoggingMiddleware(webHandler.HandleLogout)))
		s.mux.HandleFunc("/api/v1/change-password", CORSMiddleware(LoggingMiddleware(webHandler.HandleChangePassword)))
		
		// 受保护的Web API 端点（需要认证）
		s.mux.HandleFunc("/api/v1/health", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleAPIHealth))))
		s.mux.HandleFunc("/api/v1/config", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleAPIConfig))))
		s.mux.HandleFunc("/api/v1/upstream", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleAPIUpstream))))
		s.mux.HandleFunc("/api/v1/upstream/", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleAPIUpstreamDelete))))
		s.mux.HandleFunc("/api/v1/apikeys", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleAPIKeys))))
		s.mux.HandleFunc("/api/v1/apikeys/", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleAPIKeyActions))))
		
		// 受保护的OAuth API 端点（需要认证）
		s.mux.HandleFunc("/api/v1/oauth/start", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleOAuthStart))))
		s.mux.HandleFunc("/api/v1/oauth/callback", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleOAuthCallback))))
		s.mux.HandleFunc("/api/v1/oauth/status/", CORSMiddleware(LoggingMiddleware(webHandler.requireAuth(webHandler.HandleOAuthStatus))))
	}
}

// withMiddleware 应用中间件链
func (s *HTTPServer) withMiddleware(handler http.HandlerFunc) http.HandlerFunc {
	// 中间件链：CORS -> 日志 -> 认证 -> 限流 -> 处理器
	return CORSMiddleware(
		LoggingMiddleware(
			s.authMW.Authenticate(
				s.rateLimitMW.RateLimit(handler),
			),
		),
	)
}

// Start 启动服务器
func (s *HTTPServer) Start() error {
	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	s.server = &http.Server{
		Addr:    addr,
		Handler: s.loggingMiddleware(s.mux),
	}

	fmt.Printf("启动 LLM Gateway 服务器，地址: %s\n", addr)
	return s.server.ListenAndServe()
}

// Stop 停止服务器
func (s *HTTPServer) Stop(ctx context.Context) error {
	if s.server != nil {
		return s.server.Shutdown(ctx)
	}
	return nil
}

// loggingMiddleware 日志中间件
func (s *HTTPServer) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s %s", r.Method, r.URL.Path, r.RemoteAddr)
		next.ServeHTTP(w, r)
	})
}

// writeJSONResponse 写入JSON响应
func (s *HTTPServer) writeJSONResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// handleHealth 健康检查处理器
func (s *HTTPServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.writeJSONResponse(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"service": "llm-gateway",
	})
}
