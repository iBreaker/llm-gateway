package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/iBreaker/llm-gateway/internal/app"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

func main() {
	// 设置默认配置文件路径
	configPath := "./config.yaml"
	if home, err := os.UserHomeDir(); err == nil {
		configPath = filepath.Join(home, ".llm-gateway", "config.yaml")
	}

	// 初始化应用程序
	application, err := app.NewApplication(configPath)
	if err != nil {
		log.Printf("初始化应用失败: %v\n", err)
		os.Exit(1)
	}

	// 运行CLI
	if err := runCLI(os.Args, application); err != nil {
		log.Printf("错误: %v\n", err)
		os.Exit(1)
	}
}

func runCLI(args []string, app *app.Application) error {
	if len(args) < 2 {
		printUsage()
		return nil
	}

	command := args[1]
	switch command {
	case "apikey":
		return handleAPIKey(args[2:], app)
	case "upstream":
		return handleUpstream(args[2:], app)
	case "server":
		return handleServer(args[2:], app)
	case "oauth":
		return handleOAuth(args[2:], app)
	case "status":
		return handleSystemStatus(args[2:], app)
	case "health":
		return handleHealthCheck(args[2:], app)
	default:
		fmt.Printf("未知命令: %s\n\n", command)
		printUsage()
		return fmt.Errorf("未知命令: %s", command)
	}
}

func printUsage() {
	fmt.Println("LLM Gateway - Anthropic API Proxy")
	fmt.Println()
	fmt.Println("用法:")
	fmt.Println("  llm-gateway <command> [arguments]")
	fmt.Println()
	fmt.Println("可用命令:")
	fmt.Println("  apikey     Gateway API Key管理")
	fmt.Println("  upstream   上游账号管理")
	fmt.Println("  server     服务器管理")
	fmt.Println("  oauth      OAuth流程管理")
	fmt.Println("  status     显示系统状态")
	fmt.Println("  health     健康检查")
	fmt.Println()
	fmt.Println("使用 'llm-gateway <command> --help' 查看命令的详细帮助")
}

// ===== API Key 命令处理器 =====

func handleAPIKey(args []string, app *app.Application) error {
	if len(args) == 0 {
		printAPIKeyUsage()
		return nil
	}

	subcommand := args[0]
	switch subcommand {
	case "add":
		return handleAPIKeyAdd(args[1:], app)
	case "list":
		return handleAPIKeyList(args[1:], app)
	case "show":
		return handleAPIKeyShow(args[1:], app)
	case "remove":
		return handleAPIKeyRemove(args[1:], app)
	case "disable":
		return handleAPIKeyDisable(args[1:], app)
	default:
		fmt.Printf("未知的apikey子命令: %s\n\n", subcommand)
		printAPIKeyUsage()
		return fmt.Errorf("未知的apikey子命令: %s", subcommand)
	}
}

func printAPIKeyUsage() {
	fmt.Println("用法: llm-gateway apikey <subcommand>")
	fmt.Println("描述: Gateway API Key管理")
	fmt.Println()
	fmt.Println("子命令:")
	fmt.Println("  add        添加新的API Key")
	fmt.Println("  list       列出所有API Key")
	fmt.Println("  show       显示API Key详情")
	fmt.Println("  remove     删除API Key")
	fmt.Println("  disable    禁用API Key")
}

func handleAPIKeyAdd(args []string, app *app.Application) error {
	fs := flag.NewFlagSet("apikey add", flag.ContinueOnError)
	name := fs.String("name", "", "API Key名称")
	permissions := fs.String("permissions", "read,write", "权限列表，逗号分隔")

	if err := fs.Parse(args); err != nil {
		return err
	}

	if *name == "" {
		return fmt.Errorf("缺少必要参数: --name")
	}

	// 解析权限
	permList := strings.Split(*permissions, ",")
	var perms []types.Permission
	for _, perm := range permList {
		perm = strings.TrimSpace(perm)
		switch perm {
		case "read":
			perms = append(perms, types.PermissionRead)
		case "write":
			perms = append(perms, types.PermissionWrite)
		case "admin":
			perms = append(perms, types.PermissionAdmin)
		default:
			return fmt.Errorf("无效的权限: %s", perm)
		}
	}

	// 创建API Key
	key, rawKey, err := app.GatewayKeyMgr.CreateKey(*name, perms)
	if err != nil {
		return fmt.Errorf("创建API Key失败: %w", err)
	}

	// 保存配置
	if err := app.SaveConfig(); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	fmt.Printf("成功创建Gateway API Key:\n")
	fmt.Printf("  ID: %s\n", key.ID)
	fmt.Printf("  名称: %s\n", key.Name)
	fmt.Printf("  权限: %v\n", perms)
	fmt.Printf("  密钥: %s\n", rawKey)
	fmt.Printf("  状态: %s\n", key.Status)
	fmt.Println()
	fmt.Println("请妥善保存上述密钥，系统不会再次显示！")

	return nil
}

func handleAPIKeyList(args []string, app *app.Application) error {
	keys := app.GatewayKeyMgr.ListKeys()

	if len(keys) == 0 {
		fmt.Println("没有找到Gateway API Key")
		return nil
	}

	fmt.Printf("Gateway API Key列表 (共%d个):\n\n", len(keys))
	
	for _, key := range keys {
		fmt.Printf("ID: %s\n", key.ID)
		fmt.Printf("  名称: %s\n", key.Name)
		fmt.Printf("  权限: %v\n", key.Permissions)
		fmt.Printf("  状态: %s\n", key.Status)
		fmt.Printf("  创建时间: %s\n", key.CreatedAt.Format("2006-01-02 15:04:05"))
		
		if key.Usage != nil {
			fmt.Printf("  总请求数: %d\n", key.Usage.TotalRequests)
			fmt.Printf("  成功请求: %d\n", key.Usage.SuccessfulRequests)
			fmt.Printf("  最后使用: %s\n", key.Usage.LastUsedAt.Format("2006-01-02 15:04:05"))
		}
		fmt.Println()
	}

	return nil
}

func handleAPIKeyShow(args []string, app *app.Application) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少参数: <key-id>")
	}

	keyID := args[0]
	key, err := app.GatewayKeyMgr.GetKey(keyID)
	if err != nil {
		return err
	}

	fmt.Printf("Gateway API Key详情:\n\n")
	fmt.Printf("ID: %s\n", key.ID)
	fmt.Printf("名称: %s\n", key.Name)
	fmt.Printf("权限: %v\n", key.Permissions)
	fmt.Printf("状态: %s\n", key.Status)
	fmt.Printf("创建时间: %s\n", key.CreatedAt.Format("2006-01-02 15:04:05"))
	fmt.Printf("更新时间: %s\n", key.UpdatedAt.Format("2006-01-02 15:04:05"))

	if key.ExpiresAt != nil {
		fmt.Printf("过期时间: %s\n", key.ExpiresAt.Format("2006-01-02 15:04:05"))
	}

	if key.Usage != nil {
		fmt.Println("\n使用统计:")
		fmt.Printf("  总请求数: %d\n", key.Usage.TotalRequests)
		fmt.Printf("  成功请求: %d\n", key.Usage.SuccessfulRequests)
		fmt.Printf("  错误请求: %d\n", key.Usage.ErrorRequests)
		fmt.Printf("  平均延迟: %.2f ms\n", key.Usage.AvgLatency)
		fmt.Printf("  最后使用: %s\n", key.Usage.LastUsedAt.Format("2006-01-02 15:04:05"))
		
		if key.Usage.LastErrorAt != nil {
			fmt.Printf("  最后错误: %s\n", key.Usage.LastErrorAt.Format("2006-01-02 15:04:05"))
		}
	}

	return nil
}

func handleAPIKeyRemove(args []string, app *app.Application) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少参数: <key-id>")
	}

	keyID := args[0]
	
	// 检查key是否存在
	_, err := app.GatewayKeyMgr.GetKey(keyID)
	if err != nil {
		return err
	}

	// 删除key
	if err := app.GatewayKeyMgr.DeleteKey(keyID); err != nil {
		return fmt.Errorf("删除API Key失败: %w", err)
	}

	// 保存配置
	if err := app.SaveConfig(); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	fmt.Printf("成功删除Gateway API Key: %s\n", keyID)
	return nil
}

func handleAPIKeyDisable(args []string, app *app.Application) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少参数: <key-id>")
	}

	keyID := args[0]
	
	// 禁用key
	if err := app.GatewayKeyMgr.UpdateKeyStatus(keyID, "disabled"); err != nil {
		return fmt.Errorf("禁用API Key失败: %w", err)
	}

	// 保存配置
	if err := app.SaveConfig(); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	fmt.Printf("成功禁用Gateway API Key: %s\n", keyID)
	return nil
}

// ===== 其他命令的占位符处理器 =====

func handleUpstream(args []string, app *app.Application) error {
	if len(args) == 0 {
		printUpstreamUsage()
		return nil
	}

	subcommand := args[0]
	switch subcommand {
	case "add":
		return handleUpstreamAdd(args[1:], app)
	case "list":
		return handleUpstreamList(args[1:], app)
	case "show":
		return handleUpstreamShow(args[1:], app)
	case "remove":
		return handleUpstreamRemove(args[1:], app)
	case "enable":
		return handleUpstreamEnable(args[1:], app)
	case "disable":
		return handleUpstreamDisable(args[1:], app)
	default:
		fmt.Printf("未知的upstream子命令: %s\n\n", subcommand)
		printUpstreamUsage()
		return fmt.Errorf("未知的upstream子命令: %s", subcommand)
	}
}

func printUpstreamUsage() {
	fmt.Println("用法: llm-gateway upstream <subcommand>")
	fmt.Println("描述: 上游账号管理")
	fmt.Println()
	fmt.Println("子命令:")
	fmt.Println("  add        添加上游账号")
	fmt.Println("  list       列出所有上游账号")
	fmt.Println("  show       显示上游账号详情")
	fmt.Println("  remove     删除上游账号")
	fmt.Println("  enable     启用上游账号")
	fmt.Println("  disable    禁用上游账号")
}

func handleUpstreamAdd(args []string, app *app.Application) error {
	fs := flag.NewFlagSet("upstream add", flag.ContinueOnError)
	accountType := fs.String("type", "", "账号类型 (api-key, oauth)")
	name := fs.String("name", "", "账号名称")
	provider := fs.String("provider", "anthropic", "提供商 (anthropic, openai, google, azure)")
	baseURL := fs.String("base-url", "", "自定义API端点URL (可选)")
	apiKey := fs.String("key", "", "API密钥 (type=api-key时必需)")
	clientID := fs.String("client-id", "", "Client ID (type=oauth时必需)")
	clientSecret := fs.String("client-secret", "", "Client Secret (type=oauth时必需)")

	if err := fs.Parse(args); err != nil {
		return err
	}

	if *accountType == "" {
		return fmt.Errorf("缺少必要参数: --type")
	}
	if *name == "" {
		return fmt.Errorf("缺少必要参数: --name")
	}

	// 验证账号类型
	var upstreamType types.UpstreamType
	switch *accountType {
	case "api-key":
		upstreamType = types.UpstreamTypeAPIKey
		if *apiKey == "" {
			return fmt.Errorf("API Key类型账号缺少参数: --key")
		}
	case "oauth":
		upstreamType = types.UpstreamTypeOAuth
		if *clientID == "" || *clientSecret == "" {
			return fmt.Errorf("OAuth类型账号缺少参数: --client-id 或 --client-secret")
		}
	default:
		return fmt.Errorf("无效的账号类型: %s (支持: api-key, oauth)", *accountType)
	}

	// 验证提供商
	var providerType types.Provider
	switch *provider {
	case "anthropic":
		providerType = types.ProviderAnthropic
	case "openai":
		providerType = types.ProviderOpenAI
	case "google":
		providerType = types.ProviderGoogle
	case "azure":
		providerType = types.ProviderAzure
	default:
		return fmt.Errorf("无效的提供商: %s (支持: anthropic, openai, google, azure)", *provider)
	}

	// 创建上游账号
	account := &types.UpstreamAccount{
		Name:     *name,
		Type:     upstreamType,
		Provider: providerType,
		BaseURL:  *baseURL,
		Status:   "active",
	}

	// 设置认证信息
	if upstreamType == types.UpstreamTypeAPIKey {
		account.APIKey = *apiKey
	} else {
		account.ClientID = *clientID
		account.ClientSecret = *clientSecret
	}

	// 添加账号
	if err := app.UpstreamMgr.AddAccount(account); err != nil {
		return fmt.Errorf("添加上游账号失败: %w", err)
	}

	// 保存配置
	if err := app.SaveConfig(); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	fmt.Printf("成功添加上游账号:\n")
	fmt.Printf("  ID: %s\n", account.ID)
	fmt.Printf("  名称: %s\n", account.Name)
	fmt.Printf("  类型: %s\n", account.Type)
	fmt.Printf("  提供商: %s\n", account.Provider)
	fmt.Printf("  状态: %s\n", account.Status)

	return nil
}

func handleUpstreamList(args []string, app *app.Application) error {
	accounts := app.UpstreamMgr.ListAccounts()

	if len(accounts) == 0 {
		fmt.Println("没有找到上游账号")
		return nil
	}

	fmt.Printf("上游账号列表 (共%d个):\n\n", len(accounts))

	for _, account := range accounts {
		fmt.Printf("ID: %s\n", account.ID)
		fmt.Printf("  名称: %s\n", account.Name)
		fmt.Printf("  类型: %s\n", account.Type)
		fmt.Printf("  提供商: %s\n", account.Provider)
		fmt.Printf("  状态: %s\n", account.Status)
		fmt.Printf("  健康状态: %s\n", account.HealthStatus)
		fmt.Printf("  创建时间: %s\n", account.CreatedAt.Format("2006-01-02 15:04:05"))

		if account.Usage != nil {
			fmt.Printf("  总请求数: %d\n", account.Usage.TotalRequests)
			fmt.Printf("  成功请求: %d\n", account.Usage.SuccessfulRequests)
			fmt.Printf("  错误率: %.2f%%\n", account.Usage.ErrorRate*100)
		}

		if account.Type == types.UpstreamTypeOAuth {
			if account.ExpiresAt != nil {
				fmt.Printf("  Token过期: %s\n", account.ExpiresAt.Format("2006-01-02 15:04:05"))
			} else {
				fmt.Printf("  Token过期: 未设置\n")
			}
		}
		fmt.Println()
	}

	return nil
}

func handleUpstreamShow(args []string, app *app.Application) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少参数: <upstream-id>")
	}

	upstreamID := args[0]
	account, err := app.UpstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	fmt.Printf("上游账号详情:\n\n")
	fmt.Printf("ID: %s\n", account.ID)
	fmt.Printf("名称: %s\n", account.Name)
	fmt.Printf("类型: %s\n", account.Type)
	fmt.Printf("提供商: %s\n", account.Provider)
	fmt.Printf("状态: %s\n", account.Status)
	fmt.Printf("健康状态: %s\n", account.HealthStatus)
	fmt.Printf("创建时间: %s\n", account.CreatedAt.Format("2006-01-02 15:04:05"))
	fmt.Printf("更新时间: %s\n", account.UpdatedAt.Format("2006-01-02 15:04:05"))

	if account.LastHealthCheck != nil {
		fmt.Printf("最后健康检查: %s\n", account.LastHealthCheck.Format("2006-01-02 15:04:05"))
	}

	if account.Type == types.UpstreamTypeAPIKey {
		fmt.Printf("API Key: %s***\n", account.APIKey[:8])
	} else {
		fmt.Printf("Client ID: %s\n", account.ClientID)
		if account.ExpiresAt != nil {
			fmt.Printf("Token过期时间: %s\n", account.ExpiresAt.Format("2006-01-02 15:04:05"))
		}
		if account.AccessToken != "" {
			fmt.Printf("Access Token: %s***\n", account.AccessToken[:8])
		}
	}

	if account.Usage != nil {
		fmt.Println("\n使用统计:")
		fmt.Printf("  总请求数: %d\n", account.Usage.TotalRequests)
		fmt.Printf("  成功请求: %d\n", account.Usage.SuccessfulRequests)
		fmt.Printf("  错误请求: %d\n", account.Usage.ErrorRequests)
		fmt.Printf("  错误率: %.2f%%\n", account.Usage.ErrorRate*100)
		fmt.Printf("  已使用Token: %d\n", account.Usage.TokensUsed)
		fmt.Printf("  平均延迟: %.2f ms\n", account.Usage.AvgLatency)
		fmt.Printf("  最后使用: %s\n", account.Usage.LastUsedAt.Format("2006-01-02 15:04:05"))

		if account.Usage.LastErrorAt != nil {
			fmt.Printf("  最后错误: %s\n", account.Usage.LastErrorAt.Format("2006-01-02 15:04:05"))
		}
	}

	return nil
}

func handleUpstreamRemove(args []string, app *app.Application) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少参数: <upstream-id>")
	}

	upstreamID := args[0]

	// 检查账号是否存在
	_, err := app.UpstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	// 删除账号
	if err := app.UpstreamMgr.DeleteAccount(upstreamID); err != nil {
		return fmt.Errorf("删除上游账号失败: %w", err)
	}

	// 保存配置
	if err := app.SaveConfig(); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	fmt.Printf("成功删除上游账号: %s\n", upstreamID)
	return nil
}

func handleUpstreamEnable(args []string, app *app.Application) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少参数: <upstream-id>")
	}

	upstreamID := args[0]

	// 启用账号
	if err := app.UpstreamMgr.UpdateAccountStatus(upstreamID, "active"); err != nil {
		return fmt.Errorf("启用上游账号失败: %w", err)
	}

	// 保存配置
	if err := app.SaveConfig(); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	fmt.Printf("成功启用上游账号: %s\n", upstreamID)
	return nil
}

func handleUpstreamDisable(args []string, app *app.Application) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少参数: <upstream-id>")
	}

	upstreamID := args[0]

	// 禁用账号
	if err := app.UpstreamMgr.UpdateAccountStatus(upstreamID, "disabled"); err != nil {
		return fmt.Errorf("禁用上游账号失败: %w", err)
	}

	// 保存配置
	if err := app.SaveConfig(); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	fmt.Printf("成功禁用上游账号: %s\n", upstreamID)
	return nil
}

func handleServer(args []string, app *app.Application) error {
	if len(args) == 0 {
		printServerUsage()
		return nil
	}

	subcommand := args[0]
	switch subcommand {
	case "start":
		return handleServerStart(args[1:], app)
	case "status":
		return handleServerStatus(args[1:], app)
	default:
		fmt.Printf("未知的server子命令: %s\n\n", subcommand)
		printServerUsage()
		return fmt.Errorf("未知的server子命令: %s", subcommand)
	}
}

func printServerUsage() {
	fmt.Println("用法: llm-gateway server <subcommand>")
	fmt.Println("描述: 服务器管理")
	fmt.Println()
	fmt.Println("子命令:")
	fmt.Println("  start      启动HTTP服务器")
	fmt.Println("  status     查看服务器状态")
}

func handleServerStart(args []string, app *app.Application) error {
	fmt.Printf("启动LLM Gateway HTTP服务器...\n")
	
	// 显示服务器配置信息
	config := app.Config.Get()
	fmt.Printf("监听地址: %s:%d\n", config.Server.Host, config.Server.Port)
	fmt.Printf("请求超时: %d秒\n", config.Server.Timeout)
	
	// 显示统计信息
	gatewayKeys := app.GatewayKeyMgr.ListKeys()
	upstreamAccounts := app.UpstreamMgr.ListAccounts()
	activeUpstreams := 0
	for _, account := range upstreamAccounts {
		if account.Status == "active" {
			activeUpstreams++
		}
	}
	
	fmt.Printf("\n当前配置状态:\n")
	fmt.Printf("  Gateway API Keys: %d个\n", len(gatewayKeys))
	fmt.Printf("  上游账号总数: %d个\n", len(upstreamAccounts))
	fmt.Printf("  活跃上游账号: %d个\n", activeUpstreams)
	fmt.Println()
	
	// 启动HTTP服务器 (这会阻塞)
	fmt.Println("服务器启动中，按 Ctrl+C 停止...")
	if err := app.HTTPServer.Start(); err != nil {
		return fmt.Errorf("启动服务器失败: %w", err)
	}
	
	return nil
}

func handleServerStatus(args []string, app *app.Application) error {
	config := app.Config.Get()
	
	fmt.Println("LLM Gateway 服务器状态:")
	fmt.Printf("配置文件: %s\n", app.Config.GetConfigPath())
	fmt.Printf("监听地址: %s:%d\n", config.Server.Host, config.Server.Port)
	fmt.Printf("请求超时: %d秒\n", config.Server.Timeout)
	
	// Gateway API Keys统计
	gatewayKeys := app.GatewayKeyMgr.ListKeys()
	activeKeys := 0
	for _, key := range gatewayKeys {
		if key.Status == "active" {
			activeKeys++
		}
	}
	
	fmt.Printf("\nGateway API Keys:\n")
	fmt.Printf("  总数: %d个\n", len(gatewayKeys))
	fmt.Printf("  活跃: %d个\n", activeKeys)
	
	// 上游账号统计
	upstreamAccounts := app.UpstreamMgr.ListAccounts()
	providerStats := make(map[types.Provider]int)
	activeUpstreams := 0
	healthyUpstreams := 0
	
	for _, account := range upstreamAccounts {
		providerStats[account.Provider]++
		if account.Status == "active" {
			activeUpstreams++
		}
		if account.HealthStatus == "healthy" {
			healthyUpstreams++
		}
	}
	
	fmt.Printf("\n上游账号:\n")
	fmt.Printf("  总数: %d个\n", len(upstreamAccounts))
	fmt.Printf("  活跃: %d个\n", activeUpstreams)
	fmt.Printf("  健康: %d个\n", healthyUpstreams)
	
	if len(providerStats) > 0 {
		fmt.Printf("  按提供商分布:\n")
		for provider, count := range providerStats {
			fmt.Printf("    %s: %d个\n", provider, count)
		}
	}
	
	// 负载均衡策略
	fmt.Printf("\n负载均衡:\n")
	fmt.Printf("  策略: health_first\n") // 硬编码，因为我们在app.go中设置的
	
	return nil
}

func handleOAuth(args []string, app *app.Application) error {
	fmt.Println("OAuth流程管理功能待实现")
	return nil
}

func handleSystemStatus(args []string, app *app.Application) error {
	fmt.Println("系统状态查询功能待实现")
	return nil
}

func handleHealthCheck(args []string, app *app.Application) error {
	fmt.Println("健康检查功能待实现")
	return nil
}