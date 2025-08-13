'use client';

import React, { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, PencilIcon, CheckCircleIcon, XCircleIcon, Globe } from 'lucide-react';
import { apiClient } from '../../utils/api';

interface ProxyConfig {
  id: string;
  name: string;
  proxyType: 'http' | 'socks5';
  host: string;
  port: number;
  enabled: boolean;
  auth?: {
    username: string;
    password: string;
  };
}

interface SystemProxyConfig {
  proxies: Record<string, ProxyConfig>;
  defaultProxyId?: string;
  globalProxyEnabled: boolean;
}

interface ProxyTestResult {
  success: boolean;
  responseTimeMs?: number;
  errorMessage?: string;
  proxyIp?: string;
}

export default function ProxySettingsTab() {
  const [systemConfig, setSystemConfig] = useState<SystemProxyConfig>({
    proxies: {},
    globalProxyEnabled: false
  });
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProxy, setEditingProxy] = useState<ProxyConfig | null>(null);
  const [testingProxy, setTestingProxy] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  // 加载代理配置
  useEffect(() => {
    loadProxyConfig();
  }, []);

  const loadProxyConfig = async () => {
    try {
      const config = await apiClient.get<SystemProxyConfig>('/api/proxies');
      console.log('🔍 加载的代理配置:', JSON.stringify(config, null, 2));
      setSystemConfig(config);
    } catch (error) {
      console.error('加载代理配置失败:', error);
      // 使用模拟数据作为回退
      const mockConfig: SystemProxyConfig = {
        proxies: {
          'corp-http': {
            id: 'corp-http',
            name: '企业HTTP代理',
            proxyType: 'http',
            host: '10.0.0.100',
            port: 8080,
            enabled: true
          },
          'secure-socks5': {
            id: 'secure-socks5', 
            name: '安全SOCKS5代理',
            proxyType: 'socks5',
            host: 'socks.proxy.com',
            port: 1080,
            enabled: true,
            auth: {
              username: 'admin',
              password: '***'
            }
          }
        },
        defaultProxyId: 'corp-http',
        globalProxyEnabled: true
      };
      setSystemConfig(mockConfig);
    }
  };

  const handleAddProxy = () => {
    setEditingProxy({
      id: '',
      name: '',
      proxyType: 'http',
      host: '',
      port: 8080,
      enabled: true
    });
    setShowAddModal(true);
  };

  const handleEditProxy = (proxy: ProxyConfig) => {
    setEditingProxy({ ...proxy });
    setShowAddModal(true);
  };

  const handleSaveProxy = async (proxy: ProxyConfig) => {
    try {
      const isNew = !proxy.id;
      const proxyData = {
        name: proxy.name,
        proxyType: proxy.proxyType || 'http',
        host: proxy.host,
        port: proxy.port,
        enabled: proxy.enabled,
        auth: proxy.auth ? {
          username: proxy.auth.username,
          password: proxy.auth.password
        } : undefined
      };
      
      let savedProxy: ProxyConfig;
      if (isNew) {
        savedProxy = await apiClient.post<ProxyConfig>('/api/proxies', proxyData);
      } else {
        savedProxy = await apiClient.put<ProxyConfig>(`/api/proxies/${proxy.id}`, proxyData);
      }
      
      setSystemConfig(prev => ({
        ...prev,
        proxies: {
          ...prev.proxies,
          [savedProxy.id]: savedProxy
        }
      }));
      
      setShowAddModal(false);
      setEditingProxy(null);
    } catch (error) {
      console.error('保存代理配置失败:', error);
    }
  };

  const handleDeleteProxy = async (proxyId: string) => {
    if (!confirm('确定要删除这个代理配置吗？')) return;
    
    try {
      await apiClient.delete(`/api/proxies/${proxyId}`);
      
      const newProxies = { ...systemConfig.proxies };
      delete newProxies[proxyId];
      
      setSystemConfig(prev => ({
        ...prev,
        proxies: newProxies,
        defaultProxyId: prev.defaultProxyId === proxyId ? undefined : prev.defaultProxyId
      }));
    } catch (error) {
      console.error('删除代理配置失败:', error);
    }
  };

  const handleTestProxy = async (proxyId: string) => {
    setTestingProxy(proxyId);
    
    try {
      const proxy = systemConfig.proxies[proxyId];
      if (!proxy) {
        throw new Error('代理配置不存在');
      }

      const result = await apiClient.post<ProxyTestResult>('/api/proxy/test', {
        proxyType: proxy.proxyType || 'http',
        host: proxy.host,
        port: proxy.port,
        username: proxy.auth?.username,
        password: proxy.auth?.password
      });

      setTestResults(prev => ({
        ...prev,
        [proxyId]: result.success
      }));

      if (result.success && result.proxyIp) {
        console.log(`✅ 代理测试成功，IP: ${result.proxyIp}, 响应时间: ${result.responseTimeMs}ms`);
      }
    } catch (error) {
      console.error('测试代理失败:', error);
      setTestResults(prev => ({
        ...prev,
        [proxyId]: false
      }));
    } finally {
      setTestingProxy(null);
    }
  };

  const handleSetDefault = async (proxyId: string) => {
    try {
      await apiClient.post('/api/proxies/default', { proxyId });
      
      setSystemConfig(prev => ({
        ...prev,
        defaultProxyId: proxyId
      }));
    } catch (error) {
      console.error('设置默认代理失败:', error);
    }
  };

  const handleToggleGlobalProxy = async () => {
    try {
      const newState = !systemConfig.globalProxyEnabled;
      
      await apiClient.post('/api/proxies/global', newState);
      
      setSystemConfig(prev => ({
        ...prev,
        globalProxyEnabled: newState
      }));
    } catch (error) {
      console.error('切换全局代理状态失败:', error);
    }
  };

  const proxies = Object.values(systemConfig.proxies);

  return (
    <div className="space-y-6">
      {/* 全局代理开关 */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <div className="px-4 py-3 border-b border-zinc-200">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Globe className="h-5 w-5 text-zinc-600" />
            代理设置
          </h3>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-zinc-900">启用全局代理</h4>
              <p className="text-sm text-zinc-600">启用后，所有上游请求将使用配置的代理</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={systemConfig.globalProxyEnabled}
                onChange={handleToggleGlobalProxy}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 代理列表 */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <div className="px-4 py-3 border-b border-zinc-200 flex justify-between items-center">
          <h3 className="text-lg font-medium">代理服务器</h3>
          <button
            onClick={handleAddProxy}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm flex items-center gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            添加代理
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  名称
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  类型
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  地址
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  默认
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {proxies.map((proxy) => {
                console.log('🔍 代理项数据:', proxy.name, proxy.proxyType, typeof proxy.proxyType);
                return (
                <tr key={proxy.id}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-zinc-900">{proxy.name}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      (proxy.proxyType || '').toLowerCase() === 'http' ? 'bg-blue-100 text-blue-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {proxy.proxyType?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-zinc-900">
                    {proxy.host}:{proxy.port}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {proxy.enabled ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          <CheckCircleIcon className="h-3 w-3 mr-1" />
                          启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-zinc-100 text-zinc-800 rounded-full">
                          <XCircleIcon className="h-3 w-3 mr-1" />
                          禁用
                        </span>
                      )}
                      {proxy.id in testResults && (
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                          testResults[proxy.id] ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {testResults[proxy.id] ? '✓ 可用' : '✗ 不可用'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {systemConfig.defaultProxyId === proxy.id ? (
                      <span className="text-blue-600 font-medium text-sm">默认</span>
                    ) : (
                      <button
                        onClick={() => handleSetDefault(proxy.id)}
                        className="text-zinc-400 hover:text-blue-600 text-sm"
                      >
                        设为默认
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestProxy(proxy.id)}
                        disabled={testingProxy === proxy.id}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50 text-sm"
                      >
                        {testingProxy === proxy.id ? '测试中...' : '测试'}
                      </button>
                      <button
                        onClick={() => handleEditProxy(proxy)}
                        className="text-yellow-600 hover:text-yellow-900"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProxy(proxy.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {proxies.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">
                    暂无代理配置，点击添加代理开始配置
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 添加/编辑代理模态框 */}
      {showAddModal && editingProxy && (
        <ProxyModal
          proxy={editingProxy}
          onSave={handleSaveProxy}
          onCancel={() => {
            setShowAddModal(false);
            setEditingProxy(null);
          }}
        />
      )}
    </div>
  );
}

interface ProxyModalProps {
  proxy: ProxyConfig;
  onSave: (proxy: ProxyConfig) => void;
  onCancel: () => void;
}

function ProxyModal({ proxy, onSave, onCancel }: ProxyModalProps) {
  const [formData, setFormData] = useState(proxy);
  const [showAuth, setShowAuth] = useState(!!proxy.auth);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.host.trim() || !formData.port) {
      alert('请填写完整的代理信息');
      return;
    }
    
    const proxyToSave = {
      ...formData,
      auth: showAuth && formData.auth?.username ? formData.auth : undefined
    };
    
    onSave(proxyToSave);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          {proxy.id ? '编辑代理' : '添加代理'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded border-zinc-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="代理服务器名称"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">类型</label>
            <select
              value={formData.proxyType}
              onChange={(e) => setFormData(prev => ({ ...prev, proxyType: e.target.value as any }))}
              className="mt-1 block w-full rounded border-zinc-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="http">HTTP（支持HTTP和HTTPS）</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">主机</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData(prev => ({ ...prev, host: e.target.value }))}
                className="mt-1 block w-full rounded border-zinc-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                placeholder="192.168.1.1"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">端口</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData(prev => ({ ...prev, port: parseInt(e.target.value) || 8080 }))}
                className="mt-1 block w-full rounded border-zinc-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                min="1"
                max="65535"
                required
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-zinc-300 rounded"
            />
            <label className="ml-2 block text-sm text-zinc-900">启用此代理</label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              checked={showAuth}
              onChange={(e) => setShowAuth(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-zinc-300 rounded"
            />
            <label className="ml-2 block text-sm text-zinc-900">需要认证</label>
          </div>

          {showAuth && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">用户名</label>
                <input
                  type="text"
                  value={formData.auth?.username || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    auth: { ...prev.auth, username: e.target.value, password: prev.auth?.password || '' }
                  }))}
                  className="mt-1 block w-full rounded border-zinc-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">密码</label>
                <input
                  type="password"
                  value={formData.auth?.password || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    auth: { ...prev.auth, username: prev.auth?.username || '', password: e.target.value }
                  }))}
                  className="mt-1 block w-full rounded border-zinc-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded hover:bg-zinc-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}