package upstream

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/logger"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// OAuthManager OAuth管理器
type OAuthManager struct {
	upstreamMgr   *UpstreamManager
	httpClient    *http.Client
	pkceVerifiers map[string]string // 存储每个OAuth流程的code_verifier
}

// NewOAuthManager 创建新的OAuth管理器
func NewOAuthManager(upstreamMgr *UpstreamManager) *OAuthManager {
	// 创建支持代理的HTTP客户端
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment, // 自动读取HTTP_PROXY/HTTPS_PROXY环境变量
	}

	return &OAuthManager{
		upstreamMgr:   upstreamMgr,
		pkceVerifiers: make(map[string]string),
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: transport,
		},
	}
}

// AnthropicOAuthConfig Anthropic OAuth配置
type AnthropicOAuthConfig struct {
	AuthURL     string
	TokenURL    string
	ClientID    string
	RedirectURI string
	Scope       string
}

// QwenOAuthConfig Qwen OAuth配置 (Device Flow)
type QwenOAuthConfig struct {
	DeviceAuthURL string
	TokenURL      string
	ClientID      string
	Scope         string
}

const (
	// Anthropic Claude Code OAuth 固定配置
	AnthropicClientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	// 不同的scope配置
	ScopesFull  = "org:create_api_key user:profile user:inference"
	ScopesSetup = "user:inference"

	// Qwen OAuth 固定配置
	QwenClientID = "f0304373b74a44d2b584a3fb70ca9e56"
	QwenScope    = "openid profile email model.completion"
)

// generateRandomString 生成随机字符串
func generateRandomString() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("生成随机字符串失败: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

// generatePKCE 生成PKCE参数
func generatePKCE() (codeVerifier, codeChallenge string, err error) {
	// 生成code_verifier
	codeVerifier, err = generateRandomString()
	if err != nil {
		return "", "", fmt.Errorf("生成code_verifier失败: %w", err)
	}

	// 生成code_challenge (SHA256哈希后base64url编码)
	hash := sha256.Sum256([]byte(codeVerifier))
	codeChallenge = base64.RawURLEncoding.EncodeToString(hash[:])

	return codeVerifier, codeChallenge, nil
}

// getAnthropicConfig 获取Anthropic OAuth配置
func (m *OAuthManager) getAnthropicConfig() AnthropicOAuthConfig {
	return AnthropicOAuthConfig{
		AuthURL:     "https://claude.ai/oauth/authorize",
		TokenURL:    "https://console.anthropic.com/v1/oauth/token",
		ClientID:    AnthropicClientID,
		RedirectURI: "https://console.anthropic.com/oauth/code/callback", // 使用官方回调地址，会显示code
		Scope:       ScopesFull,                                          // 使用完整scope
	}
}

// getQwenConfig 获取Qwen OAuth配置
func (m *OAuthManager) getQwenConfig() QwenOAuthConfig {
	return QwenOAuthConfig{
		DeviceAuthURL: "https://chat.qwen.ai/api/v1/oauth2/device/code",
		TokenURL:      "https://chat.qwen.ai/api/v1/oauth2/token",
		ClientID:      QwenClientID,
		Scope:         QwenScope,
	}
}

// StartOAuthFlow 启动OAuth授权流程
func (m *OAuthManager) StartOAuthFlow(upstreamID string) (string, error) {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return "", err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return "", fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	// 根据provider分发到不同的OAuth流程实现
	switch account.Provider {
	case types.ProviderAnthropic:
		return m.startAnthropicOAuth(upstreamID, account)
	case types.ProviderQwen:
		return m.startQwenOAuth(upstreamID, account)
	default:
		return "", fmt.Errorf("不支持的OAuth provider: %s", account.Provider)
	}
}

// startAnthropicOAuth 启动Anthropic OAuth授权流程
func (m *OAuthManager) startAnthropicOAuth(upstreamID string, account *types.UpstreamAccount) (string, error) {
	config := m.getAnthropicConfig()

	// 生成PKCE参数
	codeVerifier, codeChallenge, err := generatePKCE()
	if err != nil {
		return "", fmt.Errorf("生成PKCE参数失败: %w", err)
	}

	// 生成随机state参数
	state, err := generateRandomString()
	if err != nil {
		return "", fmt.Errorf("生成state参数失败: %w", err)
	}

	// 存储code_verifier和state用于后续验证
	m.pkceVerifiers[upstreamID] = codeVerifier
	// TODO: 也需要存储state用于验证

	// 构建授权URL - 按照工作示例的确切顺序
	params := url.Values{}
	params.Add("code", "true")
	params.Add("client_id", config.ClientID)
	params.Add("response_type", "code")
	params.Add("redirect_uri", config.RedirectURI)
	params.Add("scope", config.Scope)
	params.Add("code_challenge", codeChallenge)
	params.Add("code_challenge_method", "S256")
	params.Add("state", state)

	authURL := fmt.Sprintf("%s?%s", config.AuthURL, params.Encode())
	return authURL, nil
}

// startQwenOAuth 启动Qwen OAuth Device Flow授权流程
func (m *OAuthManager) startQwenOAuth(upstreamID string, account *types.UpstreamAccount) (string, error) {
	config := m.getQwenConfig()

	// 生成PKCE参数（Qwen Device Flow也需要PKCE）
	codeVerifier, codeChallenge, err := generatePKCE()
	if err != nil {
		return "", fmt.Errorf("生成PKCE参数失败: %w", err)
	}

	// 构建设备授权请求
	deviceReq := map[string]string{
		"client_id":             config.ClientID,
		"scope":                 config.Scope,
		"code_challenge":        codeChallenge,
		"code_challenge_method": "S256",
	}

	// 发送设备授权请求
	deviceResp, err := m.requestQwenDeviceCode(config.DeviceAuthURL, deviceReq)
	if err != nil {
		return "", fmt.Errorf("请求设备授权码失败: %w", err)
	}

	// 存储device_code和code_verifier用于后续轮询
	m.pkceVerifiers[upstreamID] = fmt.Sprintf("%s|%s", deviceResp.DeviceCode, codeVerifier)

	// 启动自动轮询
	go m.pollQwenToken(upstreamID, deviceResp.DeviceCode, codeVerifier, deviceResp.Interval, deviceResp.ExpiresIn)

	// 返回Device Flow的授权指引
	return fmt.Sprintf("请访问: https://chat.qwen.ai/authorize?user_code=%s&client=llm-gateway\n正在等待授权完成...",
		deviceResp.UserCode), nil
}

// HandleCallback 处理OAuth回调
func (m *OAuthManager) HandleCallback(upstreamID string, code string) error {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	// 根据provider分发到不同的回调处理实现
	switch account.Provider {
	case types.ProviderAnthropic:
		return m.handleAnthropicCallback(upstreamID, code, account)
	case types.ProviderQwen:
		return m.handleQwenCallback(upstreamID, code, account)
	default:
		return fmt.Errorf("不支持的OAuth provider: %s", account.Provider)
	}
}

// handleAnthropicCallback 处理Anthropic OAuth回调
func (m *OAuthManager) handleAnthropicCallback(upstreamID string, code string, account *types.UpstreamAccount) error {
	config := m.getAnthropicConfig()

	// 获取存储的code_verifier
	codeVerifier, exists := m.pkceVerifiers[upstreamID]
	if !exists {
		return fmt.Errorf("未找到对应的code_verifier，请重新启动OAuth流程")
	}

	// 清理授权码 - 移除URL片段和其他参数
	cleanedCode := code
	if idx := strings.Index(code, "#"); idx != -1 {
		cleanedCode = code[:idx]
	}
	if idx := strings.Index(cleanedCode, "&"); idx != -1 {
		cleanedCode = cleanedCode[:idx]
	}

	// 交换authorization code获取access token
	tokenReq := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     config.ClientID,
		"code":          cleanedCode,
		"redirect_uri":  config.RedirectURI,
		"code_verifier": codeVerifier,
		"state":         upstreamID,
	}

	tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq, types.ProviderAnthropic)
	if err != nil {
		return fmt.Errorf("交换token失败: %w", err)
	}

	// 计算过期时间
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// 更新账号token信息
	err = m.upstreamMgr.UpdateOAuthTokens(
		upstreamID,
		tokenResp.AccessToken,
		tokenResp.RefreshToken,
		expiresAt,
	)

	// 清理存储的code_verifier (无论成功还是失败都要清理)
	delete(m.pkceVerifiers, upstreamID)

	return err
}

// handleQwenCallback 处理Qwen OAuth回调 (Device Flow)
func (m *OAuthManager) handleQwenCallback(upstreamID string, code string, account *types.UpstreamAccount) error {
	// Qwen使用Device Flow，系统会自动轮询，不需要手动回调
	return fmt.Errorf("qwen OAuth使用Device Flow自动轮询，无需手动回调。请等待授权完成")
}

// RefreshToken 刷新OAuth token
func (m *OAuthManager) RefreshToken(upstreamID string) error {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	if account.RefreshToken == "" {
		return fmt.Errorf("没有refresh token")
	}

	// 根据provider分发到不同的刷新逻辑
	switch account.Provider {
	case types.ProviderAnthropic:
		return m.refreshAnthropicToken(upstreamID, account)
	case types.ProviderQwen:
		return m.refreshQwenToken(upstreamID, account)
	default:
		return fmt.Errorf("不支持的OAuth provider: %s", account.Provider)
	}
}

// refreshAnthropicToken 刷新Anthropic OAuth token
func (m *OAuthManager) refreshAnthropicToken(upstreamID string, account *types.UpstreamAccount) error {
	config := m.getAnthropicConfig()

	// 使用refresh token获取新的access token
	tokenReq := map[string]string{
		"grant_type":    "refresh_token",
		"client_id":     config.ClientID,
		"refresh_token": account.RefreshToken,
	}

	tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq, types.ProviderAnthropic)
	if err != nil {
		// 如果refresh token失效，标记账号状态为需要重新授权
		if strings.Contains(err.Error(), "invalid_grant") ||
			strings.Contains(err.Error(), "Refresh token not found") {
			// 清除失效的token信息，但保留账号配置
			_ = m.upstreamMgr.UpdateOAuthTokens(upstreamID, "", "", time.Time{})
			return fmt.Errorf("refresh token已失效，需要重新进行OAuth授权: ./llm-gateway oauth start %s", upstreamID)
		}
		return fmt.Errorf("刷新token失败: %w", err)
	}

	// 计算新的过期时间
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// 更新账号token信息 - 如果响应中没有新的refresh token，使用原来的
	newRefreshToken := tokenResp.RefreshToken
	if newRefreshToken == "" {
		newRefreshToken = account.RefreshToken
	}

	// 更新账号token信息
	return m.upstreamMgr.UpdateOAuthTokens(
		upstreamID,
		tokenResp.AccessToken,
		newRefreshToken,
		expiresAt,
	)
}

// refreshQwenToken 刷新Qwen OAuth token
func (m *OAuthManager) refreshQwenToken(upstreamID string, account *types.UpstreamAccount) error {
	config := m.getQwenConfig()

	// 使用refresh token获取新的access token
	tokenReq := map[string]string{
		"grant_type":    "refresh_token",
		"client_id":     config.ClientID,
		"refresh_token": account.RefreshToken,
	}

	tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq, types.ProviderQwen)
	if err != nil {
		// 如果refresh token失效，清除token信息
		if strings.Contains(err.Error(), "invalid_grant") ||
			strings.Contains(err.Error(), "refresh_token not found") {
			// 清除失效的token信息，但保留账号配置
			_ = m.upstreamMgr.UpdateOAuthTokens(upstreamID, "", "", time.Time{})
			return fmt.Errorf("refresh token已失效，需要重新进行OAuth授权: ./llm-gateway oauth start %s", upstreamID)
		}
		return fmt.Errorf("刷新token失败: %w", err)
	}

	// 计算新的过期时间
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// 更新账号token信息 - 如果响应中没有新的refresh token，使用原来的
	newRefreshToken := tokenResp.RefreshToken
	if newRefreshToken == "" {
		newRefreshToken = account.RefreshToken
	}

	// 更新账号token信息
	return m.upstreamMgr.UpdateOAuthTokens(
		upstreamID,
		tokenResp.AccessToken,
		newRefreshToken,
		expiresAt,
	)
}

// IsTokenValid 检查token是否有效
func (m *OAuthManager) IsTokenValid(upstreamID string) bool {
	expired, err := m.upstreamMgr.IsTokenExpired(upstreamID)
	if err != nil {
		return false
	}
	return !expired
}

// AutoRefreshIfNeeded 如果需要则自动刷新token
func (m *OAuthManager) AutoRefreshIfNeeded(upstreamID string) error {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return nil // 不是OAuth账号，无需刷新
	}

	// 检查是否即将过期（提前5分钟刷新）
	if account.ExpiresAt != nil {
		timeUntilExpiry := time.Until(*account.ExpiresAt)
		if timeUntilExpiry < 5*time.Minute {
			return m.RefreshToken(upstreamID)
		}
	}

	return nil
}

// TokenResponse OAuth token响应结构
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	ResourceURL  string `json:"resource_url"`
}

// QwenDeviceCodeResponse Qwen设备授权码响应结构
type QwenDeviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// requestQwenDeviceCode 请求Qwen设备授权码
func (m *OAuthManager) requestQwenDeviceCode(deviceAuthURL string, deviceReq map[string]string) (*QwenDeviceCodeResponse, error) {
	// 构建请求体
	formData := url.Values{}
	for k, v := range deviceReq {
		formData.Set(k, v)
	}

	// 创建HTTP请求
	req, err := http.NewRequest("POST", deviceAuthURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, fmt.Errorf("创建设备授权请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	// 发送请求
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送设备授权请求失败: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取设备授权响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("设备授权请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	// 解析JSON响应
	var deviceResp QwenDeviceCodeResponse
	if err := json.Unmarshal(body, &deviceResp); err != nil {
		return nil, fmt.Errorf("解析设备授权响应JSON失败: %w, 响应体: %s", err, string(body))
	}

	logger.Info("Qwen设备授权码请求成功: user_code=%s, verification_uri=%s, expires_in=%d, interval=%d",
		deviceResp.UserCode, deviceResp.VerificationURI, deviceResp.ExpiresIn, deviceResp.Interval)

	return &deviceResp, nil
}

// pollQwenToken 轮询Qwen token状态 (Device Flow)
func (m *OAuthManager) pollQwenToken(upstreamID, deviceCode, codeVerifier string, interval, expiresIn int) {
	config := m.getQwenConfig()

	// 设置轮询间隔，默认5秒
	pollInterval := 5 * time.Second
	if interval > 0 {
		pollInterval = time.Duration(interval) * time.Second
	}

	// 设置超时时间
	timeout := time.Duration(expiresIn) * time.Second
	if timeout <= 0 {
		timeout = 15 * time.Minute // 默认15分钟
	}

	logger.Info("开始轮询Qwen授权状态: upstream_id=%s, poll_interval=%v, timeout=%v",
		upstreamID, pollInterval, timeout)

	startTime := time.Now()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for range ticker.C {
		// 检查是否超时
		if time.Since(startTime) > timeout {
			logger.Error("Qwen授权轮询超时: upstream_id=%s", upstreamID)
			return
		}

		// 构建轮询请求
		tokenReq := map[string]string{
			"grant_type":    "urn:ietf:params:oauth:grant-type:device_code",
			"client_id":     config.ClientID,
			"device_code":   deviceCode,
			"code_verifier": codeVerifier,
		}

		// 发送token请求
		tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq, types.ProviderQwen)
		if err != nil {
			// 检查是否是等待中的错误
			if strings.Contains(err.Error(), "authorization_pending") ||
				strings.Contains(err.Error(), "slow_down") {
				continue // 继续轮询
			}
			logger.Error("Qwen轮询token失败: upstream_id=%s, error=%v", upstreamID, err)
			return
		}

		// 计算过期时间
		var expiresAt time.Time
		if tokenResp.ExpiresIn > 0 {
			expiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
		}

		// 更新token信息和resource_url
		if err := m.upstreamMgr.UpdateOAuthTokensWithResourceURL(upstreamID, tokenResp.AccessToken, tokenResp.RefreshToken, tokenResp.ResourceURL, expiresAt); err != nil {
			logger.Error("更新上游账号失败: upstream_id=%s, error=%v", upstreamID, err)
			return
		}

		// 获取账号信息用于显示
		account, err := m.upstreamMgr.GetAccount(upstreamID)
		if err != nil {
			logger.Error("获取上游账号失败: upstream_id=%s, error=%v", upstreamID, err)
			return
		}

		// 清理存储的验证信息
		delete(m.pkceVerifiers, upstreamID)

		logger.Info("Qwen OAuth授权完成: upstream_id=%s", upstreamID)
		fmt.Printf("\n✅ Qwen OAuth授权成功完成！\n")
		fmt.Printf("🎉 OAuth账号 \"%s\" 已就绪并可用\n\n", account.Name)

		fmt.Printf("账号详情:\n")
		fmt.Printf("  ID: %s\n", account.ID)
		fmt.Printf("  名称: %s\n", account.Name)
		fmt.Printf("  类型: %s\n", account.Type)
		fmt.Printf("  提供商: %s\n", account.Provider)
		fmt.Printf("  状态: %s ✅\n", account.Status)

		if account.ExpiresAt != nil {
			fmt.Printf("  Token有效期: %s\n", account.ExpiresAt.Format("2006-01-02 15:04:05"))
		}

		// 成功完成授权，退出程序
		fmt.Printf("\n程序即将退出...\n")
		time.Sleep(2 * time.Second) // 给用户时间看到成功消息
		os.Exit(0)
		return
	}
}

// maskSensitiveInfo 脱敏处理敏感信息
func maskSensitiveInfo(data string) string {
	sensitiveKeys := []string{
		"refresh_token",
		"access_token",
		"code",
		"code_verifier",
		"client_secret",
		"api_key",
	}

	result := data
	for _, key := range sensitiveKeys {
		// 匹配 key=value 格式 (用于URL编码格式)
		re1 := regexp.MustCompile(fmt.Sprintf(`(%s=)([^&\s]+)`, key))
		result = re1.ReplaceAllStringFunc(result, func(match string) string {
			parts := strings.SplitN(match, "=", 2)
			if len(parts) != 2 {
				return match
			}
			value := parts[1]
			return parts[0] + "=" + maskValue(value)
		})

		// 匹配 JSON 格式 "key":"value"
		re2 := regexp.MustCompile(fmt.Sprintf(`("%s":\s*")([^"]+)(")`, key))
		result = re2.ReplaceAllStringFunc(result, func(match string) string {
			parts := re2.FindStringSubmatch(match)
			if len(parts) != 4 {
				return match
			}
			return parts[1] + maskValue(parts[2]) + parts[3]
		})
	}
	return result
}

// maskValue 对值进行脱敏处理
func maskValue(value string) string {
	if len(value) <= 8 {
		return strings.Repeat("*", len(value))
	}
	// 显示前3位和后3位，中间用*替换
	return value[:3] + strings.Repeat("*", len(value)-6) + value[len(value)-3:]
}

// exchangeCodeForToken 交换授权码获取token
func (m *OAuthManager) exchangeCodeForToken(tokenURL string, tokenReq map[string]string, provider types.Provider) (*TokenResponse, error) {
	// 使用form-encoded格式而不是JSON
	formData := url.Values{}
	for key, value := range tokenReq {
		formData.Set(key, value)
	}
	reqBody := formData.Encode()

	// 调试信息：打印请求内容（脱敏）
	logger.Debug("Token请求URL: %s", tokenURL)

	// 脱敏处理请求体中的敏感信息
	debugBody := maskSensitiveInfo(reqBody)
	logger.Debug("Token请求Body: %s", debugBody)

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	// 设置基础HTTP头
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("User-Agent", "claude-cli/1.0.56 (external, cli)")

	// 根据Provider设置特定的HTTP头
	m.setProviderSpecificHeaders(req, provider)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求失败: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	// 添加响应状态的调试信息
	logger.Debug("Token响应状态码: %d", resp.StatusCode)

	if resp.StatusCode != http.StatusOK {
		logger.Debug("Token请求失败，响应内容: %s", string(body))
		return nil, fmt.Errorf("token请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	// 脱敏处理响应内容中的敏感信息并打印
	debugResponse := maskSensitiveInfo(string(body))
	logger.Debug("Token响应内容: %s", debugResponse)

	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("解析token响应失败: %w", err)
	}

	return &tokenResp, nil
}

// setProviderSpecificHeaders 根据Provider设置特定的HTTP头
func (m *OAuthManager) setProviderSpecificHeaders(req *http.Request, provider types.Provider) {
	switch provider {
	case types.ProviderAnthropic:
		req.Header.Set("Referer", "https://claude.ai/")
		req.Header.Set("Origin", "https://claude.ai")
		// 添加Claude Code必需的beta标识
		req.Header.Set("anthropic-beta", "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14")
	case types.ProviderQwen:
		// Qwen特定的HTTP头设置（如果需要的话）
		// 目前使用默认设置
	default:
		// 其他Provider使用默认HTTP头
	}
}
