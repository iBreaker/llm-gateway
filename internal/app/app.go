package app

import (
	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/config"
	"github.com/iBreaker/llm-gateway/internal/converter"
	"github.com/iBreaker/llm-gateway/internal/router"
	"github.com/iBreaker/llm-gateway/internal/server"
	"github.com/iBreaker/llm-gateway/internal/upstream"
)

// Application 应用程序上下文
type Application struct {
	Config        *config.ConfigManager
	GatewayKeyMgr *client.GatewayKeyManager
	UpstreamMgr   *upstream.UpstreamManager
	OAuthMgr      *upstream.OAuthManager
	Router        *router.RequestRouter
	Converter     *converter.RequestResponseConverter
	HTTPServer    *server.HTTPServer
}

// NewApplication 创建新的应用程序实例
func NewApplication(configPath string) (*Application, error) {
	// 初始化配置管理器
	configMgr := config.NewConfigManager(configPath)

	// 加载配置
	cfg, err := configMgr.Load()
	if err != nil {
		return nil, err
	}

	// 初始化各个组件，使用ConfigManager作为数据层
	gatewayKeyMgr := client.NewGatewayKeyManager(configMgr)
	upstreamMgr := upstream.NewUpstreamManager(configMgr)
	oauthMgr := upstream.NewOAuthManager(upstreamMgr)
	converter := converter.NewRequestResponseConverter()

	// 设置路由器策略
	requestRouter := router.NewRequestRouter(upstreamMgr, router.StrategyHealthFirst)

	// 创建HTTP服务器
	httpServer := server.NewServer(&cfg.Server, &cfg.Proxy, gatewayKeyMgr, upstreamMgr, requestRouter, converter)

	app := &Application{
		Config:        configMgr,
		GatewayKeyMgr: gatewayKeyMgr,
		UpstreamMgr:   upstreamMgr,
		OAuthMgr:      oauthMgr,
		Router:        requestRouter,
		Converter:     converter,
		HTTPServer:    httpServer,
	}

	// 数据已经在ConfigManager中，无需额外加载

	return app, nil
}

