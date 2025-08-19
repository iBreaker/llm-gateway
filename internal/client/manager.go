package client

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// GatewayKeyManager Gateway API Key管理器
type GatewayKeyManager struct {
	keys  map[string]*types.GatewayAPIKey
	mutex sync.RWMutex
}

// NewGatewayKeyManager 创建新的Gateway Key管理器
func NewGatewayKeyManager() *GatewayKeyManager {
	return &GatewayKeyManager{
		keys: make(map[string]*types.GatewayAPIKey),
	}
}

// CreateKey 创建新的Gateway API Key
func (m *GatewayKeyManager) CreateKey(name string, permissions []types.Permission) (*types.GatewayAPIKey, string, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	// 生成原始key
	rawKey, err := generateRandomKey(32)
	if err != nil {
		return nil, "", fmt.Errorf("生成密钥失败: %w", err)
	}

	// 计算hash
	keyHash := hashKey(rawKey)
	
	// 生成ID
	keyID := generateID("gw")

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
			LastUsedAt:        time.Now(),
		},
	}

	m.keys[keyID] = key
	return key, rawKey, nil
}

// ValidateKey 验证Gateway API Key
func (m *GatewayKeyManager) ValidateKey(rawKey string) (*types.GatewayAPIKey, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	keyHash := hashKey(rawKey)
	
	for _, key := range m.keys {
		if key.KeyHash == keyHash && key.Status == "active" {
			return key, nil
		}
	}
	
	return nil, fmt.Errorf("无效的API密钥")
}

// GetKey 获取指定的Gateway API Key
func (m *GatewayKeyManager) GetKey(keyID string) (*types.GatewayAPIKey, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	key, exists := m.keys[keyID]
	if !exists {
		return nil, fmt.Errorf("密钥不存在: %s", keyID)
	}
	
	return key, nil
}

// ListKeys 列出所有Gateway API Key
func (m *GatewayKeyManager) ListKeys() []*types.GatewayAPIKey {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	keys := make([]*types.GatewayAPIKey, 0, len(m.keys))
	for _, key := range m.keys {
		keys = append(keys, key)
	}
	
	return keys
}

// DeleteKey 删除Gateway API Key
func (m *GatewayKeyManager) DeleteKey(keyID string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if _, exists := m.keys[keyID]; !exists {
		return fmt.Errorf("密钥不存在: %s", keyID)
	}
	
	delete(m.keys, keyID)
	return nil
}

// UpdateKeyStatus 更新Gateway API Key状态
func (m *GatewayKeyManager) UpdateKeyStatus(keyID string, status string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	key, exists := m.keys[keyID]
	if !exists {
		return fmt.Errorf("密钥不存在: %s", keyID)
	}
	
	key.Status = status
	key.UpdatedAt = time.Now()
	return nil
}

// UpdateKeyUsage 更新Gateway API Key使用统计
func (m *GatewayKeyManager) UpdateKeyUsage(keyID string, success bool, latency time.Duration) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	key, exists := m.keys[keyID]
	if !exists {
		return fmt.Errorf("密钥不存在: %s", keyID)
	}
	
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