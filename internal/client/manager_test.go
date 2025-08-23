package client

import (
	"fmt"
	"testing"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// MockConfigManager 实现ConfigManager接口用于测试
type MockConfigManager struct {
	keys map[string]*types.GatewayAPIKey
}

func NewMockConfigManager() *MockConfigManager {
	return &MockConfigManager{
		keys: make(map[string]*types.GatewayAPIKey),
	}
}

func (m *MockConfigManager) CreateGatewayKey(key *types.GatewayAPIKey) error {
	m.keys[key.ID] = key
	return nil
}

func (m *MockConfigManager) GetGatewayKey(keyID string) (*types.GatewayAPIKey, error) {
	key, exists := m.keys[keyID]
	if !exists {
		return nil, fmt.Errorf("key not found: %s", keyID)
	}
	return key, nil
}

func (m *MockConfigManager) ListGatewayKeys() []*types.GatewayAPIKey {
	keys := make([]*types.GatewayAPIKey, 0, len(m.keys))
	for _, key := range m.keys {
		keys = append(keys, key)
	}
	return keys
}

func (m *MockConfigManager) UpdateGatewayKey(keyID string, updater func(*types.GatewayAPIKey) error) error {
	key, exists := m.keys[keyID]
	if !exists {
		return fmt.Errorf("key not found: %s", keyID)
	}
	return updater(key)
}

func (m *MockConfigManager) DeleteGatewayKey(keyID string) error {
	_, exists := m.keys[keyID]
	if !exists {
		return fmt.Errorf("key not found: %s", keyID)
	}
	delete(m.keys, keyID)
	return nil
}

func TestGatewayKeyManager_CreateKey(t *testing.T) {
	configMgr := NewMockConfigManager()
	mgr := NewGatewayKeyManager(configMgr)

	tests := []struct {
		name        string
		keyName     string
		permissions []types.Permission
		wantErr     bool
	}{
		{
			name:        "valid_read_write_key",
			keyName:     "test-key",
			permissions: []types.Permission{types.PermissionRead, types.PermissionWrite},
			wantErr:     false,
		},
		{
			name:        "valid_admin_key",
			keyName:     "admin-key",
			permissions: []types.Permission{types.PermissionAdmin},
			wantErr:     false,
		},
		{
			name:        "empty_name",
			keyName:     "",
			permissions: []types.Permission{types.PermissionRead},
			wantErr:     false, // 创建时不检查空名称
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, rawKey, err := mgr.CreateKey(tt.keyName, tt.permissions)

			if (err != nil) != tt.wantErr {
				t.Errorf("CreateKey() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				// 验证返回的key
				if key == nil {
					t.Fatal("CreateKey() returned nil key")
				}
				if rawKey == "" {
					t.Fatal("CreateKey() returned empty raw key")
				}
				if len(rawKey) != 64 { // 32 bytes -> 64 hex chars
					t.Errorf("CreateKey() raw key length = %d, want 64", len(rawKey))
				}

				// 验证key属性
				if key.Name != tt.keyName {
					t.Errorf("CreateKey() key.Name = %v, want %v", key.Name, tt.keyName)
				}
				if key.Status != "active" {
					t.Errorf("CreateKey() key.Status = %v, want active", key.Status)
				}
				if len(key.Permissions) != len(tt.permissions) {
					t.Errorf("CreateKey() permissions length = %d, want %d", len(key.Permissions), len(tt.permissions))
				}
				if key.Usage == nil {
					t.Error("CreateKey() key.Usage is nil")
				}

				// 验证key已保存到管理器
				savedKey, err := mgr.GetKey(key.ID)
				if err != nil {
					t.Errorf("GetKey() after CreateKey() error = %v", err)
				}
				if savedKey.ID != key.ID {
					t.Errorf("GetKey() returned different key ID")
				}
			}
		})
	}
}

func TestGatewayKeyManager_ValidateKey(t *testing.T) {
	configMgr := NewMockConfigManager()
	mgr := NewGatewayKeyManager(configMgr)

	// 创建一个测试key
	key, rawKey, err := mgr.CreateKey("test-key", []types.Permission{types.PermissionRead})
	if err != nil {
		t.Fatalf("CreateKey() error = %v", err)
	}

	tests := []struct {
		name    string
		rawKey  string
		wantErr bool
		wantID  string
	}{
		{
			name:    "valid_key",
			rawKey:  rawKey,
			wantErr: false,
			wantID:  key.ID,
		},
		{
			name:    "invalid_key",
			rawKey:  "invalid-key",
			wantErr: true,
		},
		{
			name:    "empty_key",
			rawKey:  "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			validatedKey, err := mgr.ValidateKey(tt.rawKey)

			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateKey() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				if validatedKey == nil {
					t.Fatal("ValidateKey() returned nil key")
				}
				if validatedKey.ID != tt.wantID {
					t.Errorf("ValidateKey() key.ID = %v, want %v", validatedKey.ID, tt.wantID)
				}
			}
		})
	}
}

func TestGatewayKeyManager_ValidateKey_DisabledKey(t *testing.T) {
	configMgr := NewMockConfigManager()
	mgr := NewGatewayKeyManager(configMgr)

	// 创建并禁用一个key
	key, rawKey, err := mgr.CreateKey("disabled-key", []types.Permission{types.PermissionRead})
	if err != nil {
		t.Fatalf("CreateKey() error = %v", err)
	}

	err = mgr.UpdateKeyStatus(key.ID, "disabled")
	if err != nil {
		t.Fatalf("UpdateKeyStatus() error = %v", err)
	}

	// 尝试验证被禁用的key
	_, err = mgr.ValidateKey(rawKey)
	if err == nil {
		t.Error("ValidateKey() should fail for disabled key")
	}
}

func TestGatewayKeyManager_ListKeys(t *testing.T) {
	configMgr := NewMockConfigManager()
	mgr := NewGatewayKeyManager(configMgr)

	// 初始状态应该为空
	keys := mgr.ListKeys()
	if len(keys) != 0 {
		t.Errorf("ListKeys() initial length = %d, want 0", len(keys))
	}

	// 创建几个key
	_, _, err := mgr.CreateKey("key1", []types.Permission{types.PermissionRead})
	if err != nil {
		t.Fatalf("CreateKey() error = %v", err)
	}

	_, _, err = mgr.CreateKey("key2", []types.Permission{types.PermissionWrite})
	if err != nil {
		t.Fatalf("CreateKey() error = %v", err)
	}

	// 检查列表
	keys = mgr.ListKeys()
	if len(keys) != 2 {
		t.Errorf("ListKeys() length = %d, want 2", len(keys))
	}
}

func TestGatewayKeyManager_DeleteKey(t *testing.T) {
	configMgr := NewMockConfigManager()
	mgr := NewGatewayKeyManager(configMgr)

	// 创建一个key
	key, _, err := mgr.CreateKey("test-key", []types.Permission{types.PermissionRead})
	if err != nil {
		t.Fatalf("CreateKey() error = %v", err)
	}

	// 删除key
	err = mgr.DeleteKey(key.ID)
	if err != nil {
		t.Errorf("DeleteKey() error = %v", err)
	}

	// 验证key已被删除
	_, err = mgr.GetKey(key.ID)
	if err == nil {
		t.Error("GetKey() should fail after DeleteKey()")
	}

	// 尝试删除不存在的key
	err = mgr.DeleteKey("non-existent")
	if err == nil {
		t.Error("DeleteKey() should fail for non-existent key")
	}
}

func TestGatewayKeyManager_UpdateKeyUsage(t *testing.T) {
	configMgr := NewMockConfigManager()
	mgr := NewGatewayKeyManager(configMgr)

	// 创建一个key
	key, _, err := mgr.CreateKey("test-key", []types.Permission{types.PermissionRead})
	if err != nil {
		t.Fatalf("CreateKey() error = %v", err)
	}

	// 更新使用统计 - 成功请求
	err = mgr.UpdateKeyUsage(key.ID, true, 100*time.Millisecond)
	if err != nil {
		t.Errorf("UpdateKeyUsage() error = %v", err)
	}

	// 验证统计信息
	updatedKey, err := mgr.GetKey(key.ID)
	if err != nil {
		t.Fatalf("GetKey() error = %v", err)
	}

	if updatedKey.Usage.TotalRequests != 1 {
		t.Errorf("Usage.TotalRequests = %d, want 1", updatedKey.Usage.TotalRequests)
	}
	if updatedKey.Usage.SuccessfulRequests != 1 {
		t.Errorf("Usage.SuccessfulRequests = %d, want 1", updatedKey.Usage.SuccessfulRequests)
	}
	if updatedKey.Usage.ErrorRequests != 0 {
		t.Errorf("Usage.ErrorRequests = %d, want 0", updatedKey.Usage.ErrorRequests)
	}

	// 更新使用统计 - 错误请求
	err = mgr.UpdateKeyUsage(key.ID, false, 200*time.Millisecond)
	if err != nil {
		t.Errorf("UpdateKeyUsage() error = %v", err)
	}

	// 验证统计信息
	updatedKey, err = mgr.GetKey(key.ID)
	if err != nil {
		t.Fatalf("GetKey() error = %v", err)
	}

	if updatedKey.Usage.TotalRequests != 2 {
		t.Errorf("Usage.TotalRequests = %d, want 2", updatedKey.Usage.TotalRequests)
	}
	if updatedKey.Usage.SuccessfulRequests != 1 {
		t.Errorf("Usage.SuccessfulRequests = %d, want 1", updatedKey.Usage.SuccessfulRequests)
	}
	if updatedKey.Usage.ErrorRequests != 1 {
		t.Errorf("Usage.ErrorRequests = %d, want 1", updatedKey.Usage.ErrorRequests)
	}
	if updatedKey.Usage.LastErrorAt == nil {
		t.Error("Usage.LastErrorAt should be set after error")
	}

	// 验证平均延迟计算
	expectedAvg := (100.0 + 200.0) / 2.0
	if updatedKey.Usage.AvgLatency != expectedAvg {
		t.Errorf("Usage.AvgLatency = %f, want %f", updatedKey.Usage.AvgLatency, expectedAvg)
	}
}
