package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/converter"
	"github.com/iBreaker/llm-gateway/internal/router"
	"github.com/iBreaker/llm-gateway/internal/upstream"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// HTTPServer HTTP服务器
type HTTPServer struct {
	mux          *http.ServeMux
	config       *types.ServerConfig
	clientMgr    *client.GatewayKeyManager
	upstreamMgr  *upstream.UpstreamManager
	router       *router.RequestRouter
	converter    *converter.RequestResponseConverter
	server       *http.Server
	authMW       *AuthMiddleware
	rateLimitMW  *RateLimitMiddleware
	proxyHandler *ProxyHandler
}

// NewServer 创建新的HTTP服务器
func NewServer(
	config *types.ServerConfig,
	clientMgr *client.GatewayKeyManager,
	upstreamMgr *upstream.UpstreamManager,
	router *router.RequestRouter,
	converter *converter.RequestResponseConverter,
) *HTTPServer {
	mux := http.NewServeMux()

	// 创建中间件
	authMW := NewAuthMiddleware(clientMgr)
	rateLimitMW := NewRateLimitMiddleware(clientMgr)

	// 创建代理处理器
	proxyHandler := NewProxyHandler(clientMgr, upstreamMgr, router, converter)

	s := &HTTPServer{
		mux:          mux,
		config:       config,
		clientMgr:    clientMgr,
		upstreamMgr:  upstreamMgr,
		router:       router,
		converter:    converter,
		authMW:       authMW,
		rateLimitMW:  rateLimitMW,
		proxyHandler: proxyHandler,
	}

	s.setupRoutes()
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
	json.NewEncoder(w).Encode(data)
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
