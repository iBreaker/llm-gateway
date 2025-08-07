'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '../../utils/api'

interface RustStatsData {
  total_requests: number
  successful_requests: number
  failed_requests: number
  total_tokens: number
  total_cost: number
  average_response_time: number
}

interface NextStatsData {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  totalTokens: number
  totalCost: number
  averageResponseTime: number
}

interface HybridStats {
  rust: RustStatsData | null
  nextjs: NextStatsData | null
  error: string | null
}

export default function HybridStatsDashboard() {
  const [stats, setStats] = useState<HybridStats>({
    rust: null,
    nextjs: null,
    error: null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHybridStats()
  }, [])

  const fetchHybridStats = async () => {
    setLoading(true)
    const newStats: HybridStats = { rust: null, nextjs: null, error: null }

    // 获取 Rust 后端统计
    try {
      const rustData = await apiClient.get<{
        totalRequests: number,
        successRate: number,
        totalCost: number,
        avgResponseTime: number
      }>('/api/stats/basic')
      
      // 转换为旧格式以保持兼容性
      newStats.rust = {
        total_requests: rustData.totalRequests,
        successful_requests: rustData.totalRequests * (rustData.successRate / 100),
        failed_requests: rustData.totalRequests * (1 - rustData.successRate / 100),
        total_tokens: 0, // 基础统计中没有token信息
        total_cost: rustData.totalCost,
        average_response_time: rustData.avgResponseTime
      }
    } catch (error) {
      console.warn('Rust stats unavailable:', error)
    }

    // Next.js已被Rust后端替代，设置为null
    newStats.nextjs = null

    if (!newStats.rust && !newStats.nextjs) {
      newStats.error = 'Unable to fetch stats from both backends'
    }

    setStats(newStats)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">加载中...</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white p-6 rounded-lg shadow-sm border">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🦀 混合架构统计仪表板
          </h1>
          <p className="text-gray-600">
            同时展示 Rust 高性能后端和 Next.js 管理服务的统计数据
          </p>
        </div>

        {stats.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 font-medium mb-1">错误</h3>
            <p className="text-red-600">{stats.error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Rust 后端统计 */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                🦀 Rust 高性能后端
                {stats.rust && (
                  <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                    在线
                  </span>
                )}
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                核心 LLM 代理和负载均衡服务
              </p>
            </div>
            <div className="p-6">
              {stats.rust ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {stats.rust.total_requests.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">总请求数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {((stats.rust.successful_requests / stats.rust.total_requests) * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">成功率</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {stats.rust.total_tokens.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">总Token数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      ${stats.rust.total_cost.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600">总成本</div>
                  </div>
                  <div className="text-center col-span-2">
                    <div className="text-2xl font-bold text-indigo-600">
                      {stats.rust.average_response_time.toFixed(0)}ms
                    </div>
                    <div className="text-sm text-gray-600">平均响应时间</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-sm">
                    🔧 Rust 服务不可用
                  </div>
                  <p className="text-gray-500 text-xs mt-1">
                    请确保 Rust 服务在 localhost:8080 运行
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Next.js 管理服务统计 */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                ⚡ Next.js 管理服务
                {stats.nextjs && (
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                    在线
                  </span>
                )}
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                用户界面和配置管理
              </p>
            </div>
            <div className="p-6">
              {stats.nextjs ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {stats.nextjs.totalRequests?.toLocaleString() || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">总请求数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {stats.nextjs.totalRequests ? 
                        ((stats.nextjs.successfulRequests / stats.nextjs.totalRequests) * 100).toFixed(1) : 'N/A'}%
                    </div>
                    <div className="text-sm text-gray-600">成功率</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {stats.nextjs.totalTokens?.toLocaleString() || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">总Token数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      ${stats.nextjs.totalCost?.toFixed(2) || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">总成本</div>
                  </div>
                  <div className="text-center col-span-2">
                    <div className="text-2xl font-bold text-indigo-600">
                      {stats.nextjs.averageResponseTime?.toFixed(0) || 'N/A'}ms
                    </div>
                    <div className="text-sm text-gray-600">平均响应时间</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-sm">
                    ⚠️ Next.js API 不可用
                  </div>
                  <p className="text-gray-500 text-xs mt-1">
                    传统API可能需要认证
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 架构对比 */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              🏗️ 混合架构对比
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-3">🦀 Rust 后端优势</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    极高并发性能 (数万QPS)
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    内存安全和零拷贝
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    智能负载均衡算法
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    编译时类型检查
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-3">⚡ Next.js 前端优势</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    丰富的用户界面
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    配置和账号管理
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    OAuth认证流程
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    实时数据可视化
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 刷新按钮 */}
        <div className="mt-8 text-center">
          <button
            onClick={fetchHybridStats}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '刷新中...' : '🔄 刷新数据'}
          </button>
        </div>
      </div>
    </div>
  )
}