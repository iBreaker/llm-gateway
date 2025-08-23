package upstream

import (
	"fmt"
	"testing"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// MockUpstreamConfigManager 实现ConfigManager接口用于测试
type MockUpstreamConfigManager struct {
	accounts map[string]*types.UpstreamAccount
}

func NewMockUpstreamConfigManager() *MockUpstreamConfigManager {
	return &MockUpstreamConfigManager{
		accounts: make(map[string]*types.UpstreamAccount),
	}
}

func (m *MockUpstreamConfigManager) CreateUpstreamAccount(account *types.UpstreamAccount) error {
	m.accounts[account.ID] = account
	return nil
}

func (m *MockUpstreamConfigManager) GetUpstreamAccount(accountID string) (*types.UpstreamAccount, error) {
	account, exists := m.accounts[accountID]
	if !exists {
		return nil, fmt.Errorf("account not found: %s", accountID)
	}
	return account, nil
}

func (m *MockUpstreamConfigManager) ListUpstreamAccounts() []*types.UpstreamAccount {
	accounts := make([]*types.UpstreamAccount, 0, len(m.accounts))
	for _, account := range m.accounts {
		accounts = append(accounts, account)
	}
	return accounts
}

func (m *MockUpstreamConfigManager) ListActiveUpstreamAccounts(provider types.Provider) []*types.UpstreamAccount {
	accounts := make([]*types.UpstreamAccount, 0)
	for _, account := range m.accounts {
		if account.Provider == provider && account.Status == "active" {
			accounts = append(accounts, account)
		}
	}
	return accounts
}

func (m *MockUpstreamConfigManager) UpdateUpstreamAccount(accountID string, updater func(*types.UpstreamAccount) error) error {
	account, exists := m.accounts[accountID]
	if !exists {
		return fmt.Errorf("account not found: %s", accountID)
	}
	return updater(account)
}

func (m *MockUpstreamConfigManager) DeleteUpstreamAccount(accountID string) error {
	_, exists := m.accounts[accountID]
	if !exists {
		return fmt.Errorf("account not found: %s", accountID)
	}
	delete(m.accounts, accountID)
	return nil
}

func TestUpstreamManager_AddAccount(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	tests := []struct {
		name    string
		account *types.UpstreamAccount
		wantErr bool
	}{
		{
			name: "valid_api_key_account",
			account: &types.UpstreamAccount{
				Name:     "test-anthropic",
				Type:     types.UpstreamTypeAPIKey,
				Provider: types.ProviderAnthropic,
				APIKey:   "sk-ant-test",
			},
			wantErr: false,
		},
		{
			name: "valid_oauth_account",
			account: &types.UpstreamAccount{
				Name:         "test-oauth",
				Type:         types.UpstreamTypeOAuth,
				Provider:     types.ProviderAnthropic,
				ClientID:     "test-client",
				ClientSecret: "test-secret",
			},
			wantErr: false,
		},
		{
			name: "account_without_id",
			account: &types.UpstreamAccount{
				Name:     "test-no-id",
				Type:     types.UpstreamTypeAPIKey,
				Provider: types.ProviderOpenAI,
				APIKey:   "sk-test",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mgr.AddAccount(tt.account)

			if (err != nil) != tt.wantErr {
				t.Errorf("AddAccount() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				// 验证账号已添加
				if tt.account.ID == "" {
					t.Error("AddAccount() should generate ID if not provided")
				}
				if tt.account.Status == "" {
					t.Error("AddAccount() should set default status")
				}
				if tt.account.Usage == nil {
					t.Error("AddAccount() should initialize usage stats")
				}

				// 验证可以获取账号
				account, err := mgr.GetAccount(tt.account.ID)
				if err != nil {
					t.Errorf("GetAccount() after AddAccount() error = %v", err)
				}
				if account.Name != tt.account.Name {
					t.Errorf("GetAccount() name = %v, want %v", account.Name, tt.account.Name)
				}
			}
		})
	}
}

func TestUpstreamManager_ListActiveAccounts(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	// 添加不同状态的账号
	account1 := &types.UpstreamAccount{
		Name:     "active-anthropic",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-1",
		Status:   "active",
	}
	account2 := &types.UpstreamAccount{
		Name:     "disabled-anthropic",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-2",
		Status:   "disabled",
	}
	account3 := &types.UpstreamAccount{
		Name:     "active-openai",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderOpenAI,
		APIKey:   "sk-openai-1",
		Status:   "active",
	}

	_ = mgr.AddAccount(account1)
	_ = mgr.AddAccount(account2)
	_ = mgr.AddAccount(account3)

	// 测试ListActiveAccounts
	activeAnthropic := mgr.ListActiveAccounts(types.ProviderAnthropic)
	if len(activeAnthropic) != 1 {
		t.Errorf("ListActiveAccounts(Anthropic) length = %d, want 1", len(activeAnthropic))
	} else {
		if activeAnthropic[0].Name != "active-anthropic" {
			t.Errorf("ListActiveAccounts(Anthropic)[0].Name = %v, want active-anthropic", activeAnthropic[0].Name)
		}
	}

	activeOpenAI := mgr.ListActiveAccounts(types.ProviderOpenAI)
	if len(activeOpenAI) != 1 {
		t.Errorf("ListActiveAccounts(OpenAI) length = %d, want 1", len(activeOpenAI))
	}

	activeGoogle := mgr.ListActiveAccounts(types.ProviderGoogle)
	if len(activeGoogle) != 0 {
		t.Errorf("ListActiveAccounts(Google) length = %d, want 0", len(activeGoogle))
	}
}

func TestUpstreamManager_UpdateAccountStatus(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	// 添加一个账号
	account := &types.UpstreamAccount{
		Name:     "test-account",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-test",
	}
	_ = mgr.AddAccount(account)

	// 更新状态
	err := mgr.UpdateAccountStatus(account.ID, "disabled")
	if err != nil {
		t.Errorf("UpdateAccountStatus() error = %v", err)
	}

	// 验证状态已更新
	updatedAccount, err := mgr.GetAccount(account.ID)
	if err != nil {
		t.Fatalf("GetAccount() error = %v", err)
	}
	if updatedAccount.Status != "disabled" {
		t.Errorf("UpdateAccountStatus() status = %v, want disabled", updatedAccount.Status)
	}

	// 测试更新不存在的账号
	err = mgr.UpdateAccountStatus("non-existent", "active")
	if err == nil {
		t.Error("UpdateAccountStatus() should fail for non-existent account")
	}
}

func TestUpstreamManager_UpdateAccountHealth(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	// 添加一个账号
	account := &types.UpstreamAccount{
		Name:     "test-account",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-test",
	}
	_ = mgr.AddAccount(account)

	// 更新健康状态为healthy
	err := mgr.UpdateAccountHealth(account.ID, true)
	if err != nil {
		t.Errorf("UpdateAccountHealth() error = %v", err)
	}

	// 验证健康状态已更新
	updatedAccount, err := mgr.GetAccount(account.ID)
	if err != nil {
		t.Fatalf("GetAccount() error = %v", err)
	}
	if updatedAccount.HealthStatus != "healthy" {
		t.Errorf("UpdateAccountHealth() HealthStatus = %v, want healthy", updatedAccount.HealthStatus)
	}
	if updatedAccount.LastHealthCheck == nil {
		t.Error("UpdateAccountHealth() should set LastHealthCheck")
	}

	// 更新健康状态为unhealthy
	err = mgr.UpdateAccountHealth(account.ID, false)
	if err != nil {
		t.Errorf("UpdateAccountHealth() error = %v", err)
	}

	updatedAccount, err = mgr.GetAccount(account.ID)
	if err != nil {
		t.Fatalf("GetAccount() error = %v", err)
	}
	if updatedAccount.HealthStatus != "unhealthy" {
		t.Errorf("UpdateAccountHealth() HealthStatus = %v, want unhealthy", updatedAccount.HealthStatus)
	}
}

func TestUpstreamManager_RecordSuccess(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	// 添加一个账号
	account := &types.UpstreamAccount{
		Name:     "test-account",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-test",
	}
	_ = mgr.AddAccount(account)

	// 记录成功请求
	latency := 150 * time.Millisecond
	tokensUsed := int64(100)
	err := mgr.RecordSuccess(account.ID, latency, tokensUsed)
	if err != nil {
		t.Errorf("RecordSuccess() error = %v", err)
	}

	// 验证统计信息
	updatedAccount, err := mgr.GetAccount(account.ID)
	if err != nil {
		t.Fatalf("GetAccount() error = %v", err)
	}

	if updatedAccount.Usage.TotalRequests != 1 {
		t.Errorf("RecordSuccess() TotalRequests = %d, want 1", updatedAccount.Usage.TotalRequests)
	}
	if updatedAccount.Usage.SuccessfulRequests != 1 {
		t.Errorf("RecordSuccess() SuccessfulRequests = %d, want 1", updatedAccount.Usage.SuccessfulRequests)
	}
	if updatedAccount.Usage.TokensUsed != tokensUsed {
		t.Errorf("RecordSuccess() TokensUsed = %d, want %d", updatedAccount.Usage.TokensUsed, tokensUsed)
	}
	if updatedAccount.Usage.AvgLatency != float64(latency.Milliseconds()) {
		t.Errorf("RecordSuccess() AvgLatency = %f, want %f", updatedAccount.Usage.AvgLatency, float64(latency.Milliseconds()))
	}
	if updatedAccount.Usage.ErrorRate != 0 {
		t.Errorf("RecordSuccess() ErrorRate = %f, want 0", updatedAccount.Usage.ErrorRate)
	}
}

func TestUpstreamManager_RecordError(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	// 添加一个账号
	account := &types.UpstreamAccount{
		Name:     "test-account",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-test",
	}
	_ = mgr.AddAccount(account)

	// 记录错误请求
	testErr := fmt.Errorf("test error")
	err := mgr.RecordError(account.ID, testErr)
	if err != nil {
		t.Errorf("RecordError() error = %v", err)
	}

	// 验证统计信息
	updatedAccount, err := mgr.GetAccount(account.ID)
	if err != nil {
		t.Fatalf("GetAccount() error = %v", err)
	}

	if updatedAccount.Usage.TotalRequests != 1 {
		t.Errorf("RecordError() TotalRequests = %d, want 1", updatedAccount.Usage.TotalRequests)
	}
	if updatedAccount.Usage.ErrorRequests != 1 {
		t.Errorf("RecordError() ErrorRequests = %d, want 1", updatedAccount.Usage.ErrorRequests)
	}
	if updatedAccount.Usage.ErrorRate != 1.0 {
		t.Errorf("RecordError() ErrorRate = %f, want 1.0", updatedAccount.Usage.ErrorRate)
	}
	if updatedAccount.Usage.LastErrorAt == nil {
		t.Error("RecordError() should set LastErrorAt")
	}
}

func TestUpstreamManager_UpdateOAuthTokens(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	// 添加一个OAuth账号
	account := &types.UpstreamAccount{
		Name:         "test-oauth",
		Type:         types.UpstreamTypeOAuth,
		Provider:     types.ProviderAnthropic,
		ClientID:     "test-client",
		ClientSecret: "test-secret",
	}
	_ = mgr.AddAccount(account)

	// 更新OAuth tokens
	accessToken := "new-access-token"
	refreshToken := "new-refresh-token"
	expiresAt := time.Now().Add(1 * time.Hour)

	err := mgr.UpdateOAuthTokens(account.ID, accessToken, refreshToken, expiresAt)
	if err != nil {
		t.Errorf("UpdateOAuthTokens() error = %v", err)
	}

	// 验证tokens已更新
	updatedAccount, err := mgr.GetAccount(account.ID)
	if err != nil {
		t.Fatalf("GetAccount() error = %v", err)
	}

	if updatedAccount.AccessToken != accessToken {
		t.Errorf("UpdateOAuthTokens() AccessToken = %v, want %v", updatedAccount.AccessToken, accessToken)
	}
	if updatedAccount.RefreshToken != refreshToken {
		t.Errorf("UpdateOAuthTokens() RefreshToken = %v, want %v", updatedAccount.RefreshToken, refreshToken)
	}
	if updatedAccount.ExpiresAt == nil || !updatedAccount.ExpiresAt.Equal(expiresAt) {
		t.Errorf("UpdateOAuthTokens() ExpiresAt = %v, want %v", updatedAccount.ExpiresAt, expiresAt)
	}
	if updatedAccount.Status != "active" {
		t.Errorf("UpdateOAuthTokens() Status = %v, want active", updatedAccount.Status)
	}

	// 测试更新非OAuth账号的tokens
	apiKeyAccount := &types.UpstreamAccount{
		Name:     "test-api-key",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-test",
	}
	_ = mgr.AddAccount(apiKeyAccount)

	err = mgr.UpdateOAuthTokens(apiKeyAccount.ID, accessToken, refreshToken, expiresAt)
	if err == nil {
		t.Error("UpdateOAuthTokens() should fail for non-OAuth account")
	}
}

func TestUpstreamManager_IsTokenExpired(t *testing.T) {
	configMgr := NewMockUpstreamConfigManager()
	mgr := NewUpstreamManager(configMgr)

	// 添加一个OAuth账号
	account := &types.UpstreamAccount{
		Name:         "test-oauth",
		Type:         types.UpstreamTypeOAuth,
		Provider:     types.ProviderAnthropic,
		ClientID:     "test-client",
		ClientSecret: "test-secret",
	}
	_ = mgr.AddAccount(account)

	// 测试没有过期时间的情况
	expired, err := mgr.IsTokenExpired(account.ID)
	if err != nil {
		t.Errorf("IsTokenExpired() error = %v", err)
	}
	if !expired {
		t.Error("IsTokenExpired() should return true when ExpiresAt is nil")
	}

	// 设置未来的过期时间
	futureTime := time.Now().Add(1 * time.Hour)
	err = mgr.UpdateOAuthTokens(account.ID, account.AccessToken, account.RefreshToken, futureTime)
	if err != nil {
		t.Fatalf("UpdateOAuthTokens() error = %v", err)
	}

	expired, err = mgr.IsTokenExpired(account.ID)
	if err != nil {
		t.Errorf("IsTokenExpired() error = %v", err)
	}
	if expired {
		t.Error("IsTokenExpired() should return false for future expiration")
	}

	// 设置过去的过期时间
	pastTime := time.Now().Add(-1 * time.Hour)
	err = mgr.UpdateOAuthTokens(account.ID, account.AccessToken, account.RefreshToken, pastTime)
	if err != nil {
		t.Fatalf("UpdateOAuthTokens() error = %v", err)
	}

	expired, err = mgr.IsTokenExpired(account.ID)
	if err != nil {
		t.Errorf("IsTokenExpired() error = %v", err)
	}
	if !expired {
		t.Error("IsTokenExpired() should return true for past expiration")
	}

	// 测试非OAuth账号
	apiKeyAccount := &types.UpstreamAccount{
		Name:     "test-api-key",
		Type:     types.UpstreamTypeAPIKey,
		Provider: types.ProviderAnthropic,
		APIKey:   "sk-ant-test",
	}
	_ = mgr.AddAccount(apiKeyAccount)

	_, err = mgr.IsTokenExpired(apiKeyAccount.ID)
	if err == nil {
		t.Error("IsTokenExpired() should fail for non-OAuth account")
	}
}
