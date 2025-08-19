package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/iBreaker/llm-gateway/pkg/types"
	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/router"
)

// HTTPServer HTTP服务器
type HTTPServer struct {
	mux       *http.ServeMux
	config    *types.ServerConfig
	clientMgr *client.GatewayKeyManager
	router    *router.RequestRouter
	server    *http.Server
}

// NewServer 创建新的HTTP服务器
func NewServer(config *types.ServerConfig, clientMgr *client.GatewayKeyManager, router *router.RequestRouter) *HTTPServer {
	mux := http.NewServeMux()

	s := &HTTPServer{
		mux:       mux,
		config:    config,
		clientMgr: clientMgr,
		router:    router,
	}

	s.setupRoutes()
	return s
}

// setupRoutes 设置路由
func (s *HTTPServer) setupRoutes() {
	// 健康检查
	s.mux.HandleFunc("/health", s.handleHealth)
	
	// API代理路由
	s.mux.HandleFunc("/v1/chat/completions", s.handleChatCompletions)
	s.mux.HandleFunc("/v1/completions", s.handleCompletions)
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

// handleChatCompletions 聊天完成API处理器
func (s *HTTPServer) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// TODO: 实现聊天完成API
	s.writeJSONResponse(w, http.StatusNotImplemented, map[string]string{
		"error": "Not implemented yet",
	})
}

// handleCompletions 文本完成API处理器
func (s *HTTPServer) handleCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// TODO: 实现文本完成API
	s.writeJSONResponse(w, http.StatusNotImplemented, map[string]string{
		"error": "Not implemented yet",
	})
}