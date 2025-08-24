package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/iBreaker/llm-gateway/pkg/types"
	yaml "gopkg.in/yaml.v2"
)

// ConfigManager 配置管理器
type ConfigManager struct {
	configPath string
	config     *types.Config
	mutex      sync.RWMutex
}

// NewConfigManager 创建新的配置管理器
func NewConfigManager(configPath string) *ConfigManager {
	return &ConfigManager{
		configPath: configPath,
	}
}

// Load 加载配置文件
func (m *ConfigManager) Load() (*types.Config, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	return m.loadUnsafe()
}

// loadUnsafe 不加锁的加载方法（内部使用）
func (m *ConfigManager) loadUnsafe() (*types.Config, error) {
	data, err := os.ReadFile(m.configPath)
	if err != nil {
		// 如果配置文件不存在，创建默认配置
		if os.IsNotExist(err) {
			config := m.createDefaultConfig()
			if err := m.saveUnsafe(config); err != nil {
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
	m.mutex.Lock()
	defer m.mutex.Unlock()
	return m.saveUnsafe(config)
}

// saveUnsafe 不加锁的保存方法（内部使用）
func (m *ConfigManager) saveUnsafe(config *types.Config) error {
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
	m.mutex.RLock()
	defer m.mutex.RUnlock()
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
		return fmt.Errorf("gateway API Key[%d] ID不能为空", index)
	}

	if key.Name == "" {
		return fmt.Errorf("gateway API Key[%d] 名称不能为空", index)
	}

	if key.KeyHash == "" {
		return fmt.Errorf("gateway API Key[%d] 密钥哈希不能为空", index)
	}

	if len(key.Permissions) == 0 {
		return fmt.Errorf("gateway API Key[%d] 权限不能为空", index)
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
		Proxy: types.ProxyConfig{
			RequestTimeout:  60,  // 普通请求60秒
			StreamTimeout:   300, // 流式请求5分钟
			ConnectTimeout:  10,  // 连接超时10秒
			TLSTimeout:      10,  // TLS握手10秒
			IdleConnTimeout: 90,  // 空闲连接90秒
			ResponseTimeout: 30,  // 响应头30秒
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

// ===== Gateway API Keys CRUD =====

// CreateGatewayKey 创建Gateway API Key
func (m *ConfigManager) CreateGatewayKey(key *types.GatewayAPIKey) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.config == nil {
		return fmt.Errorf("配置未加载")
	}

	// 检查ID是否已存在
	for _, existingKey := range m.config.GatewayKeys {
		if existingKey.ID == key.ID {
			return fmt.Errorf("gateway API Key ID已存在: %s", key.ID)
		}
	}

	// 添加到配置
	m.config.GatewayKeys = append(m.config.GatewayKeys, *key)

	// 自动保存到文件
	return m.saveUnsafe(m.config)
}

// GetGatewayKey 获取指定的Gateway API Key
func (m *ConfigManager) GetGatewayKey(keyID string) (*types.GatewayAPIKey, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	if m.config == nil {
		return nil, fmt.Errorf("配置未加载")
	}

	for _, key := range m.config.GatewayKeys {
		if key.ID == keyID {
			keyCopy := key // 避免返回内部数据的引用
			return &keyCopy, nil
		}
	}

	return nil, fmt.Errorf("gateway API Key不存在: %s", keyID)
}

// ListGatewayKeys 列出所有Gateway API Key
func (m *ConfigManager) ListGatewayKeys() []*types.GatewayAPIKey {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	if m.config == nil {
		return []*types.GatewayAPIKey{}
	}

	// 返回副本避免外部修改内部数据
	keys := make([]*types.GatewayAPIKey, len(m.config.GatewayKeys))
	for i, key := range m.config.GatewayKeys {
		keyCopy := key
		keys[i] = &keyCopy
	}

	return keys
}

// UpdateGatewayKey 更新Gateway API Key
func (m *ConfigManager) UpdateGatewayKey(keyID string, updater func(*types.GatewayAPIKey) error) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.config == nil {
		return fmt.Errorf("配置未加载")
	}

	for i, key := range m.config.GatewayKeys {
		if key.ID == keyID {
			// 应用更新函数
			if err := updater(&m.config.GatewayKeys[i]); err != nil {
				return err
			}

			// 自动保存到文件
			return m.saveUnsafe(m.config)
		}
	}

	return fmt.Errorf("gateway API Key不存在: %s", keyID)
}

// DeleteGatewayKey 删除Gateway API Key
func (m *ConfigManager) DeleteGatewayKey(keyID string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.config == nil {
		return fmt.Errorf("配置未加载")
	}

	for i, key := range m.config.GatewayKeys {
		if key.ID == keyID {
			// 从切片中删除
			m.config.GatewayKeys = append(m.config.GatewayKeys[:i], m.config.GatewayKeys[i+1:]...)

			// 自动保存到文件
			return m.saveUnsafe(m.config)
		}
	}

	return fmt.Errorf("gateway API Key不存在: %s", keyID)
}

// ===== Upstream Accounts CRUD =====

// CreateUpstreamAccount 创建上游账号
func (m *ConfigManager) CreateUpstreamAccount(account *types.UpstreamAccount) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.config == nil {
		return fmt.Errorf("配置未加载")
	}

	// 检查ID是否已存在
	for _, existingAccount := range m.config.UpstreamAccounts {
		if existingAccount.ID == account.ID {
			return fmt.Errorf("上游账号ID已存在: %s", account.ID)
		}
	}

	// 添加到配置
	m.config.UpstreamAccounts = append(m.config.UpstreamAccounts, *account)

	// 自动保存到文件
	return m.saveUnsafe(m.config)
}

// GetUpstreamAccount 获取指定的上游账号
func (m *ConfigManager) GetUpstreamAccount(accountID string) (*types.UpstreamAccount, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	if m.config == nil {
		return nil, fmt.Errorf("配置未加载")
	}

	for _, account := range m.config.UpstreamAccounts {
		if account.ID == accountID {
			accountCopy := account // 避免返回内部数据的引用
			return &accountCopy, nil
		}
	}

	return nil, fmt.Errorf("上游账号不存在: %s", accountID)
}

// ListUpstreamAccounts 列出所有上游账号
func (m *ConfigManager) ListUpstreamAccounts() []*types.UpstreamAccount {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	if m.config == nil {
		return []*types.UpstreamAccount{}
	}

	// 返回副本避免外部修改内部数据
	accounts := make([]*types.UpstreamAccount, len(m.config.UpstreamAccounts))
	for i, account := range m.config.UpstreamAccounts {
		accountCopy := account
		accounts[i] = &accountCopy
	}

	return accounts
}

// ListActiveUpstreamAccounts 列出指定提供商的活跃上游账号
func (m *ConfigManager) ListActiveUpstreamAccounts(provider types.Provider) []*types.UpstreamAccount {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	if m.config == nil {
		return []*types.UpstreamAccount{}
	}

	var activeAccounts []*types.UpstreamAccount
	for _, account := range m.config.UpstreamAccounts {
		if account.Provider == provider && account.Status == "active" {
			accountCopy := account
			activeAccounts = append(activeAccounts, &accountCopy)
		}
	}

	return activeAccounts
}

// UpdateUpstreamAccount 更新上游账号
func (m *ConfigManager) UpdateUpstreamAccount(accountID string, updater func(*types.UpstreamAccount) error) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.config == nil {
		return fmt.Errorf("配置未加载")
	}

	for i, account := range m.config.UpstreamAccounts {
		if account.ID == accountID {
			// 应用更新函数
			if err := updater(&m.config.UpstreamAccounts[i]); err != nil {
				return err
			}

			// 自动保存到文件
			return m.saveUnsafe(m.config)
		}
	}

	return fmt.Errorf("上游账号不存在: %s", accountID)
}

// DeleteUpstreamAccount 删除上游账号
func (m *ConfigManager) DeleteUpstreamAccount(accountID string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.config == nil {
		return fmt.Errorf("配置未加载")
	}

	for i, account := range m.config.UpstreamAccounts {
		if account.ID == accountID {
			// 从切片中删除
			m.config.UpstreamAccounts = append(m.config.UpstreamAccounts[:i], m.config.UpstreamAccounts[i+1:]...)

			// 自动保存到文件
			return m.saveUnsafe(m.config)
		}
	}

	return fmt.Errorf("上游账号不存在: %s", accountID)
}

// GetConfigPath 获取配置文件路径
func (m *ConfigManager) GetConfigPath() string {
	return m.configPath
}

// applyEnvironmentConfig 应用环境变量配置
func (m *ConfigManager) applyEnvironmentConfig(config *types.Config) {
	// 设置HTTP代理环境变量
	if config.Environment.HTTPProxy != "" {
		_ = os.Setenv("HTTP_PROXY", config.Environment.HTTPProxy)
	}

	if config.Environment.HTTPSProxy != "" {
		_ = os.Setenv("HTTPS_PROXY", config.Environment.HTTPSProxy)
	}

	if config.Environment.NoProxy != "" {
		_ = os.Setenv("NO_PROXY", config.Environment.NoProxy)
	}
}
