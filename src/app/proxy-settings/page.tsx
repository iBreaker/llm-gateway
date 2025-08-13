'use client';

import React, { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, PencilIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface ProxyConfig {
  id: string;
  name: string;
  proxy_type: 'http' | 'https' | 'socks5';
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
  default_proxy_id?: string;
  global_proxy_enabled: boolean;
}

export default function ProxySettingsPage() {
  const [systemConfig, setSystemConfig] = useState<SystemProxyConfig>({
    proxies: {},
    global_proxy_enabled: false
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
      // TODO: 实际的API调用
      // const response = await fetch('/api/proxy-settings');
      // const config = await response.json();
      // setSystemConfig(config);
      
      // 暂时使用模拟数据
      const mockConfig: SystemProxyConfig = {
        proxies: {
          'corp-http': {
            id: 'corp-http',
            name: '企业HTTP代理',
            proxy_type: 'http',
            host: '10.0.0.100',
            port: 8080,
            enabled: true
          },
          'secure-https': {
            id: 'secure-https', 
            name: '安全HTTPS代理',
            proxy_type: 'https',
            host: 'secure.proxy.com',
            port: 3128,
            enabled: true,
            auth: {
              username: 'admin',
              password: '***'
            }
          }
        },
        default_proxy_id: 'corp-http',
        global_proxy_enabled: true
      };
      setSystemConfig(mockConfig);
    } catch (error) {
      console.error('加载代理配置失败:', error);
    }
  };

  const handleAddProxy = () => {
    setEditingProxy({
      id: '',
      name: '',
      proxy_type: 'http',
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
      if (!proxy.id) {
        proxy.id = `proxy-${Date.now()}`;
      }
      
      // TODO: 实际的API调用
      // await fetch('/api/proxy-settings', {
      //   method: proxy.id in systemConfig.proxies ? 'PUT' : 'POST',
      //   body: JSON.stringify(proxy)
      // });
      
      setSystemConfig(prev => ({
        ...prev,
        proxies: {
          ...prev.proxies,
          [proxy.id]: proxy
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
      // TODO: 实际的API调用
      // await fetch(`/api/proxy-settings/${proxyId}`, { method: 'DELETE' });
      
      const newProxies = { ...systemConfig.proxies };
      delete newProxies[proxyId];
      
      setSystemConfig(prev => ({
        ...prev,
        proxies: newProxies,
        default_proxy_id: prev.default_proxy_id === proxyId ? undefined : prev.default_proxy_id
      }));
    } catch (error) {
      console.error('删除代理配置失败:', error);
    }
  };

  const handleTestProxy = async (proxyId: string) => {
    setTestingProxy(proxyId);
    
    try {
      // TODO: 实际的API调用
      // const response = await fetch(`/api/proxy-settings/${proxyId}/test`);
      // const result = await response.json();
      
      // 模拟测试
      await new Promise(resolve => setTimeout(resolve, 2000));
      const isValid = Math.random() > 0.3; // 70%成功率
      
      setTestResults(prev => ({
        ...prev,
        [proxyId]: isValid
      }));
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
      // TODO: 实际的API调用
      setSystemConfig(prev => ({
        ...prev,
        default_proxy_id: proxyId
      }));
    } catch (error) {
      console.error('设置默认代理失败:', error);
    }
  };

  const handleToggleGlobalProxy = async () => {
    try {
      // TODO: 实际的API调用
      setSystemConfig(prev => ({
        ...prev,
        global_proxy_enabled: !prev.global_proxy_enabled
      }));
    } catch (error) {
      console.error('切换全局代理状态失败:', error);
    }
  };

  const proxies = Object.values(systemConfig.proxies);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">代理设置</h1>
        <p className="text-gray-600 mt-2">
          配置系统级代理设置，支持HTTP、HTTPS和SOCKS5代理
        </p>
      </div>

      {/* 全局代理开关 */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">全局设置</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">启用全局代理</h3>
              <p className="text-gray-600">启用后，所有上游请求将使用配置的代理</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={systemConfig.global_proxy_enabled}
                onChange={handleToggleGlobalProxy}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 代理列表 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">代理配置</h2>
          <button
            onClick={handleAddProxy}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2"
          >
            <PlusIcon className="h-5 w-5" />
            添加代理
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  地址
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  默认
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {proxies.map((proxy) => (
                <tr key={proxy.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{proxy.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      proxy.proxy_type === 'http' ? 'bg-blue-100 text-blue-800' :
                      proxy.proxy_type === 'https' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {proxy.proxy_type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {proxy.host}:{proxy.port}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {proxy.enabled ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          <CheckCircleIcon className="h-3 w-3 mr-1" />
                          启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    {systemConfig.default_proxy_id === proxy.id ? (
                      <span className="text-blue-600 font-medium">默认</span>
                    ) : (
                      <button
                        onClick={() => handleSetDefault(proxy.id)}
                        className="text-gray-400 hover:text-blue-600"
                      >
                        设为默认
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestProxy(proxy.id)}
                        disabled={testingProxy === proxy.id}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
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
              ))}
              {proxies.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
暂无代理配置，点击&quot;添加代理&quot;开始配置
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
            <label className="block text-sm font-medium text-gray-700">名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="代理服务器名称"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">类型</label>
            <select
              value={formData.proxy_type}
              onChange={(e) => setFormData(prev => ({ ...prev, proxy_type: e.target.value as any }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">主机</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData(prev => ({ ...prev, host: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="192.168.1.1"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">端口</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData(prev => ({ ...prev, port: parseInt(e.target.value) || 8080 }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm text-gray-900">启用此代理</label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              checked={showAuth}
              onChange={(e) => setShowAuth(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm text-gray-900">需要认证</label>
          </div>

          {showAuth && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">用户名</label>
                <input
                  type="text"
                  value={formData.auth?.username || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    auth: { ...prev.auth, username: e.target.value, password: prev.auth?.password || '' }
                  }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">密码</label>
                <input
                  type="password"
                  value={formData.auth?.password || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    auth: { ...prev.auth, username: prev.auth?.username || '', password: e.target.value }
                  }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}