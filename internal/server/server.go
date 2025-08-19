package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/iBreaker/llm-gateway/pkg/types"
	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/router"
)

// HTTPServer HTTP服务器
type HTTPServer struct {
	engine       *gin.Engine
	config       *types.ServerConfig
	clientMgr    *client.GatewayKeyManager
	router       *router.RequestRouter
	server       *http.Server
}

// NewServer 创建新的HTTP服务器
func NewServer(config *types.ServerConfig, clientMgr *client.GatewayKeyManager, router *router.RequestRouter) *HTTPServer {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery())

	s := &HTTPServer{
		engine:    engine,
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
	s.engine.GET("/health", s.handleHealth)
	
	// API代理路由
	v1 := s.engine.Group("/v1")
	{
		v1.POST("/chat/completions", s.handleChatCompletions)
		v1.POST("/completions", s.handleCompletions)
	}
}

// Start 启动服务器
func (s *HTTPServer) Start() error {
	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	s.server = &http.Server{
		Addr:    addr,
		Handler: s.engine,
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

// handleHealth 健康检查处理器
func (s *HTTPServer) handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"service": "llm-gateway",
	})
}

// handleChatCompletions 聊天完成API处理器
func (s *HTTPServer) handleChatCompletions(c *gin.Context) {
	// TODO: 实现聊天完成API
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "Not implemented yet",
	})
}

// handleCompletions 文本完成API处理器
func (s *HTTPServer) handleCompletions(c *gin.Context) {
	// TODO: 实现文本完成API
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "Not implemented yet",
	})
}