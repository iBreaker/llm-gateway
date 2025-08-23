package client

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// ConfigManager 配置管理器接口
type ConfigManager interface {
	CreateGatewayKey(key *types.GatewayAPIKey) error
	GetGatewayKey(keyID string) (*types.GatewayAPIKey, error)
	ListGatewayKeys() []*types.GatewayAPIKey
	UpdateGatewayKey(keyID string, updater func(*types.GatewayAPIKey) error) error
	DeleteGatewayKey(keyID string) error
}

// GatewayKeyManager Gateway API Key业务管理器
type GatewayKeyManager struct {
	configMgr ConfigManager
}

// NewGatewayKeyManager 创建新的Gateway Key管理器
func NewGatewayKeyManager(configMgr ConfigManager) *GatewayKeyManager {
	return &GatewayKeyManager{
		configMgr: configMgr,
	}
}

// CreateKey 创建新的Gateway API Key（业务逻辑）
func (m *GatewayKeyManager) CreateKey(name string, permissions []types.Permission) (*types.GatewayAPIKey, string, error) {
	// 生成原始key
	rawKey, err := generateRandomKey(32)
	if err != nil {
		return nil, "", fmt.Errorf("生成密钥失败: %w", err)
	}

	// 计算hash
	keyHash := hashKey(rawKey)

	// 生成ID
	keyID := generateID("gw")

	// 创建key对象
	key := &types.GatewayAPIKey{
		ID:          keyID,
		Name:        name,
		KeyHash:     keyHash,
		Permissions: permissions,
		Status:      "active",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Usage: &types.KeyUsageStats{
			TotalRequests:      0,
			SuccessfulRequests: 0,
			ErrorRequests:      0,
			LastUsedAt:         time.Now(),
		},
	}

	// 通过ConfigManager保存
	if err := m.configMgr.CreateGatewayKey(key); err != nil {
		return nil, "", fmt.Errorf("保存密钥失败: %w", err)
	}

	return key, rawKey, nil
}

// ValidateKey 验证Gateway API Key（业务逻辑）
func (m *GatewayKeyManager) ValidateKey(rawKey string) (*types.GatewayAPIKey, error) {
	keyHash := hashKey(rawKey)

	// 从ConfigManager获取所有key
	keys := m.configMgr.ListGatewayKeys()

	for _, key := range keys {
		if key.KeyHash == keyHash && key.Status == "active" {
			return key, nil
		}
	}

	return nil, fmt.Errorf("无效的API密钥")
}

// GetKey 获取指定的Gateway API Key
func (m *GatewayKeyManager) GetKey(keyID string) (*types.GatewayAPIKey, error) {
	return m.configMgr.GetGatewayKey(keyID)
}

// ListKeys 列出所有Gateway API Key
func (m *GatewayKeyManager) ListKeys() []*types.GatewayAPIKey {
	return m.configMgr.ListGatewayKeys()
}

// DeleteKey 删除Gateway API Key
func (m *GatewayKeyManager) DeleteKey(keyID string) error {
	return m.configMgr.DeleteGatewayKey(keyID)
}

// UpdateKeyStatus 更新Gateway API Key状态（业务逻辑）
func (m *GatewayKeyManager) UpdateKeyStatus(keyID string, status string) error {
	return m.configMgr.UpdateGatewayKey(keyID, func(key *types.GatewayAPIKey) error {
		key.Status = status
		key.UpdatedAt = time.Now()
		return nil
	})
}

// UpdateKeyUsage 更新Gateway API Key使用统计（业务逻辑）
func (m *GatewayKeyManager) UpdateKeyUsage(keyID string, success bool, latency time.Duration) error {
	return m.configMgr.UpdateGatewayKey(keyID, func(key *types.GatewayAPIKey) error {
		if key.Usage == nil {
			key.Usage = &types.KeyUsageStats{}
		}

		key.Usage.TotalRequests++
		if success {
			key.Usage.SuccessfulRequests++
		} else {
			key.Usage.ErrorRequests++
			now := time.Now()
			key.Usage.LastErrorAt = &now
		}

		key.Usage.LastUsedAt = time.Now()

		// 更新平均延迟
		if key.Usage.TotalRequests > 0 {
			key.Usage.AvgLatency = (key.Usage.AvgLatency*float64(key.Usage.TotalRequests-1) + float64(latency.Milliseconds())) / float64(key.Usage.TotalRequests)
		}

		return nil
	})
}

// generateRandomKey 生成随机密钥
func generateRandomKey(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// hashKey 计算密钥hash
func hashKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}

// generateID 生成唯一ID
func generateID(prefix string) string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(bytes))
}
