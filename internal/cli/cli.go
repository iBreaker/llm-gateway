package cli

import (
	"fmt"
)

// CLI 命令行接口
type CLI struct {
	app     *App
	appCtx  interface{} // 应用程序上下文，使用接口避免循环依赖
}

// App 应用程序
type App struct {
	Name        string
	Description string
	Commands    map[string]*Command
}

// Command 命令定义
type Command struct {
	Name        string
	Description string
	Usage       string
	Handler     func(args []string) error
	Subcommands map[string]*Command
}

// NewCLI 创建新的CLI
func NewCLI() *CLI {
	app := &App{
		Name:        "llm-gateway",
		Description: "LLM Gateway - Anthropic API Proxy",
		Commands:    make(map[string]*Command),
	}

	cli := &CLI{app: app}
	cli.setupCommands()
	return cli
}

// SetAppContext 设置应用程序上下文
func (c *CLI) SetAppContext(appCtx interface{}) {
	c.appCtx = appCtx
}

// setupCommands 设置命令
func (c *CLI) setupCommands() {
	// Server命令组
	serverCmd := &Command{
		Name:        "server",
		Description: "服务器管理",
		Usage:       "llm-gateway server <subcommand>",
		Subcommands: map[string]*Command{
			"start": {
				Name:        "start",
				Description: "启动服务器",
				Usage:       "llm-gateway server start",
				Handler:     c.handleServerStart,
			},
			"stop": {
				Name:        "stop",
				Description: "停止服务器",
				Usage:       "llm-gateway server stop",
				Handler:     c.handleServerStop,
			},
			"status": {
				Name:        "status",
				Description: "查看服务器状态",
				Usage:       "llm-gateway server status",
				Handler:     c.handleServerStatus,
			},
		},
		Handler: c.handleServer,
	}

	// API Key命令组
	apikeyCmd := &Command{
		Name:        "apikey",
		Description: "Gateway API Key管理",
		Usage:       "llm-gateway apikey <subcommand>",
		Subcommands: map[string]*Command{
			"add": {
				Name:        "add",
				Description: "添加新的API Key",
				Usage:       "llm-gateway apikey add --name=<name> --permissions=<permissions>",
				Handler:     c.handleAPIKeyAdd,
			},
			"list": {
				Name:        "list",
				Description: "列出所有API Key",
				Usage:       "llm-gateway apikey list",
				Handler:     c.handleAPIKeyList,
			},
			"show": {
				Name:        "show",
				Description: "显示API Key详情",
				Usage:       "llm-gateway apikey show <key-id>",
				Handler:     c.handleAPIKeyShow,
			},
			"remove": {
				Name:        "remove",
				Description: "删除API Key",
				Usage:       "llm-gateway apikey remove <key-id>",
				Handler:     c.handleAPIKeyRemove,
			},
			"disable": {
				Name:        "disable",
				Description: "禁用API Key",
				Usage:       "llm-gateway apikey disable <key-id>",
				Handler:     c.handleAPIKeyDisable,
			},
		},
		Handler: c.handleAPIKey,
	}

	// Upstream命令组
	upstreamCmd := &Command{
		Name:        "upstream",
		Description: "上游账号管理",
		Usage:       "llm-gateway upstream <subcommand>",
		Subcommands: map[string]*Command{
			"add": {
				Name:        "add",
				Description: "添加上游账号",
				Usage:       "llm-gateway upstream add --type=<type> --name=<name> [options]",
				Handler:     c.handleUpstreamAdd,
			},
			"list": {
				Name:        "list",
				Description: "列出所有上游账号",
				Usage:       "llm-gateway upstream list",
				Handler:     c.handleUpstreamList,
			},
			"show": {
				Name:        "show",
				Description: "显示上游账号详情",
				Usage:       "llm-gateway upstream show <upstream-id>",
				Handler:     c.handleUpstreamShow,
			},
			"remove": {
				Name:        "remove",
				Description: "删除上游账号",
				Usage:       "llm-gateway upstream remove <upstream-id>",
				Handler:     c.handleUpstreamRemove,
			},
			"enable": {
				Name:        "enable",
				Description: "启用上游账号",
				Usage:       "llm-gateway upstream enable <upstream-id>",
				Handler:     c.handleUpstreamEnable,
			},
			"disable": {
				Name:        "disable",
				Description: "禁用上游账号",
				Usage:       "llm-gateway upstream disable <upstream-id>",
				Handler:     c.handleUpstreamDisable,
			},
		},
		Handler: c.handleUpstream,
	}

	// OAuth命令组
	oauthCmd := &Command{
		Name:        "oauth",
		Description: "OAuth流程管理",
		Usage:       "llm-gateway oauth <subcommand>",
		Subcommands: map[string]*Command{
			"start": {
				Name:        "start",
				Description: "启动OAuth授权流程",
				Usage:       "llm-gateway oauth start <upstream-id>",
				Handler:     c.handleOAuthStart,
			},
			"callback": {
				Name:        "callback",
				Description: "处理OAuth回调",
				Usage:       "llm-gateway oauth callback --code=<code> --upstream-id=<upstream-id>",
				Handler:     c.handleOAuthCallback,
			},
			"refresh": {
				Name:        "refresh",
				Description: "刷新OAuth token",
				Usage:       "llm-gateway oauth refresh <upstream-id>",
				Handler:     c.handleOAuthRefresh,
			},
			"status": {
				Name:        "status",
				Description: "查看OAuth状态",
				Usage:       "llm-gateway oauth status <upstream-id>",
				Handler:     c.handleOAuthStatus,
			},
		},
		Handler: c.handleOAuth,
	}

	// 系统命令
	c.app.Commands["server"] = serverCmd
	c.app.Commands["apikey"] = apikeyCmd
	c.app.Commands["upstream"] = upstreamCmd
	c.app.Commands["oauth"] = oauthCmd

	// 简单命令
	c.app.Commands["status"] = &Command{
		Name:        "status",
		Description: "显示系统状态",
		Usage:       "llm-gateway status",
		Handler:     c.handleSystemStatus,
	}

	c.app.Commands["health"] = &Command{
		Name:        "health",
		Description: "健康检查",
		Usage:       "llm-gateway health",
		Handler:     c.handleHealthCheck,
	}
}

// Run 运行CLI
func (c *CLI) Run(args []string) error {
	if len(args) < 2 {
		c.printUsage()
		return nil
	}

	commandName := args[1]
	cmd, exists := c.app.Commands[commandName]
	if !exists {
		fmt.Printf("未知命令: %s\n\n", commandName)
		c.printUsage()
		return fmt.Errorf("未知命令: %s", commandName)
	}

	// 执行命令
	return cmd.Handler(args[2:])
}

// printUsage 打印使用说明
func (c *CLI) printUsage() {
	fmt.Printf("%s\n", c.app.Description)
	fmt.Println()
	fmt.Println("用法:")
	fmt.Printf("  %s <command> [arguments]\n", c.app.Name)
	fmt.Println()
	fmt.Println("可用命令:")
	
	for _, cmd := range c.app.Commands {
		fmt.Printf("  %-10s %s\n", cmd.Name, cmd.Description)
	}
	
	fmt.Println()
	fmt.Printf("使用 '%s <command> --help' 查看命令的详细帮助\n", c.app.Name)
}

// printCommandUsage 打印命令使用说明
func (c *CLI) printCommandUsage(cmd *Command) {
	fmt.Printf("用法: %s\n", cmd.Usage)
	fmt.Printf("描述: %s\n", cmd.Description)
	
	if len(cmd.Subcommands) > 0 {
		fmt.Println()
		fmt.Println("子命令:")
		for _, subcmd := range cmd.Subcommands {
			fmt.Printf("  %-10s %s\n", subcmd.Name, subcmd.Description)
		}
	}
}