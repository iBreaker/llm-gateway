package app

import (
	"github.com/iBreaker/llm-gateway/pkg/types"
	"github.com/iBreaker/llm-gateway/internal/client"
	"github.com/iBreaker/llm-gateway/internal/config"
	"github.com/iBreaker/llm-gateway/internal/router"
	"github.com/iBreaker/llm-gateway/internal/server"
	"github.com/iBreaker/llm-gateway/internal/transform"
	"github.com/iBreaker/llm-gateway/internal/upstream"
)

// Application 应用程序上下文
type Application struct {
	Config          *config.ConfigManager
	GatewayKeyMgr   *client.GatewayKeyManager
	UpstreamMgr     *upstream.UpstreamManager
	OAuthMgr        *upstream.OAuthManager
	Router          *router.RequestRouter
	Transformer     *transform.Transformer
	HTTPServer      *server.HTTPServer
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

	// 初始化各个组件
	gatewayKeyMgr := client.NewGatewayKeyManager()
	upstreamMgr := upstream.NewUpstreamManager()
	oauthMgr := upstream.NewOAuthManager(upstreamMgr)
	transformer := transform.NewTransformer()
	
	// 设置路由器策略
	requestRouter := router.NewRequestRouter(upstreamMgr, router.StrategyHealthFirst)
	
	// 创建HTTP服务器
	httpServer := server.NewServer(&cfg.Server, gatewayKeyMgr, upstreamMgr, requestRouter, transformer)

	app := &Application{
		Config:        configMgr,
		GatewayKeyMgr: gatewayKeyMgr,
		UpstreamMgr:   upstreamMgr,
		OAuthMgr:      oauthMgr,
		Router:        requestRouter,
		Transformer:   transformer,
		HTTPServer:    httpServer,
	}

	// 从配置文件加载数据
	if err := app.loadFromConfig(cfg); err != nil {
		return nil, err
	}

	return app, nil
}

// loadFromConfig 从配置文件加载数据到管理器
func (app *Application) loadFromConfig(cfg *types.Config) error {
	// 加载Gateway API Keys
	for _, key := range cfg.GatewayKeys {
		keyToLoad := key // 避免循环变量问题
		app.GatewayKeyMgr.LoadKey(&keyToLoad)
	}

	// 加载上游账号
	for _, account := range cfg.UpstreamAccounts {
		accountToLoad := account // 避免循环变量问题
		if err := app.UpstreamMgr.AddAccount(&accountToLoad); err != nil {
			return err
		}
	}

	return nil
}

// SaveConfig 保存当前状态到配置文件
func (app *Application) SaveConfig() error {
	// 获取当前配置
	cfg := app.Config.Get()
	
	// 更新Gateway Keys
	gatewayKeys := app.GatewayKeyMgr.ListKeys()
	cfg.GatewayKeys = make([]types.GatewayAPIKey, len(gatewayKeys))
	for i, key := range gatewayKeys {
		cfg.GatewayKeys[i] = *key
	}
	
	// 更新上游账号
	upstreamAccounts := app.UpstreamMgr.ListAccounts()
	cfg.UpstreamAccounts = make([]types.UpstreamAccount, len(upstreamAccounts))
	for i, account := range upstreamAccounts {
		cfg.UpstreamAccounts[i] = *account
	}

	// 保存到文件
	return app.Config.Save(cfg)
}