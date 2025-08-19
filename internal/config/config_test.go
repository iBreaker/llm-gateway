package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

func TestConfigManager_LoadDefaultConfig(t *testing.T) {
	// 创建临时目录
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "test_config.yaml")

	mgr := NewConfigManager(configPath)

	// 加载不存在的配置文件应该创建默认配置
	config, err := mgr.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// 验证默认配置
	if config.Server.Host != "0.0.0.0" {
		t.Errorf("Default server host = %v, want 0.0.0.0", config.Server.Host)
	}
	if config.Server.Port != 8080 {
		t.Errorf("Default server port = %d, want 8080", config.Server.Port)
	}
	if config.Server.Timeout != 30 {
		t.Errorf("Default server timeout = %d, want 30", config.Server.Timeout)
	}
	if config.Logging.Level != "info" {
		t.Errorf("Default logging level = %v, want info", config.Logging.Level)
	}

	// 验证配置文件已创建
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Error("Load() should create config file when it doesn't exist")
	}
}

func TestConfigManager_SaveAndLoad(t *testing.T) {
	// 创建临时目录
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "test_config.yaml")

	mgr := NewConfigManager(configPath)

	// 创建测试配置
	testConfig := &types.Config{
		Server: types.ServerConfig{
			Host:    "localhost",
			Port:    9090,
			Timeout: 60,
		},
		GatewayKeys: []types.GatewayAPIKey{
			{
				ID:          "test-key-1",
				Name:        "Test Key",
				KeyHash:     "test-hash",
				Permissions: []types.Permission{types.PermissionRead, types.PermissionWrite},
				Status:      "active",
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
		},
		UpstreamAccounts: []types.UpstreamAccount{
			{
				ID:       "test-upstream-1",
				Name:     "Test Upstream",
				Type:     types.UpstreamTypeAPIKey,
				Provider: types.ProviderAnthropic,
				APIKey:   "sk-ant-test",
				Status:   "active",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
		},
		Logging: types.LoggingConfig{
			Level:  "debug",
			Format: "text",
			File:   "/tmp/test.log",
		},
	}

	// 保存配置
	err := mgr.Save(testConfig)
	if err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	// 重新加载配置
	loadedConfig, err := mgr.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// 验证配置正确加载
	if loadedConfig.Server.Host != testConfig.Server.Host {
		t.Errorf("Loaded server host = %v, want %v", loadedConfig.Server.Host, testConfig.Server.Host)
	}
	if loadedConfig.Server.Port != testConfig.Server.Port {
		t.Errorf("Loaded server port = %d, want %d", loadedConfig.Server.Port, testConfig.Server.Port)
	}
	if len(loadedConfig.GatewayKeys) != len(testConfig.GatewayKeys) {
		t.Errorf("Loaded gateway keys count = %d, want %d", len(loadedConfig.GatewayKeys), len(testConfig.GatewayKeys))
	}
	if len(loadedConfig.UpstreamAccounts) != len(testConfig.UpstreamAccounts) {
		t.Errorf("Loaded upstream accounts count = %d, want %d", len(loadedConfig.UpstreamAccounts), len(testConfig.UpstreamAccounts))
	}

	// 验证Gateway Key详细信息
	if len(loadedConfig.GatewayKeys) > 0 {
		loadedKey := loadedConfig.GatewayKeys[0]
		testKey := testConfig.GatewayKeys[0]
		if loadedKey.ID != testKey.ID {
			t.Errorf("Loaded key ID = %v, want %v", loadedKey.ID, testKey.ID)
		}
		if loadedKey.Name != testKey.Name {
			t.Errorf("Loaded key name = %v, want %v", loadedKey.Name, testKey.Name)
		}
		if len(loadedKey.Permissions) != len(testKey.Permissions) {
			t.Errorf("Loaded key permissions count = %d, want %d", len(loadedKey.Permissions), len(testKey.Permissions))
		}
	}

	// 验证上游账号详细信息
	if len(loadedConfig.UpstreamAccounts) > 0 {
		loadedAccount := loadedConfig.UpstreamAccounts[0]
		testAccount := testConfig.UpstreamAccounts[0]
		if loadedAccount.ID != testAccount.ID {
			t.Errorf("Loaded account ID = %v, want %v", loadedAccount.ID, testAccount.ID)
		}
		if loadedAccount.Provider != testAccount.Provider {
			t.Errorf("Loaded account provider = %v, want %v", loadedAccount.Provider, testAccount.Provider)
		}
	}
}

func TestConfigManager_Validate(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "test_config.yaml")
	mgr := NewConfigManager(configPath)

	tests := []struct {
		name    string
		config  *types.Config
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid_config",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "localhost",
					Port:    8080,
					Timeout: 30,
				},
				GatewayKeys: []types.GatewayAPIKey{
					{
						ID:          "valid-key",
						Name:        "Valid Key",
						KeyHash:     "hash123",
						Permissions: []types.Permission{types.PermissionRead},
						Status:      "active",
					},
				},
				UpstreamAccounts: []types.UpstreamAccount{
					{
						ID:       "valid-upstream",
						Name:     "Valid Upstream",
						Type:     types.UpstreamTypeAPIKey,
						Provider: types.ProviderAnthropic,
						APIKey:   "sk-ant-test",
					},
				},
				Logging: types.LoggingConfig{
					Level: "info",
				},
			},
			wantErr: false,
		},
		{
			name: "invalid_port",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "localhost",
					Port:    0, // 无效端口
					Timeout: 30,
				},
			},
			wantErr: true,
			errMsg:  "无效的端口号",
		},
		{
			name: "invalid_port_too_high",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "localhost",
					Port:    70000, // 端口号太大
					Timeout: 30,
				},
			},
			wantErr: true,
			errMsg:  "无效的端口号",
		},
		{
			name: "empty_host",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "", // 空主机地址
					Port:    8080,
					Timeout: 30,
				},
			},
			wantErr: true,
			errMsg:  "服务器地址不能为空",
		},
		{
			name: "gateway_key_missing_id",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "localhost",
					Port:    8080,
					Timeout: 30,
				},
				GatewayKeys: []types.GatewayAPIKey{
					{
						ID:   "", // 缺少ID
						Name: "Test Key",
					},
				},
			},
			wantErr: true,
			errMsg:  "ID不能为空",
		},
		{
			name: "gateway_key_missing_name",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "localhost",
					Port:    8080,
					Timeout: 30,
				},
				GatewayKeys: []types.GatewayAPIKey{
					{
						ID:   "test-key",
						Name: "", // 缺少名称
					},
				},
			},
			wantErr: true,
			errMsg:  "名称不能为空",
		},
		{
			name: "upstream_api_key_missing_key",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "localhost",
					Port:    8080,
					Timeout: 30,
				},
				UpstreamAccounts: []types.UpstreamAccount{
					{
						ID:       "test-upstream",
						Name:     "Test Upstream",
						Type:     types.UpstreamTypeAPIKey,
						Provider: types.ProviderAnthropic,
						APIKey:   "", // 缺少API Key
					},
				},
			},
			wantErr: true,
			errMsg:  "API Key不能为空",
		},
		{
			name: "upstream_oauth_missing_client_id",
			config: &types.Config{
				Server: types.ServerConfig{
					Host:    "localhost",
					Port:    8080,
					Timeout: 30,
				},
				UpstreamAccounts: []types.UpstreamAccount{
					{
						ID:           "test-upstream",
						Name:         "Test Upstream",
						Type:         types.UpstreamTypeOAuth,
						Provider:     types.ProviderAnthropic,
						ClientID:     "", // 缺少Client ID
						ClientSecret: "secret",
					},
				},
			},
			wantErr: true,
			errMsg:  "Client ID不能为空",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 设置配置到管理器
			mgr.config = tt.config

			err := mgr.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if tt.wantErr && err != nil {
				if tt.errMsg != "" && err.Error() != "" {
					// 检查错误消息是否包含预期的文本
					if !contains(err.Error(), tt.errMsg) {
						t.Errorf("Validate() error = %v, want error containing %v", err.Error(), tt.errMsg)
					}
				}
			}
		})
	}
}

func TestConfigManager_Reload(t *testing.T) {
	// 创建临时目录
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "test_config.yaml")

	mgr := NewConfigManager(configPath)

	// 创建初始配置
	initialConfig := &types.Config{
		Server: types.ServerConfig{
			Host: "localhost",
			Port: 8080,
		},
	}
	mgr.Save(initialConfig)

	// 加载配置
	config1, err := mgr.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	// 修改配置文件内容
	modifiedConfig := &types.Config{
		Server: types.ServerConfig{
			Host: "0.0.0.0",
			Port: 9090,
		},
	}
	mgr.Save(modifiedConfig)

	// 重新加载
	config2, err := mgr.Reload()
	if err != nil {
		t.Fatalf("Reload() error = %v", err)
	}

	// 验证配置已更新
	if config2.Server.Host == config1.Server.Host {
		t.Error("Reload() should load updated configuration")
	}
	if config2.Server.Host != "0.0.0.0" {
		t.Errorf("Reload() host = %v, want 0.0.0.0", config2.Server.Host)
	}
	if config2.Server.Port != 9090 {
		t.Errorf("Reload() port = %d, want 9090", config2.Server.Port)
	}
}

func TestConfigManager_GetConfigPath(t *testing.T) {
	configPath := "/tmp/test_config.yaml"
	mgr := NewConfigManager(configPath)

	if mgr.GetConfigPath() != configPath {
		t.Errorf("GetConfigPath() = %v, want %v", mgr.GetConfigPath(), configPath)
	}
}

func TestConfigManager_Get(t *testing.T) {
	mgr := NewConfigManager("/tmp/test.yaml")

	// 初始状态应该返回nil
	if mgr.Get() != nil {
		t.Error("Get() should return nil before loading config")
	}

	// 加载配置后应该返回配置
	config, err := mgr.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	retrievedConfig := mgr.Get()
	if retrievedConfig != config {
		t.Error("Get() should return the loaded config")
	}
}

// contains 检查字符串是否包含子字符串
func contains(s, substr string) bool {
	return len(s) >= len(substr) && 
		   (s == substr || 
		    (len(s) > len(substr) && 
		     (s[:len(substr)] == substr || 
		      s[len(s)-len(substr):] == substr || 
		      indexOfSubstring(s, substr) >= 0)))
}

// indexOfSubstring 查找子字符串在字符串中的位置
func indexOfSubstring(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}