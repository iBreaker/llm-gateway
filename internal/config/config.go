package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v2"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// ConfigManager 配置管理器
type ConfigManager struct {
	configPath string
	config     *types.Config
}

// NewConfigManager 创建新的配置管理器
func NewConfigManager(configPath string) *ConfigManager {
	return &ConfigManager{
		configPath: configPath,
	}
}

// Load 加载配置文件
func (m *ConfigManager) Load() (*types.Config, error) {
	data, err := os.ReadFile(m.configPath)
	if err != nil {
		// 如果配置文件不存在，创建默认配置
		if os.IsNotExist(err) {
			config := m.createDefaultConfig()
			if err := m.Save(config); err != nil {
				return nil, fmt.Errorf("创建默认配置文件失败: %w", err)
			}
			m.config = config
			return config, nil
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var config types.Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}

	m.config = &config
	
	// 应用环境变量配置
	m.applyEnvironmentConfig(&config)
	
	return &config, nil
}

// Save 保存配置到文件
func (m *ConfigManager) Save(config *types.Config) error {
	data, err := yaml.Marshal(config)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	// 确保目录存在
	if dir := filepath.Dir(m.configPath); dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("创建配置目录失败: %w", err)
		}
	}

	if err := os.WriteFile(m.configPath, data, 0600); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	m.config = config
	return nil
}

// Get 获取当前配置
func (m *ConfigManager) Get() *types.Config {
	return m.config
}

// Validate 验证配置有效性
func (m *ConfigManager) Validate() error {
	if m.config == nil {
		return fmt.Errorf("配置未加载")
	}

	// 验证服务器配置
	if m.config.Server.Port <= 0 || m.config.Server.Port > 65535 {
		return fmt.Errorf("无效的端口号: %d", m.config.Server.Port)
	}

	if m.config.Server.Host == "" {
		return fmt.Errorf("服务器地址不能为空")
	}

	// 验证上游账号配置
	for i, account := range m.config.UpstreamAccounts {
		if err := m.validateUpstreamAccount(&account, i); err != nil {
			return err
		}
	}

	// 验证Gateway API Key配置
	for i, key := range m.config.GatewayKeys {
		if err := m.validateGatewayKey(&key, i); err != nil {
			return err
		}
	}

	return nil
}

// validateUpstreamAccount 验证上游账号配置
func (m *ConfigManager) validateUpstreamAccount(account *types.UpstreamAccount, index int) error {
	if account.ID == "" {
		return fmt.Errorf("上游账号[%d] ID不能为空", index)
	}

	if account.Name == "" {
		return fmt.Errorf("上游账号[%d] 名称不能为空", index)
	}

	if account.Provider == "" {
		return fmt.Errorf("上游账号[%d] 提供商不能为空", index)
	}

	switch account.Type {
	case types.UpstreamTypeAPIKey:
		if account.APIKey == "" {
			return fmt.Errorf("上游账号[%d] API Key不能为空", index)
		}
	case types.UpstreamTypeOAuth:
		if account.ClientID == "" {
			return fmt.Errorf("上游账号[%d] Client ID不能为空", index)
		}
		if account.ClientSecret == "" {
			return fmt.Errorf("上游账号[%d] Client Secret不能为空", index)
		}
	default:
		return fmt.Errorf("上游账号[%d] 不支持的账号类型: %s", index, account.Type)
	}

	return nil
}

// validateGatewayKey 验证Gateway API Key配置
func (m *ConfigManager) validateGatewayKey(key *types.GatewayAPIKey, index int) error {
	if key.ID == "" {
		return fmt.Errorf("Gateway API Key[%d] ID不能为空", index)
	}

	if key.Name == "" {
		return fmt.Errorf("Gateway API Key[%d] 名称不能为空", index)
	}

	if key.KeyHash == "" {
		return fmt.Errorf("Gateway API Key[%d] 密钥哈希不能为空", index)
	}

	if len(key.Permissions) == 0 {
		return fmt.Errorf("Gateway API Key[%d] 权限不能为空", index)
	}

	return nil
}

// createDefaultConfig 创建默认配置
func (m *ConfigManager) createDefaultConfig() *types.Config {
	return &types.Config{
		Server: types.ServerConfig{
			Host:    "0.0.0.0",
			Port:    3847, // 使用随机端口避免冲突
			Timeout: 30,
		},
		GatewayKeys:      []types.GatewayAPIKey{},
		UpstreamAccounts: []types.UpstreamAccount{},
		Logging: types.LoggingConfig{
			Level:  "info",
			Format: "json",
			File:   "",
		},
		Environment: types.EnvironmentConfig{
			HTTPProxy:  "",
			HTTPSProxy: "",
			NoProxy:    "localhost,127.0.0.1,::1",
		},
	}
}

// Reload 重新加载配置
func (m *ConfigManager) Reload() (*types.Config, error) {
	return m.Load()
}

// GetConfigPath 获取配置文件路径
func (m *ConfigManager) GetConfigPath() string {
	return m.configPath
}

// applyEnvironmentConfig 应用环境变量配置
func (m *ConfigManager) applyEnvironmentConfig(config *types.Config) {
	// 设置HTTP代理环境变量
	if config.Environment.HTTPProxy != "" {
		os.Setenv("HTTP_PROXY", config.Environment.HTTPProxy)
	}
	
	if config.Environment.HTTPSProxy != "" {
		os.Setenv("HTTPS_PROXY", config.Environment.HTTPSProxy)
	}
	
	if config.Environment.NoProxy != "" {
		os.Setenv("NO_PROXY", config.Environment.NoProxy)
	}
}