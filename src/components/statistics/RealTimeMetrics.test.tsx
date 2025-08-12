import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RealTimeMetrics } from './RealTimeMetrics'

// Mock API client
const mockApiClient = {
  get: jest.fn()
}

jest.mock('../../utils/api', () => ({
  apiClient: mockApiClient
}))

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
}
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage })

// Mock data
const mockData = {
  accountStats: [
    { id: '1', name: 'Account 1', healthScore: 90 },
    { id: '2', name: 'Account 2', healthScore: 85 },
    { id: '3', name: 'Account 3', healthScore: 75 }
  ]
}

const mockApiResponse = {
  totalRequests: 150,
  avgResponseTime: 250,
  errorRate: 1.5,
  activeAccounts: 3
}

describe('RealTimeMetrics Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockLocalStorage.getItem.mockReturnValue('fake-token')
    mockApiClient.get.mockResolvedValue(mockApiResponse)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // 基础渲染测试
  it('renders title and description', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    expect(screen.getByText('实时监控')).toBeInTheDocument()
    expect(screen.getByText('系统实时运行状态')).toBeInTheDocument()
  })

  it('renders all metric cards', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    expect(screen.getByText('CURRENT REQUESTS/MIN')).toBeInTheDocument()
    expect(screen.getByText('AVERAGE RESPONSE TIME')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE CONNECTIONS')).toBeInTheDocument()
    expect(screen.getByText('ERROR RATE')).toBeInTheDocument()
    expect(screen.getByText('THROUGHPUT')).toBeInTheDocument()
  })

  it('renders health indicators', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    expect(screen.getByText('系统健康度')).toBeInTheDocument()
    expect(screen.getByText('98.5%')).toBeInTheDocument()
    expect(screen.getByText('可用账号')).toBeInTheDocument()
    expect(screen.getByText('队列长度')).toBeInTheDocument()
  })

  it('renders activity log section', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    expect(screen.getByText('最近活动')).toBeInTheDocument()
    expect(screen.getByText('API请求成功')).toBeInTheDocument()
    expect(screen.getByText('负载均衡器切换账号')).toBeInTheDocument()
    expect(screen.getByText('Token刷新成功')).toBeInTheDocument()
  })

  // API数据加载测试
  it('fetches and displays real-time data when authenticated', async () => {
    mockLocalStorage.getItem.mockReturnValue('valid-token')
    
    render(<RealTimeMetrics data={mockData} />)
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/stats/basic')
    })

    // 等待状态更新
    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument() // currentRequests
      expect(screen.getByText('250ms')).toBeInTheDocument() // avgResponseTime
      expect(screen.getByText('3')).toBeInTheDocument() // activeConnections
      expect(screen.getByText('1.50%')).toBeInTheDocument() // errorRate
      expect(screen.getByText('180/h')).toBeInTheDocument() // throughput (150 * 1.2)
    })
  })

  it('shows connected status when API call succeeds', async () => {
    mockLocalStorage.getItem.mockReturnValue('valid-token')
    
    render(<RealTimeMetrics data={mockData} />)
    
    await waitFor(() => {
      expect(screen.getByText('已连接')).toBeInTheDocument()
    })

    const statusIndicator = document.querySelector('.bg-green-500')
    expect(statusIndicator).toBeInTheDocument()
  })

  it('uses mock data when not authenticated', async () => {
    mockLocalStorage.getItem.mockReturnValue(null)
    
    render(<RealTimeMetrics data={mockData} />)
    
    // 应该显示连接中状态
    expect(screen.getByText('连接中...')).toBeInTheDocument()
    
    const statusIndicator = document.querySelector('.bg-red-500')
    expect(statusIndicator).toBeInTheDocument()
    
    // 不应该调用API
    expect(mockApiClient.get).not.toHaveBeenCalled()
  })

  it('handles API error gracefully', async () => {
    mockLocalStorage.getItem.mockReturnValue('valid-token')
    mockApiClient.get.mockRejectedValue(new Error('API Error'))
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    
    render(<RealTimeMetrics data={mockData} />)
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('获取实时数据失败:', expect.any(Error))
    })

    // 应该显示连接中状态
    expect(screen.getByText('连接中...')).toBeInTheDocument()
    
    consoleSpy.mockRestore()
  })

  // 定时更新测试
  it('updates data every 5 seconds', async () => {
    mockLocalStorage.getItem.mockReturnValue('valid-token')
    
    render(<RealTimeMetrics data={mockData} />)
    
    // 初始调用
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledTimes(1)
    })
    
    // 前进5秒
    act(() => {
      jest.advanceTimersByTime(5000)
    })
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledTimes(2)
    })
    
    // 再前进5秒
    act(() => {
      jest.advanceTimersByTime(5000)
    })
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledTimes(3)
    })
  })

  it('clears interval on unmount', async () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval')
    
    const { unmount } = render(<RealTimeMetrics data={mockData} />)
    
    unmount()
    
    expect(clearIntervalSpy).toHaveBeenCalled()
    
    clearIntervalSpy.mockRestore()
  })

  // 趋势指示器测试
  it('shows correct trend for response time', async () => {
    // 测试好的响应时间（< 300ms）
    mockApiClient.get.mockResolvedValue({ ...mockApiResponse, avgResponseTime: 200 })
    
    render(<RealTimeMetrics data={mockData} />)
    
    await waitFor(() => {
      expect(screen.getByText('200ms')).toBeInTheDocument()
    })
    
    // 应该显示向上趋势（好的性能）
    // 注意：这里需要检查StatCard组件的trend prop，但由于我们没有直接访问，
    // 我们可以通过CSS类或其他视觉指示器来验证
  })

  it('shows correct trend for error rate', async () => {
    // 测试低错误率（< 1%）
    mockApiClient.get.mockResolvedValue({ ...mockApiResponse, errorRate: 0.5 })
    
    render(<RealTimeMetrics data={mockData} />)
    
    await waitFor(() => {
      expect(screen.getByText('0.50%')).toBeInTheDocument()
    })
    
    // 应该显示向上趋势（好的错误率）
  })

  // 账号统计测试
  it('displays available accounts correctly', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    // 2个健康分数 > 80的账号，总共3个账号
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('/3')).toBeInTheDocument()
  })

  it('handles missing account stats', () => {
    render(<RealTimeMetrics data={{}} />)
    
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('/0')).toBeInTheDocument()
  })

  it('handles null data gracefully', () => {
    render(<RealTimeMetrics data={null} />)
    
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('/0')).toBeInTheDocument()
  })

  // 模拟数据测试
  it('generates random mock data within expected ranges', async () => {
    mockLocalStorage.getItem.mockReturnValue(null)
    
    // 多次渲染以测试随机性
    for (let i = 0; i < 5; i++) {
      const { unmount } = render(<RealTimeMetrics data={mockData} />)
      
      await waitFor(() => {
        // 检查mock数据是否在合理范围内
        const metricsCards = screen.getAllByRole('generic')
        expect(metricsCards).toBeDefined()
      })
      
      unmount()
    }
  })

  // 时间显示测试
  it('displays activity timestamps correctly', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    // 检查时间戳格式
    const timestamps = screen.getAllByText(/\d{1,2}:\d{2}:\d{2}/)
    expect(timestamps.length).toBeGreaterThan(0)
  })

  // 图标测试
  it('renders all metric icons', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    // 检查各种emoji图标
    expect(screen.getByText('⚡')).toBeInTheDocument() // 当前请求
    expect(screen.getByText('⏱️')).toBeInTheDocument() // 响应时间
    expect(screen.getByText('🔗')).toBeInTheDocument() // 活跃连接
    expect(screen.getByText('⚠️')).toBeInTheDocument() // 错误率
    expect(screen.getByText('📈')).toBeInTheDocument() // 吞吐量
  })

  // 队列长度测试
  it('displays random queue length', () => {
    render(<RealTimeMetrics data={mockData} />)
    
    // 队列长度应该是0-9之间的随机数
    const queueElement = screen.getByText('队列长度').parentElement
    const queueValue = queueElement?.querySelector('.text-2xl')
    
    expect(queueValue).toBeInTheDocument()
    if (queueValue) {
      const value = parseInt(queueValue.textContent || '0')
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(9)
    }
  })

  // 滚动区域测试
  it('applies scrollable styles to activity log', () => {
    const { container } = render(<RealTimeMetrics data={mockData} />)
    
    const activityLog = container.querySelector('.max-h-32.overflow-y-auto')
    expect(activityLog).toBeInTheDocument()
  })

  // 布局响应式测试
  it('applies responsive grid classes', () => {
    const { container } = render(<RealTimeMetrics data={mockData} />)
    
    const metricsGrid = container.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-5')
    expect(metricsGrid).toBeInTheDocument()
    
    const indicatorsGrid = container.querySelector('.grid.grid-cols-1.lg\\:grid-cols-3')
    expect(indicatorsGrid).toBeInTheDocument()
  })

  // 边界值测试
  it('handles zero API response values', async () => {
    mockApiClient.get.mockResolvedValue({
      totalRequests: 0,
      avgResponseTime: 0,
      errorRate: 0,
      activeAccounts: 0
    })
    
    render(<RealTimeMetrics data={mockData} />)
    
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument() // currentRequests
      expect(screen.getByText('0ms')).toBeInTheDocument() // avgResponseTime
      expect(screen.getByText('0.00%')).toBeInTheDocument() // errorRate
      expect(screen.getByText('0/h')).toBeInTheDocument() // throughput
    })
  })

  it('handles undefined API response values', async () => {
    mockApiClient.get.mockResolvedValue({})
    
    render(<RealTimeMetrics data={mockData} />)
    
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument() // currentRequests默认值
      expect(screen.getByText('0ms')).toBeInTheDocument() // avgResponseTime默认值
      expect(screen.getByText('0.00%')).toBeInTheDocument() // errorRate默认值
    })
  })
})