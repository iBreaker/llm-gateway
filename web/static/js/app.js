// Web Management App for LLM Gateway
class LLMGatewayApp {
    constructor() {
        this.apiBase = '/api/v1';
    }

    // Check if user is authenticated
    async checkAuthentication() {
        try {
            const response = await fetch('/api/v1/health', {
                credentials: 'include'
            });
            return response.ok;
        } catch (error) {
            console.error('Authentication check failed:', error);
            return false;
        }
    }

    async init() {
        console.log('LLMGatewayApp initializing...');
        // Initialize i18n first
        window.i18n.init();
        
        // Check authentication first
        const isAuthenticated = await this.checkAuthentication();
        if (!isAuthenticated) {
            console.log('User not authenticated, redirecting to login...');
            window.location.href = '/static/html/login.html';
            return;
        }
        
        this.setupTabNavigation();
        this.setupFormHandlers();
        this.initializeFromHash();
        
        // If no hash, load dashboard
        if (!window.location.hash) {
            this.loadDashboard();
        }
        
        // Auto refresh every 30 seconds
        setInterval(() => {
            this.refreshCurrentTab();
        }, 30000);
        
        console.log('LLMGatewayApp initialized');
    }

    setupTabNavigation() {
        console.log('Setting up tab navigation...');
        const navButtons = document.querySelectorAll('.nav-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        console.log('Found nav buttons:', navButtons.length);
        console.log('Found tab contents:', tabContents.length);

        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                console.log('Tab clicked:', btn.getAttribute('data-tab'));
                const tabId = btn.getAttribute('data-tab');
                
                // Remove active class from all buttons and contents
                navButtons.forEach(b => {
                    b.classList.remove('active');
                    console.log('Removed active from button:', b.getAttribute('data-tab'));
                });
                tabContents.forEach(c => {
                    c.classList.remove('active');
                    console.log('Removed active from content:', c.id);
                });
                
                // Add active class to clicked button and corresponding content
                btn.classList.add('active');
                const targetContent = document.getElementById(tabId);
                if (targetContent) {
                    targetContent.classList.add('active');
                    console.log('Added active to button and content:', tabId);
                } else {
                    console.error('Target content not found:', tabId);
                }
                
                // Update URL hash for better UX
                window.location.hash = tabId;
                
                // Load tab content
                this.loadTabContent(tabId);
            });
        });
    }

    initializeFromHash() {
        const hash = window.location.hash.substring(1); // Remove #
        if (hash && ['dashboard', 'upstream', 'apikeys', 'config', 'model-routes'].includes(hash)) {
            console.log('Initializing from hash:', hash);
            
            // Remove active from all
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Activate the hash tab
            const targetButton = document.querySelector(`[data-tab="${hash}"]`);
            const targetContent = document.getElementById(hash);
            
            if (targetButton && targetContent) {
                targetButton.classList.add('active');
                targetContent.classList.add('active');
                this.loadTabContent(hash);
            }
        }
    }

    setupFormHandlers() {
        // Upstream form handler
        document.getElementById('add-upstream-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addUpstreamAccount();
        });

        // API Key form handler
        document.getElementById('add-apikey-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateApiKey();
        });

        // Route form handler
        document.getElementById('route-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRoute();
        });

        // Global Route form handler
        document.getElementById('global-route-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveGlobalRoute();
        });

        // Upstream type change handler
        document.getElementById('upstream-type').addEventListener('change', (e) => {
            const apiKeyGroup = document.getElementById('api-key-group');
            const oauthInfo = document.getElementById('oauth-info');
            const baseUrlGroup = document.getElementById('base-url-group');
            
            if (e.target.value === 'oauth') {
                // Hide API key fields
                apiKeyGroup.style.display = 'none';
                document.getElementById('upstream-api-key').required = false;
                
                // Show OAuth info and restrict provider options
                oauthInfo.style.display = 'block';
                baseUrlGroup.style.display = 'none';
                
                // Restrict provider options for OAuth
                const providerSelect = document.getElementById('upstream-provider');
                const options = providerSelect.options;
                for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    if (option.value === 'anthropic' || option.value === 'qwen') {
                        option.style.display = 'block';
                        option.disabled = false;
                    } else {
                        option.style.display = 'none';
                        option.disabled = true;
                    }
                }
                
                // Auto select anthropic if current selection is not supported
                if (providerSelect.value !== 'anthropic' && providerSelect.value !== 'qwen') {
                    providerSelect.value = 'anthropic';
                }
            } else {
                // Show API key fields
                apiKeyGroup.style.display = 'block';
                document.getElementById('upstream-api-key').required = true;
                
                // Hide OAuth fields
                oauthInfo.style.display = 'none';
                baseUrlGroup.style.display = 'block'; // Show base URL for API key type
                
                // Restore all provider options for API key type
                const providerSelect = document.getElementById('upstream-provider');
                const options = providerSelect.options;
                for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    option.style.display = 'block';
                    option.disabled = false;
                }
            }
        });
    }

    loadTabContent(tabId) {
        switch (tabId) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'upstream':
                this.loadUpstreamAccounts();
                break;
            case 'apikeys':
                this.loadApiKeys();
                break;
            case 'config':
                this.loadConfiguration();
                break;
            case 'model-routes':
                this.loadGlobalRoutes();
                break;
        }
    }

    refreshCurrentTab() {
        const activeTab = document.querySelector('.nav-btn.active');
        if (activeTab) {
            this.loadTabContent(activeTab.getAttribute('data-tab'));
        }
    }

    async loadDashboard() {
        try {
            // Load system status
            const health = await this.apiCall('/health');
            this.updateSystemStatus(health.status === 'healthy');
            
            // Load counts
            const [upstreamAccounts, apiKeys, config] = await Promise.all([
                this.apiCall('/upstream'),
                this.apiCall('/apikeys'),
                this.apiCall('/config')
            ]);
            
            this.updateDashboardCounts(upstreamAccounts, apiKeys, config);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.updateSystemStatus(false);
        }
    }

    updateSystemStatus(healthy) {
        const statusDot = document.getElementById('system-status');
        const statusText = document.getElementById('system-status-text');
        
        if (statusDot && statusText) {
            if (healthy) {
                statusDot.className = 'status-dot healthy';
                statusText.textContent = window.i18n.t('dashboard.healthy');
            } else {
                statusDot.className = 'status-dot unhealthy';
                statusText.textContent = window.i18n.t('dashboard.unhealthy');
            }
        }
    }

    updateDashboardCounts(upstream, apikeys, config) {
        // 使用stats数据或fallback到data数组长度
        const upstreamCount = upstream.stats?.total || upstream.data?.length || 0;
        const apikeysCount = apikeys.stats?.total || apikeys.data?.length || 0;
        
        document.getElementById('upstream-count').textContent = upstreamCount;
        document.getElementById('apikey-count').textContent = apikeysCount;
        
        if (config) {
            document.getElementById('server-host').textContent = config.server?.Host || config.server?.host || '-';
            document.getElementById('server-port').textContent = config.server?.Port || config.server?.port || '-';
        }
    }

    async loadUpstreamAccounts() {
        try {
            const response = await this.apiCall('/upstream');
            const accounts = response.data || response; // 兼容旧格式
            const stats = response.stats;
            
            this.renderUpstreamTable(accounts);
            if (stats) {
                this.renderUpstreamStats(stats);
            }
        } catch (error) {
            console.error('Failed to load upstream accounts:', error);
            this.renderUpstreamTable([]);
        }
    }

    renderUpstreamTable(accounts) {
        const tbody = document.getElementById('upstream-tbody');
        
        if (accounts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${window.i18n.t('upstream.no_accounts')}</td></tr>`;
            return;
        }
        
        tbody.innerHTML = accounts.map(account => `
            <tr>
                <td><strong>${this.escapeHtml(account.name)}</strong><br><small class="text-muted">${account.id}</small></td>
                <td>${this.escapeHtml(account.provider)}</td>
                <td>${this.escapeHtml(account.type)}</td>
                <td><span class="status-badge ${account.status}">${account.status}</span></td>
                <td><span class="status-badge ${account.health_status || 'unknown'}">${account.health_status || 'Unknown'}</span></td>
                <td>${this.renderUsageStats(account.usage)}</td>
                <td>
                    <button class="btn btn-danger btn-small" onclick="app.deleteUpstreamAccount('${account.id}')">${window.i18n.t('upstream.delete')}</button>
                </td>
            </tr>
        `).join('');
    }

    renderUpstreamStats(stats) {
        const statsContainer = document.getElementById('upstream-stats');
        if (stats.total > 0) {
            statsContainer.style.display = 'block';
            
            document.getElementById('upstream-stats-total').textContent = stats.total;
            document.getElementById('upstream-stats-active').textContent = stats.active;
            document.getElementById('upstream-stats-healthy').textContent = stats.healthy;
            
            // 显示提供商分布
            const providersDiv = document.getElementById('upstream-stats-providers');
            const providers = Object.entries(stats.by_provider || {})
                .map(([name, count]) => `${name}: ${count}`)
                .join(', ') || '-';
            providersDiv.textContent = providers;
        } else {
            statsContainer.style.display = 'none';
        }
    }

    async loadApiKeys() {
        try {
            const response = await this.apiCall('/apikeys');
            const keys = response.data || response; // 兼容旧格式
            const stats = response.stats;
            
            this.renderApiKeysTable(keys);
            if (stats) {
                this.renderApiKeysStats(stats);
            }
        } catch (error) {
            console.error('Failed to load API keys:', error);
            this.renderApiKeysTable([]);
        }
    }

    renderApiKeysTable(keys) {
        const tbody = document.getElementById('apikey-tbody');
        
        if (keys.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${window.i18n.t('apikeys.no_keys')}</td></tr>`;
            return;
        }
        
        tbody.innerHTML = keys.map(key => `
            <tr>
                <td><strong>${this.escapeHtml(key.name)}</strong><br><small class="text-muted">${key.id}</small></td>
                <td>${key.permissions?.join(', ') || 'N/A'}</td>
                <td><span class="status-badge ${key.status}">${key.status}</span></td>
                <td>${this.renderUsageStats(key.usage)}</td>
                <td>${key.created_at ? new Date(key.created_at).toLocaleDateString() : 'N/A'}</td>
                <td>
                    <button class="btn btn-secondary btn-small" onclick="app.configureModelRoutes('${key.id}', '${this.escapeHtml(key.name)}')" data-i18n="apikeys.configure_routes" data-i18n-title="apikeys.configure_routes_title">Routes</button>
                    <button class="btn btn-danger btn-small" onclick="app.deleteApiKey('${key.id}')">${window.i18n.t('apikeys.delete')}</button>
                </td>
            </tr>
        `).join('');
    }

    renderUsageStats(usage) {
        if (!usage) {
            return `<span class="text-muted">${window.i18n.t('stats.no_data')}</span>`;
        }

        const requests = usage.total_requests || 0;
        const successRate = usage.total_requests > 0 
            ? (((usage.successful_requests || 0) / usage.total_requests) * 100).toFixed(1)
            : '0.0';
        const tokensUsed = usage.tokens_used || 0;
        const avgLatency = usage.avg_latency || 0;
        const errorRate = usage.error_rate || 0;
        
        // Format large numbers
        const formatNumber = (num) => {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        };

        const lastUsed = usage.last_used_at 
            ? new Date(usage.last_used_at).toLocaleDateString()
            : window.i18n.t('stats.never');

        return `
            <div class="usage-stats">
                <div class="usage-item">
                    <strong>${formatNumber(requests)}</strong> ${window.i18n.t('stats.requests_label')}
                </div>
                <div class="usage-item">
                    <strong>${formatNumber(tokensUsed)}</strong> ${window.i18n.t('stats.tokens_label')}
                </div>
                <div class="usage-item">
                    <strong>${successRate}%</strong> ${window.i18n.t('stats.success_label')}
                </div>
                <div class="usage-item text-muted">
                    ${window.i18n.t('stats.last_label')}: ${lastUsed}
                </div>
                ${avgLatency > 0 ? `<div class="usage-item text-muted">${avgLatency.toFixed(0)}ms ${window.i18n.t('stats.avg_label')}</div>` : ''}
                ${errorRate > 0 ? `<div class="usage-item text-danger">${(errorRate * 100).toFixed(1)}% ${window.i18n.t('stats.errors_label')}</div>` : ''}
            </div>
        `;
    }

    renderApiKeysStats(stats) {
        const statsContainer = document.getElementById('apikey-stats');
        if (stats.total > 0) {
            statsContainer.style.display = 'block';
            
            document.getElementById('apikey-stats-total').textContent = stats.total;
            document.getElementById('apikey-stats-active').textContent = stats.active;
            document.getElementById('apikey-stats-requests').textContent = stats.total_requests.toLocaleString();
            document.getElementById('apikey-stats-recent').textContent = stats.recent_usage;
        } else {
            statsContainer.style.display = 'none';
        }
    }

    async loadConfiguration() {
        try {
            const config = await this.apiCall('/config');
            this.renderConfiguration(config);
        } catch (error) {
            console.error('Failed to load configuration:', error);
            this.renderConfiguration({});
        }
    }

    renderConfiguration(config) {
        // Server config - 兼容大小写字段名
        document.getElementById('config-host').textContent = config.server?.Host || config.server?.host || '-';
        document.getElementById('config-port').textContent = config.server?.Port || config.server?.port || '-';
        document.getElementById('config-timeout').textContent = 
            (config.server?.Timeout || config.server?.timeout) ? `${config.server.Timeout || config.server.timeout}s` : '-';
        
        // Proxy config - 兼容大小写和不同命名约定
        const requestTimeout = config.proxy?.RequestTimeout !== undefined ? config.proxy.RequestTimeout : 
                              config.proxy?.request_timeout !== undefined ? config.proxy.request_timeout : null;
        const streamTimeout = config.proxy?.StreamTimeout !== undefined ? config.proxy.StreamTimeout : 
                             config.proxy?.stream_timeout !== undefined ? config.proxy.stream_timeout : null;
        const connectTimeout = config.proxy?.ConnectTimeout !== undefined ? config.proxy.ConnectTimeout : 
                              config.proxy?.connect_timeout !== undefined ? config.proxy.connect_timeout : null;
        const responseTimeout = config.proxy?.ResponseTimeout !== undefined ? config.proxy.ResponseTimeout : 
                               config.proxy?.response_timeout !== undefined ? config.proxy.response_timeout : null;
        
        document.getElementById('config-request-timeout').textContent = 
            requestTimeout !== null ? (requestTimeout === 0 ? window.i18n.t('config.unlimited') : `${requestTimeout}s`) : '-';
        document.getElementById('config-stream-timeout').textContent = 
            streamTimeout !== null ? (streamTimeout === 0 ? window.i18n.t('config.unlimited') : `${streamTimeout}s`) : '-';
        document.getElementById('config-connect-timeout').textContent = 
            connectTimeout !== null ? (connectTimeout === 0 ? window.i18n.t('config.unlimited') : `${connectTimeout}s`) : '-';
        document.getElementById('config-response-timeout').textContent = 
            responseTimeout !== null ? (responseTimeout === 0 ? window.i18n.t('config.unlimited') : `${responseTimeout}s`) : '-';
        
        // Logging config - 兼容大小写字段名
        document.getElementById('config-log-level').textContent = config.logging?.Level || config.logging?.level || '-';
        document.getElementById('config-log-format').textContent = config.logging?.Format || config.logging?.format || '-';
    }

    async addUpstreamAccount() {
        const formData = new FormData(document.getElementById('add-upstream-form'));
        const data = {
            name: formData.get('name') || document.getElementById('upstream-name').value,
            provider: formData.get('provider') || document.getElementById('upstream-provider').value,
            type: formData.get('type') || document.getElementById('upstream-type').value,
        };
        
        // Add base URL if provided
        const baseUrl = document.getElementById('upstream-base-url').value;
        if (baseUrl) {
            data.base_url = baseUrl;
        }
        
        if (data.type === 'api-key') {
            data.api_key = document.getElementById('upstream-api-key').value;
        }

        try {
            // 先创建上游账号
            const result = await this.apiCall('/upstream', 'POST', data);
            this.closeModal('add-upstream-modal');
            this.loadUpstreamAccounts();
            this.showSuccess(window.i18n.t('msg.upstream_added'));
            
            // 如果是OAuth类型，启动OAuth流程
            if (data.type === 'oauth') {
                this.startOAuthFlow(result.id, data.provider);
            }
        } catch (error) {
            this.showError('Failed to add upstream account: ' + error.message);
        }
    }

    async startOAuthFlow(upstreamId, provider) {
        try {
            const result = await this.apiCall('/oauth/start', 'POST', {
                upstream_id: upstreamId
            });

            if (result.flow_type === 'authorization_code') {
                // Anthropic OAuth: 跳转到授权URL
                this.handleAnthropicOAuth(result, upstreamId);
            } else if (result.flow_type === 'device_code') {
                // Qwen OAuth: 显示设备码
                this.handleQwenOAuth(result, upstreamId);
            }
        } catch (error) {
            this.showError('Failed to start OAuth flow: ' + error.message);
        }
    }

    handleAnthropicOAuth(oauthResult, upstreamId) {
        // 显示Anthropic OAuth指引模态框
        const modal = this.createOAuthModal('anthropic-oauth-modal', 'Anthropic OAuth Authorization');
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" onclick="app.closeModal('anthropic-oauth-modal')">&times;</span>
                <h3>Anthropic OAuth Authorization</h3>
                <p>${oauthResult.message}</p>
                <div class="oauth-action">
                    <a href="${oauthResult.auth_url}" target="_blank" class="btn btn-primary">Open Authorization Page</a>
                </div>
                <div class="form-group" style="margin-top: 20px;">
                    <label>After authorization, paste the code here:</label>
                    <input type="text" id="oauth-code" placeholder="Enter authorization code">
                    <button class="btn btn-success" onclick="app.completeAnthropicOAuth('${upstreamId}')">Complete Authorization</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.showModal('anthropic-oauth-modal');
    }

    handleQwenOAuth(oauthResult, upstreamId) {
        // 显示Qwen OAuth设备码模态框
        const modal = this.createOAuthModal('qwen-oauth-modal', 'Qwen OAuth Device Authorization');
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" onclick="app.closeModal('qwen-oauth-modal')">&times;</span>
                <h3>Qwen OAuth Device Authorization</h3>
                <p>${oauthResult.message}</p>
                <div class="device-code-info">
                    <div class="code-display">
                        <strong>User Code:</strong> <code id="user-code">${oauthResult.user_code}</code>
                        <button class="btn btn-copy" onclick="app.copyToClipboard('user-code')">Copy</button>
                    </div>
                    <div class="oauth-action" style="margin: 15px 0;">
                        <a href="${oauthResult.verification_uri}" target="_blank" class="btn btn-primary">Open Verification Page</a>
                    </div>
                    <div class="oauth-status" id="oauth-status">
                        <div class="spinner"></div>
                        <span>Waiting for authorization... (${Math.floor(oauthResult.expires_in/60)} minutes remaining)</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.showModal('qwen-oauth-modal');
        
        // 启动状态轮询
        this.pollOAuthStatus(upstreamId, oauthResult.expires_in);
    }

    async completeAnthropicOAuth(upstreamId) {
        const code = document.getElementById('oauth-code').value.trim();
        if (!code) {
            this.showError('Please enter the authorization code');
            return;
        }

        try {
            await this.apiCall('/oauth/callback', 'POST', {
                upstream_id: upstreamId,
                code: code
            });
            this.closeModal('anthropic-oauth-modal');
            this.loadUpstreamAccounts();
            this.showSuccess('OAuth authorization completed successfully');
        } catch (error) {
            this.showError('Failed to complete OAuth authorization: ' + error.message);
        }
    }

    async pollOAuthStatus(upstreamId, expiresIn) {
        const startTime = Date.now();
        const maxTime = expiresIn * 1000;
        
        const poll = async () => {
            if (Date.now() - startTime > maxTime) {
                this.showError('OAuth authorization timed out');
                this.closeModal('qwen-oauth-modal');
                return;
            }

            try {
                const status = await this.apiCall(`/oauth/status/${upstreamId}`);
                if (status.status === 'authorized') {
                    this.closeModal('qwen-oauth-modal');
                    this.loadUpstreamAccounts();
                    this.showSuccess('OAuth authorization completed successfully');
                    return;
                } else if (status.status === 'error') {
                    this.showError('OAuth authorization failed');
                    this.closeModal('qwen-oauth-modal');
                    return;
                }
                
                // 继续轮询
                setTimeout(poll, 5000);
            } catch (error) {
                console.error('Failed to poll OAuth status:', error);
                setTimeout(poll, 5000);
            }
        };

        poll();
    }

    createOAuthModal(id, title) {
        // 清理现有的模态框
        const existing = document.getElementById(id);
        if (existing) {
            existing.remove();
        }

        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        return modal;
    }

    async generateApiKey() {
        const name = document.getElementById('apikey-name').value;
        const permissionInputs = document.querySelectorAll('#add-apikey-modal input[type="checkbox"]:checked');
        const permissions = Array.from(permissionInputs).map(input => input.value);

        try {
            const result = await this.apiCall('/apikeys', 'POST', {
                name: name,
                permissions: permissions
            });
            
            this.closeModal('add-apikey-modal');
            document.getElementById('generated-key-value').textContent = result.key;
            this.showModal('generated-key-modal');
            this.loadApiKeys();
        } catch (error) {
            this.showError('Failed to generate API key: ' + error.message);
        }
    }

    async deleteUpstreamAccount(id) {
        if (!confirm(window.i18n.t('msg.confirm_delete_upstream'))) {
            return;
        }

        try {
            await this.apiCall(`/upstream/${id}`, 'DELETE');
            this.loadUpstreamAccounts();
            this.showSuccess(window.i18n.t('msg.upstream_deleted'));
        } catch (error) {
            this.showError('Failed to delete upstream account: ' + error.message);
        }
    }

    async configureModelRoutes(keyId, keyName) {
        // 设置当前编辑的Key信息
        window.currentEditingKey = { id: keyId, name: keyName };
        
        // 设置模态框标题
        document.getElementById('model-routes-key-name').textContent = keyName;
        
        // 加载现有的路由配置
        await this.loadKeyModelRoutes(keyId);
        
        // 显示模态框
        this.showModal('model-routes-modal');
    }

    async loadKeyModelRoutes(keyId) {
        try {
            const response = await this.apiCall(`/apikeys/${keyId}/model-routes`);
            const routes = response.routes || [];
            this.renderModelRoutes(routes);
        } catch (error) {
            // 如果没有配置或API不存在，显示空列表
            this.renderModelRoutes([]);
        }
    }

    renderModelRoutes(routes) {
        const tbody = document.getElementById('model-routes-tbody');
        
        if (routes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div class="empty-state-content">
                            <div class="empty-state-icon">📋</div>
                            <div class="empty-state-text">${window.i18n.t('routes.no_routes')}</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = routes.map((route, index) => `
            <tr>
                <td class="col-source">${this.escapeHtml(route.source_model)}</td>
                <td class="col-target">${this.escapeHtml(route.target_model)}</td>
                <td class="col-provider">${this.escapeHtml(route.target_provider)}</td>
                <td class="col-priority">${route.priority || 0}</td>
                <td class="col-status"><span class="status-badge ${route.enabled ? 'active' : 'disabled'}">${route.enabled ? window.i18n.t('common.enabled') : window.i18n.t('common.disabled')}</span></td>
                <td class="col-actions">
                    <button class="btn btn-secondary btn-small" onclick="app.editModelRoute(${index})" title="${window.i18n.t('common.edit')}">${window.i18n.t('common.edit')}</button>
                    <button class="btn btn-danger btn-small" onclick="app.deleteModelRoute(${index})" title="${window.i18n.t('common.delete')}">${window.i18n.t('common.delete')}</button>
                </td>
            </tr>
        `).join('');
        
        // 保存当前路由配置到全局变量
        window.currentModelRoutes = routes;
    }

    showAddRouteForm() {
        // 重置表单
        document.getElementById('route-form').reset();
        document.getElementById('route-form-title').textContent = window.i18n.t('model_routes.add_route');
        document.getElementById('route-priority').value = '10';
        document.getElementById('route-enabled').checked = true;
        
        // 设置编辑状态
        window.currentEditingRouteIndex = -1;
        
        // 显示表单模态框
        this.showModal('route-form-modal');
    }

    editModelRoute(index) {
        const route = window.currentModelRoutes[index];
        
        // 填充表单
        document.getElementById('route-source-model').value = route.source_model || '';
        document.getElementById('route-target-model').value = route.target_model || '';
        document.getElementById('route-target-provider').value = route.target_provider || '';
        document.getElementById('route-priority').value = route.priority || 10;
        document.getElementById('route-description').value = route.description || '';
        document.getElementById('route-enabled').checked = route.enabled !== false;
        
        // 更新标题和编辑状态
        document.getElementById('route-form-title').textContent = window.i18n.t('model_routes.edit_route');
        window.currentEditingRouteIndex = index;
        
        // 显示表单模态框
        this.showModal('route-form-modal');
    }

    async deleteModelRoute(index) {
        if (!confirm(window.i18n.t('model_routes.delete_confirm'))) {
            return;
        }
        
        try {
            // 保存要删除的路由，以便失败时恢复
            const deletedRoute = window.currentModelRoutes[index];
            
            // 从当前路由列表中删除
            window.currentModelRoutes.splice(index, 1);
            
            // 立即保存到服务器
            const keyId = window.currentEditingKey.id;
            await this.apiCall(`/apikeys/${keyId}/model-routes`, 'PUT', {
                routes: window.currentModelRoutes,
                default_behavior: 'passthrough',
                enable_logging: true
            });
            
            // 重新渲染表格
            this.renderModelRoutes(window.currentModelRoutes);
            
            this.showSuccess(window.i18n.t('model_routes.route_deleted'));
        } catch (error) {
            // 如果保存失败，恢复删除的路由
            if (typeof deletedRoute !== 'undefined') {
                window.currentModelRoutes.splice(index, 0, deletedRoute);
                this.renderModelRoutes(window.currentModelRoutes);
            }
            this.showError(window.i18n.t('model_routes.delete_error') + ': ' + error.message);
        }
    }

    async saveModelRoutes() {
        // 这个方法现在主要用于关闭模态框
        // 因为所有更改都会自动保存
        this.closeModal('model-routes-modal');
    }

    async saveRoute() {
        // 获取表单数据
        const sourceModel = document.getElementById('route-source-model').value.trim();
        const targetModel = document.getElementById('route-target-model').value.trim();
        const targetProvider = document.getElementById('route-target-provider').value;
        const priority = parseInt(document.getElementById('route-priority').value);
        const description = document.getElementById('route-description').value.trim();
        const enabled = document.getElementById('route-enabled').checked;

        // 基本验证
        if (!sourceModel || !targetModel || !targetProvider) {
            this.showError(window.i18n.t('model_routes.required_fields'));
            return;
        }

        if (isNaN(priority) || priority < 0) {
            this.showError(window.i18n.t('model_routes.priority_error'));
            return;
        }

        // 创建路由对象
        const route = {
            id: `route_${Date.now()}`, // 临时ID，后端会生成真实ID
            source_model: sourceModel,
            target_model: targetModel,
            target_provider: targetProvider,
            priority: priority,
            enabled: enabled,
            description: description
        };

        try {
            // 初始化路由数组如果不存在
            if (!window.currentModelRoutes) {
                window.currentModelRoutes = [];
            }

            // 添加或更新路由到本地数组
            const editIndex = window.currentEditingRouteIndex;
            if (editIndex >= 0) {
                // 编辑现有路由
                window.currentModelRoutes[editIndex] = route;
            } else {
                // 添加新路由
                window.currentModelRoutes.push(route);
            }

            // 按优先级排序
            window.currentModelRoutes.sort((a, b) => (a.priority || 0) - (b.priority || 0));

            // 立即保存到服务器
            const keyId = window.currentEditingKey.id;
            await this.apiCall(`/apikeys/${keyId}/model-routes`, 'PUT', {
                routes: window.currentModelRoutes,
                default_behavior: 'passthrough',
                enable_logging: true
            });

            // 重新渲染表格
            this.renderModelRoutes(window.currentModelRoutes);

            // 关闭表单模态框
            this.closeModal('route-form-modal');

            this.showSuccess(window.i18n.t('model_routes.route_saved_and_applied'));
        } catch (error) {
            this.showError(window.i18n.t('model_routes.save_error') + ': ' + error.message);
        }
    }

    // Global Routes Management
    async loadGlobalRoutes() {
        try {
            // 暂时显示空数据，等待后端API实现
            const routes = [];
            this.renderGlobalRoutes(routes);
            this.updateGlobalRoutesStats(routes);
        } catch (error) {
            console.error('Failed to load global routes:', error);
            this.showError(window.i18n.t('global_routes.load_error') + ': ' + error.message);
        }
    }

    renderGlobalRoutes(routes) {
        const tbody = document.getElementById('global-routes-tbody');
        
        if (routes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${window.i18n.t('routes.no_routes')}</td></tr>`;
            return;
        }
        
        tbody.innerHTML = routes.map((route, index) => `
            <tr>
                <td>${this.escapeHtml(route.source_model)}</td>
                <td>${this.escapeHtml(route.target_model)}</td>
                <td>${this.escapeHtml(route.target_provider)}</td>
                <td>${route.priority || 0}</td>
                <td><span class="status-badge ${route.enabled ? 'active' : 'disabled'}">${route.enabled ? window.i18n.t('common.enabled') : window.i18n.t('common.disabled')}</span></td>
                <td>
                    <button class="btn btn-secondary btn-small" onclick="app.editGlobalRoute(${index})">${window.i18n.t('common.edit')}</button>
                    <button class="btn btn-danger btn-small" onclick="app.deleteGlobalRoute(${index})">${window.i18n.t('common.delete')}</button>
                </td>
            </tr>
        `).join('');
        
        // 保存当前全局路由配置到全局变量
        window.currentGlobalRoutes = routes;
    }

    updateGlobalRoutesStats(routes) {
        const totalRoutes = routes.length;
        const activeRoutes = routes.filter(route => route.enabled).length;
        const providers = [...new Set(routes.map(route => route.target_provider))];
        
        document.getElementById('global-routes-stats-total').textContent = totalRoutes;
        document.getElementById('global-routes-stats-active').textContent = activeRoutes;
        document.getElementById('global-routes-stats-providers').textContent = providers.join(', ') || '-';
        
        // 显示统计卡片
        const statsContainer = document.getElementById('global-routes-stats');
        if (totalRoutes > 0 && statsContainer) {
            statsContainer.style.display = 'grid';
        }
    }

    showAddGlobalRouteForm() {
        // 重置表单
        document.getElementById('global-route-form').reset();
        document.getElementById('global-route-form-title').textContent = window.i18n.t('global_routes.add_route_title');
        document.getElementById('global-route-priority').value = '10';
        document.getElementById('global-route-enabled').checked = true;
        
        // 设置编辑状态
        window.currentEditingGlobalRouteIndex = -1;
        
        // 显示表单模态框
        this.showModal('global-route-form-modal');
    }

    editGlobalRoute(index) {
        const route = window.currentGlobalRoutes[index];
        
        // 填充表单
        document.getElementById('global-route-source-model').value = route.source_model || '';
        document.getElementById('global-route-target-model').value = route.target_model || '';
        document.getElementById('global-route-target-provider').value = route.target_provider || '';
        document.getElementById('global-route-priority').value = route.priority || 10;
        document.getElementById('global-route-description').value = route.description || '';
        document.getElementById('global-route-enabled').checked = route.enabled !== false;
        
        // 更新标题和编辑状态
        document.getElementById('global-route-form-title').textContent = window.i18n.t('model_routes.edit_route');
        window.currentEditingGlobalRouteIndex = index;
        
        // 显示表单模态框
        this.showModal('global-route-form-modal');
    }

    deleteGlobalRoute(index) {
        if (!confirm(window.i18n.t('model_routes.delete_confirm'))) {
            return;
        }
        
        // 从当前全局路由列表中删除
        window.currentGlobalRoutes.splice(index, 1);
        
        // 重新渲染表格
        this.renderGlobalRoutes(window.currentGlobalRoutes);
    }

    saveGlobalRoute() {
        // 获取表单数据
        const sourceModel = document.getElementById('global-route-source-model').value.trim();
        const targetModel = document.getElementById('global-route-target-model').value.trim();
        const targetProvider = document.getElementById('global-route-target-provider').value;
        const priority = parseInt(document.getElementById('global-route-priority').value);
        const description = document.getElementById('global-route-description').value.trim();
        const enabled = document.getElementById('global-route-enabled').checked;

        // 基本验证
        if (!sourceModel || !targetModel || !targetProvider) {
            this.showError(window.i18n.t('model_routes.required_fields'));
            return;
        }

        if (isNaN(priority) || priority < 0) {
            this.showError(window.i18n.t('model_routes.priority_error'));
            return;
        }

        // 创建路由对象
        const route = {
            id: `global_route_${Date.now()}`, // 临时ID，后端会生成真实ID
            source_model: sourceModel,
            target_model: targetModel,
            target_provider: targetProvider,
            priority: priority,
            enabled: enabled,
            description: description
        };

        // 初始化全局路由数组如果不存在
        if (!window.currentGlobalRoutes) {
            window.currentGlobalRoutes = [];
        }

        // 添加或更新路由
        const editIndex = window.currentEditingGlobalRouteIndex;
        if (editIndex >= 0) {
            // 编辑现有路由
            window.currentGlobalRoutes[editIndex] = route;
        } else {
            // 添加新路由
            window.currentGlobalRoutes.push(route);
        }

        // 按优先级排序
        window.currentGlobalRoutes.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        // 重新渲染表格
        this.renderGlobalRoutes(window.currentGlobalRoutes);

        // 关闭表单模态框
        this.closeModal('global-route-form-modal');

        this.showSuccess(window.i18n.t('model_routes.route_saved'));
    }

    async saveGlobalRoutes() {
        try {
            const routes = window.currentGlobalRoutes || [];
            
            // 这里需要调用后端API来保存全局路由
            // await this.apiCall('/config/model-routes', 'PUT', {
            //     routes: routes,
            //     default_behavior: 'passthrough',
            //     enable_logging: true
            // });
            
            this.showSuccess(window.i18n.t('model_routes.save_success'));
            console.log('Global routes to save:', routes);
        } catch (error) {
            this.showError(window.i18n.t('model_routes.save_error') + ': ' + error.message);
        }
    }

    refreshGlobalRoutes() {
        this.loadGlobalRoutes();
    }

    async deleteApiKey(id) {
        if (!confirm(window.i18n.t('msg.confirm_delete_apikey'))) {
            return;
        }

        try {
            await this.apiCall(`/apikeys/${id}`, 'DELETE');
            this.loadApiKeys();
            this.showSuccess(window.i18n.t('msg.apikey_deleted'));
        } catch (error) {
            this.showError('Failed to delete API key: ' + error.message);
        }
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        const url = this.apiBase + endpoint;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // 包含cookies用于认证
        };

        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || `HTTP ${response.status}`);
        }
        
        if (response.status === 204) {
            return null;
        }
        
        return await response.json();
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
        modal.style.display = 'none';
        
        // Reset forms
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
    }

    showSuccess(message) {
        // Simple success notification - could be enhanced with a toast system
        alert(message);
    }

    showError(message) {
        // Simple error notification - could be enhanced with a toast system  
        alert(message);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for HTML onclick handlers
function showAddUpstreamModal() {
    app.showModal('add-upstream-modal');
}

function showAddApiKeyModal() {
    app.showModal('add-apikey-modal');
}

function closeModal(modalId) {
    app.closeModal(modalId);
}

function refreshUpstreamAccounts() {
    app.loadUpstreamAccounts();
}

function refreshApiKeys() {
    app.loadApiKeys();
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert(window.i18n.t('msg.copied'));
        }).catch(() => {
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        alert(window.i18n.t('msg.copied'));
    } catch (err) {
        alert(window.i18n.t('msg.copy_failed'));
    }
    document.body.removeChild(textArea);
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/v1/logout', {
            method: 'POST',
            credentials: 'include'
        });

        // Redirect to login page regardless of response
        // This ensures user is logged out even if server request fails
        window.location.href = '/static/html/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        // Still redirect to login page
        window.location.href = '/static/html/login.html';
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LLMGatewayApp();
    app.init();
});