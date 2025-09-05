// Internationalization (i18n) module for LLM Gateway
class I18n {
    constructor() {
        this.currentLang = localStorage.getItem('language') || 'en';
        this.translations = {
            en: {
                // Header
                'header.title': 'LLM Gateway',
                'header.subtitle': 'Management Console',
                'header.status': 'Online',
                
                // Login
                'login.title': 'LLM Gateway',
                'login.subtitle': 'Management Console',
                'login.password': 'Password',
                'login.password_placeholder': 'Enter your password',
                'login.sign_in': 'Sign In',
                'login.footer': 'Secure access to your LLM Gateway instance',
                
                // Settings
                'settings.title': 'Settings',
                'settings.subtitle': 'Manage system security and configuration',
                'settings.security': 'Security Settings',
                'settings.security_subtitle': 'Update your system password',
                'settings.change_password': 'Change Password',
                'settings.current_password': 'Current Password',
                'settings.current_password_placeholder': 'Enter your current password',
                'settings.new_password': 'New Password',
                'settings.new_password_placeholder': 'Enter your new password (min 6 characters)',
                'settings.confirm_password': 'Confirm New Password',
                'settings.confirm_password_placeholder': 'Confirm your new password',
                'settings.update_password': 'Update Password',
                'settings.cancel': 'Cancel',
                'settings.session': 'Session Management',
                'settings.session_subtitle': 'Manage active sessions',
                'settings.active_sessions': 'Active Sessions',
                'settings.current_session': 'Current Session',
                'settings.logged_in_at': 'Logged in at:',
                'settings.logout': 'Logout',
                
                // Navigation
                'nav.dashboard': 'Dashboard',
                'nav.upstream': 'Upstream Accounts',
                'nav.apikeys': 'API Keys',
                'nav.config': 'Configuration',
                'nav.model_routes': 'Model Routes',
                
                // Dashboard
                'dashboard.title': 'System Dashboard',
                'dashboard.subtitle': 'Monitor system health and performance metrics',
                'dashboard.system_status': 'System Status',
                'dashboard.upstream_accounts': 'Upstream Accounts',
                'dashboard.api_keys': 'API Keys',
                'dashboard.server_info': 'Server Info',
                'dashboard.total_accounts': 'Total Accounts',
                'dashboard.active_keys': 'Active Keys',
                'dashboard.healthy': 'Healthy',
                'dashboard.unhealthy': 'Unhealthy',
                'dashboard.loading': 'Loading...',
                
                // Upstream Accounts
                'upstream.title': 'Upstream Accounts',
                'upstream.subtitle': 'Manage AI provider connections and configurations',
                'upstream.add_account': '+ Add Account',
                'upstream.refresh': 'Refresh',
                'upstream.no_accounts': 'No upstream accounts found',
                'upstream.table.name': 'Name',
                'upstream.table.provider': 'Provider',
                'upstream.table.type': 'Type',
                'upstream.table.status': 'Status',
                'upstream.table.health': 'Health',
                'upstream.table.usage': 'Usage',
                'upstream.table.actions': 'Actions',
                'upstream.delete': 'Delete',
                'upstream.loading': 'Loading upstream accounts...',
                
                // API Keys
                'apikeys.title': 'API Keys',
                'apikeys.subtitle': 'Manage gateway authentication tokens and access controls',
                'apikeys.generate_key': '+ Generate Key',
                'apikeys.refresh': 'Refresh',
                'apikeys.no_keys': 'No API keys found',
                'apikeys.table.name': 'Name',
                'apikeys.table.permissions': 'Permissions',
                'apikeys.table.status': 'Status',
                'apikeys.table.usage': 'Usage',
                'apikeys.table.created': 'Created',
                'apikeys.table.actions': 'Actions',
                'apikeys.delete': 'Delete',
                'apikeys.configure_routes': 'Routes',
                'apikeys.configure_routes_title': 'Configure Model Routes',
                'apikeys.loading': 'Loading API keys...',
                
                // Model Routes
                'model_routes.title': 'Model Routes Configuration',
                'model_routes.subtitle': 'Configure model routing rules for this API key',
                'model_routes.add_route': 'Add Model Route',
                'model_routes.edit_route': 'Edit Model Route',
                'model_routes.delete_confirm': 'Are you sure you want to delete this route?',
                'model_routes.save_success': 'Model routes saved successfully',
                'model_routes.save_error': 'Failed to save model routes',
                'model_routes.required_fields': 'Please fill in all required fields',
                'model_routes.priority_error': 'Priority must be a valid number >= 0',
                'model_routes.route_saved': 'Route saved successfully. Don\'t forget to save changes.',
                'model_routes.source_model': 'Source Model',
                'model_routes.target_model': 'Target Model',
                'model_routes.target_provider': 'Target Provider',
                'model_routes.priority': 'Priority',
                'model_routes.description': 'Description',
                'model_routes.enabled': 'Enabled',
                'model_routes.save_changes': 'Save Changes',
                'model_routes.close': 'Close',
                'routes.no_routes': 'No routes configured',
                'routes.config_title': 'Model Routes Configuration',
                'routes.add_route': '+ Add Route',
                'routes.add_route_title': 'Add Model Route',
                'routes.loading': 'Loading routes...',
                'routes.save_changes': 'Save Changes',
                'routes.table.source_model': 'Source Model',
                'routes.table.target_model': 'Target Model',
                'routes.table.provider': 'Provider',
                'routes.table.priority': 'Priority',
                'routes.table.status': 'Status',
                'routes.table.actions': 'Actions',
                'routes.form.source_model': 'Source Model',
                'routes.form.target_model': 'Target Model',
                'routes.form.target_provider': 'Target Provider',
                'routes.form.priority': 'Priority',
                'routes.form.description': 'Description',
                'routes.form.enabled': 'Enabled',
                'routes.form.save_route': 'Save Route',
                'routes.form.select_provider': 'Select Provider',
                'routes.form.source_placeholder': 'e.g., gpt-4* or claude-*',
                'routes.form.target_placeholder': 'e.g., gpt-4-turbo-preview',
                'routes.form.description_placeholder': 'Optional description',
                'routes.form.source_help': 'Use * for wildcards (e.g., gpt-4* matches all GPT-4 variants)',
                'routes.form.priority_help': 'Lower numbers = higher priority',
                'routes.key_name_prefix': 'API Key:',
                'routes.description': 'Configure routing rules to redirect specific models to different providers.',
                'routes.priority_info': 'Lower priority numbers take precedence over higher numbers.',
                'routes.auto_save_info': 'Changes are automatically saved when you add, edit, or delete routes.',
                'routes.route_saved_and_applied': 'Route saved and applied successfully!',
                'routes.route_deleted': 'Route deleted successfully!',
                'routes.delete_error': 'Failed to delete route',
                
                // Common
                'common.edit': 'Edit',
                'common.delete': 'Delete',
                'common.enabled': 'Enabled',
                'common.disabled': 'Disabled',
                'common.status': 'Status',
                
                // Global Routes
                'global_routes.title': 'Global Model Routes',
                'global_routes.subtitle': 'Configure global model routing rules and fallback behaviors',
                'global_routes.add_route': '+ Add Route',
                'global_routes.refresh': 'Refresh',
                'global_routes.loading': 'Loading global routes...',
                'global_routes.add_route_title': 'Add Global Route',
                'global_routes.load_error': 'Failed to load global routes',
                'stats.routes': 'Routes',
                
                // Configuration
                'config.title': 'System Configuration',
                'config.subtitle': 'View current system settings and operational parameters',
                'config.server': 'Server Configuration',
                'config.proxy': 'Proxy Configuration',
                'config.logging': 'Logging',
                'config.host': 'Host:',
                'config.port': 'Port:',
                'config.timeout': 'Timeout:',
                'config.request_timeout': 'Request Timeout:',
                'config.stream_timeout': 'Stream Timeout:',
                'config.connect_timeout': 'Connect Timeout:',
                'config.response_timeout': 'Response Timeout:',
                'config.level': 'Level:',
                'config.format': 'Format:',
                'config.unlimited': 'Unlimited',
                
                // Modals
                'modal.add_upstream': 'Add Upstream Account',
                'modal.generate_key': 'Generate API Key',
                'modal.key_generated': 'API Key Generated',
                'modal.cancel': 'Cancel',
                'modal.add': 'Add Account',
                'modal.generate': 'Generate Key',
                'modal.saved': "I've Saved It",
                'modal.copy': 'Copy',
                'modal.warning': 'Important: This is the only time you\'ll see this key. Please copy and store it securely.',
                'modal.close': 'Close',
                
                // Forms
                'form.name': 'Name:',
                'form.provider': 'Provider:',
                'form.type': 'Type:',
                'form.api_key': 'API Key:',
                'form.permissions': 'Permissions:',
                'form.read': 'Read',
                'form.write': 'Write',
                'form.client_id': 'Client ID:',
                'form.client_secret': 'Client Secret:',
                'form.redirect_uri': 'Redirect URI:',
                'form.scopes': 'Scopes (optional):',
                'form.base_url': 'Base URL (optional):',
                'form.base_url_placeholder': 'https://custom-api-endpoint.com',
                'form.oauth_info': 'OAuth accounts use predefined client credentials. Only Anthropic and Qwen providers support OAuth.',
                
                // Status
                'status.active': 'Active',
                'status.inactive': 'Inactive',
                'status.healthy': 'Healthy',
                'status.unhealthy': 'Unhealthy',
                'status.unknown': 'Unknown',
                
                // Messages
                'msg.confirm_delete_upstream': 'Are you sure you want to delete this upstream account?',
                'msg.confirm_delete_apikey': 'Are you sure you want to delete this API key?',
                'msg.upstream_added': 'Upstream account added successfully',
                'msg.upstream_deleted': 'Upstream account deleted successfully',
                'msg.apikey_deleted': 'API key deleted successfully',
                'msg.copied': 'Copied to clipboard!',
                'msg.copy_failed': 'Failed to copy to clipboard',
                
                // Stats
                'stats.total': 'Total',
                'stats.active': 'Active',
                'stats.healthy': 'Healthy',
                'stats.providers': 'Providers',
                'stats.accounts': 'Accounts',
                'stats.keys': 'Keys',
                'stats.requests': 'Requests',
                'stats.total_requests': 'Total Requests',
                'stats.recent_usage': 'Recent Usage',
                'stats.last_24h': 'Last 24h',
                'stats.no_data': 'No data',
                'stats.never': 'Never',
                'stats.requests_label': 'requests',
                'stats.tokens_label': 'tokens',
                'stats.success_label': 'success',
                'stats.last_label': 'Last',
                'stats.avg_label': 'avg',
                'stats.errors_label': 'errors',
                
                // Common
                'common.loading': 'Loading...',
                'common.error': 'Error',
                'common.success': 'Success',
                'common.close': 'Close',
            },
            zh: {
                // Header
                'header.title': 'LLM Gateway',
                'header.subtitle': '管理控制台',
                'header.status': '在线',
                
                // Login
                'login.title': 'LLM Gateway',
                'login.subtitle': '管理控制台',
                'login.password': '密码',
                'login.password_placeholder': '请输入密码',
                'login.sign_in': '登录',
                'login.footer': '安全访问您的 LLM Gateway 实例',
                
                // Settings
                'settings.title': '设置',
                'settings.subtitle': '管理系统安全和配置',
                'settings.security': '安全设置',
                'settings.security_subtitle': '更新您的系统密码',
                'settings.change_password': '修改密码',
                'settings.current_password': '当前密码',
                'settings.current_password_placeholder': '请输入当前密码',
                'settings.new_password': '新密码',
                'settings.new_password_placeholder': '请输入新密码（至少6位）',
                'settings.confirm_password': '确认新密码',
                'settings.confirm_password_placeholder': '请确认新密码',
                'settings.update_password': '更新密码',
                'settings.cancel': '取消',
                'settings.session': '会话管理',
                'settings.session_subtitle': '管理活动会话',
                'settings.active_sessions': '活动会话',
                'settings.current_session': '当前会话',
                'settings.logged_in_at': '登录时间：',
                'settings.logout': '注销',
                
                // Navigation
                'nav.dashboard': '仪表板',
                'nav.upstream': '上游账号',
                'nav.apikeys': 'API 密钥',
                'nav.config': '配置',
                'nav.model_routes': '模型路由',
                
                // Dashboard
                'dashboard.title': '系统仪表板',
                'dashboard.subtitle': '监控系统健康状况和性能指标',
                'dashboard.system_status': '系统状态',
                'dashboard.upstream_accounts': '上游账号',
                'dashboard.api_keys': 'API 密钥',
                'dashboard.server_info': '服务器信息',
                'dashboard.total_accounts': '账号总数',
                'dashboard.active_keys': '活跃密钥',
                'dashboard.healthy': '健康',
                'dashboard.unhealthy': '不健康',
                'dashboard.loading': '加载中...',
                
                // Upstream Accounts
                'upstream.title': '上游账号',
                'upstream.subtitle': '管理AI提供商连接和配置',
                'upstream.add_account': '+ 添加账号',
                'upstream.refresh': '刷新',
                'upstream.no_accounts': '未找到上游账号',
                'upstream.table.name': '名称',
                'upstream.table.provider': '提供商',
                'upstream.table.type': '类型',
                'upstream.table.status': '状态',
                'upstream.table.health': '健康状态',
                'upstream.table.usage': '使用统计',
                'upstream.table.actions': '操作',
                'upstream.delete': '删除',
                'upstream.loading': '正在加载上游账号...',
                
                // API Keys
                'apikeys.title': 'API 密钥',
                'apikeys.subtitle': '管理网关认证令牌和访问控制',
                'apikeys.generate_key': '+ 生成密钥',
                'apikeys.refresh': '刷新',
                'apikeys.no_keys': '未找到API密钥',
                'apikeys.table.name': '名称',
                'apikeys.table.permissions': '权限',
                'apikeys.table.status': '状态',
                'apikeys.table.usage': '使用统计',
                'apikeys.table.created': '创建时间',
                'apikeys.table.actions': '操作',
                'apikeys.delete': '删除',
                'apikeys.configure_routes': '路由',
                'apikeys.configure_routes_title': '配置模型路由',
                'apikeys.loading': '正在加载API密钥...',
                
                // Model Routes
                'model_routes.title': '模型路由配置',
                'model_routes.subtitle': '为此API密钥配置模型路由规则',
                'model_routes.add_route': '添加模型路由',
                'model_routes.edit_route': '编辑模型路由',
                'model_routes.delete_confirm': '确定要删除此路由吗？',
                'model_routes.save_success': '模型路由保存成功',
                'model_routes.save_error': '保存模型路由失败',
                'model_routes.required_fields': '请填写所有必填字段',
                'model_routes.priority_error': '优先级必须是大于等于0的有效数字',
                'model_routes.route_saved': '路由保存成功。别忘了保存更改。',
                'model_routes.source_model': '源模型',
                'model_routes.target_model': '目标模型',
                'model_routes.target_provider': '目标提供商',
                'model_routes.priority': '优先级',
                'model_routes.description': '描述',
                'model_routes.enabled': '启用',
                'model_routes.save_changes': '保存更改',
                'model_routes.close': '关闭',
                'routes.no_routes': '未配置路由',
                'routes.config_title': '模型路由配置',
                'routes.add_route': '+ 添加路由',
                'routes.add_route_title': '添加模型路由',
                'routes.loading': '正在加载路由...',
                'routes.save_changes': '保存更改',
                'routes.table.source_model': '源模型',
                'routes.table.target_model': '目标模型',
                'routes.table.provider': '提供商',
                'routes.table.priority': '优先级',
                'routes.table.status': '状态',
                'routes.table.actions': '操作',
                'routes.form.source_model': '源模型',
                'routes.form.target_model': '目标模型',
                'routes.form.target_provider': '目标提供商',
                'routes.form.priority': '优先级',
                'routes.form.description': '描述',
                'routes.form.enabled': '启用',
                'routes.form.save_route': '保存路由',
                'routes.form.select_provider': '选择提供商',
                'routes.form.source_placeholder': '例如：gpt-4* 或 claude-*',
                'routes.form.target_placeholder': '例如：gpt-4-turbo-preview',
                'routes.form.description_placeholder': '可选描述',
                'routes.form.source_help': '使用 * 作为通配符（例如：gpt-4* 匹配所有 GPT-4 变体）',
                'routes.form.priority_help': '数字越小优先级越高',
                'routes.key_name_prefix': 'API 密钥：',
                'routes.description': '配置路由规则以将特定模型重定向到不同的提供商。',
                'routes.priority_info': '优先级数字越小，优先级越高。',
                'routes.auto_save_info': '添加、编辑或删除路由时会自动保存更改。',
                'routes.route_saved_and_applied': '路由已保存并生效！',
                'routes.route_deleted': '路由删除成功！',
                'routes.delete_error': '删除路由失败',
                
                // Common
                'common.edit': '编辑',
                'common.delete': '删除',
                'common.enabled': '启用',
                'common.disabled': '禁用',
                'common.status': '状态',
                
                // Global Routes
                'global_routes.title': '全局模型路由',
                'global_routes.subtitle': '配置全局模型路由规则和回退行为',
                'global_routes.add_route': '+ 添加路由',
                'global_routes.refresh': '刷新',
                'global_routes.loading': '正在加载全局路由...',
                'global_routes.add_route_title': '添加全局路由',
                'global_routes.load_error': '加载全局路由失败',
                'stats.routes': '路由',
                
                // Configuration
                'config.title': '系统配置',
                'config.subtitle': '查看当前系统设置和操作参数',
                'config.server': '服务器配置',
                'config.proxy': '代理配置',
                'config.logging': '日志配置',
                'config.host': '主机：',
                'config.port': '端口：',
                'config.timeout': '超时：',
                'config.request_timeout': '请求超时：',
                'config.stream_timeout': '流超时：',
                'config.connect_timeout': '连接超时：',
                'config.response_timeout': '响应超时：',
                'config.level': '级别：',
                'config.format': '格式：',
                'config.unlimited': '无限制',
                
                // Modals
                'modal.add_upstream': '添加上游账号',
                'modal.generate_key': '生成API密钥',
                'modal.key_generated': 'API密钥已生成',
                'modal.cancel': '取消',
                'modal.add': '添加账号',
                'modal.generate': '生成密钥',
                'modal.saved': '我已保存',
                'modal.copy': '复制',
                'modal.warning': '重要提示：这是您唯一看到此密钥的机会。请复制并安全保存。',
                'modal.close': '关闭',
                
                // Forms
                'form.name': '名称：',
                'form.provider': '提供商：',
                'form.type': '类型：',
                'form.api_key': 'API密钥：',
                'form.permissions': '权限：',
                'form.read': '读取',
                'form.write': '写入',
                'form.client_id': '客户端ID：',
                'form.client_secret': '客户端密钥：',
                'form.redirect_uri': '重定向URI：',
                'form.scopes': '权限范围（可选）：',
                'form.base_url': '基础URL（可选）：',
                'form.base_url_placeholder': 'https://自定义API端点.com',
                'form.oauth_info': 'OAuth账号使用预定义的客户端凭据。仅Anthropic和Qwen提供商支持OAuth。',
                
                // Status
                'status.active': '活跃',
                'status.inactive': '非活跃',
                'status.healthy': '健康',
                'status.unhealthy': '不健康',
                'status.unknown': '未知',
                
                // Messages
                'msg.confirm_delete_upstream': '确定要删除此上游账号吗？',
                'msg.confirm_delete_apikey': '确定要删除此API密钥吗？',
                'msg.upstream_added': '上游账号添加成功',
                'msg.upstream_deleted': '上游账号删除成功',
                'msg.apikey_deleted': 'API密钥删除成功',
                'msg.copied': '已复制到剪贴板！',
                'msg.copy_failed': '复制到剪贴板失败',
                
                // Stats
                'stats.total': '总计',
                'stats.active': '活跃',
                'stats.healthy': '健康',
                'stats.providers': '提供商',
                'stats.accounts': '账号',
                'stats.keys': '密钥',
                'stats.requests': '请求',
                'stats.total_requests': '总请求数',
                'stats.recent_usage': '最近使用',
                'stats.last_24h': '最近24小时',
                'stats.no_data': '无数据',
                'stats.never': '从未',
                'stats.requests_label': '请求',
                'stats.tokens_label': '令牌',
                'stats.success_label': '成功',
                'stats.last_label': '最后',
                'stats.avg_label': '平均',
                'stats.errors_label': '错误',
                
                // Common
                'common.loading': '加载中...',
                'common.error': '错误',
                'common.success': '成功',
                'common.close': '关闭',
            }
        };
    }

    // Get translation for a key
    t(key, fallback = key) {
        const translation = this.translations[this.currentLang]?.[key];
        return translation || fallback;
    }

    // Set language
    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            localStorage.setItem('language', lang);
            this.updateUI();
        }
    }

    // Get current language
    getCurrentLanguage() {
        return this.currentLang;
    }

    // Update UI elements with current language
    updateUI() {
        // Update elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.t(key);
        });

        // Update elements with data-i18n-placeholder attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });

        // Update elements with data-i18n-title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });

        // Update HTML lang attribute
        document.documentElement.lang = this.currentLang;
    }

    // Initialize i18n
    init() {
        this.updateUI();
        this.addLanguageSwitcher();
    }

    // Add language switcher to header
    addLanguageSwitcher() {
        const headerInfo = document.querySelector('.header-info');
        if (headerInfo && !document.getElementById('lang-switcher')) {
            const langSwitcher = document.createElement('div');
            langSwitcher.id = 'lang-switcher';
            langSwitcher.innerHTML = `
                <span>•</span>
                <select id="language-select" style="background: transparent; border: none; color: inherit; cursor: pointer;">
                    <option value="en" ${this.currentLang === 'en' ? 'selected' : ''}>EN</option>
                    <option value="zh" ${this.currentLang === 'zh' ? 'selected' : ''}>中文</option>
                </select>
            `;
            headerInfo.appendChild(langSwitcher);

            // Add event listener
            document.getElementById('language-select').addEventListener('change', (e) => {
                this.setLanguage(e.target.value);
            });
        }
    }
}

// Create global i18n instance
window.i18n = new I18n();