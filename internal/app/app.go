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

// SaveConfig 保存当前状态到配置文件（已废弃，ConfigManager自动保存）
// 保留此方法以维持向后兼容性，但实际上ConfigManager已经自动处理保存
func (app *Application) SaveConfig() error {
	// ConfigManager的CRUD操作已经自动保存到文件
	// 这里不需要任何操作
	return nil
}
