// Web Management App for LLM Gateway
class LLMGatewayApp {
    constructor() {
        this.apiBase = '/api/v1';
    }

    init() {
        console.log('LLMGatewayApp initializing...');
        // Initialize i18n first
        window.i18n.init();
        
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
        if (hash && ['dashboard', 'upstream', 'apikeys', 'config'].includes(hash)) {
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
        
        if (healthy) {
            statusDot.className = 'status-dot healthy';
            statusText.textContent = window.i18n.t('dashboard.healthy');
        } else {
            statusDot.className = 'status-dot unhealthy';
            statusText.textContent = window.i18n.t('dashboard.unhealthy');
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
        const requestTimeout = config.proxy?.RequestTimeout || config.proxy?.request_timeout || 0;
        const streamTimeout = config.proxy?.StreamTimeout || config.proxy?.stream_timeout || 0;
        
        document.getElementById('config-request-timeout').textContent = requestTimeout ? `${requestTimeout}s` : '-';
        document.getElementById('config-stream-timeout').textContent = streamTimeout ? `${streamTimeout}s` : '-';
        
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
        alert('✅ ' + message);
    }

    showError(message) {
        // Simple error notification - could be enhanced with a toast system  
        alert('❌ ' + message);
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

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LLMGatewayApp();
    app.init();
});