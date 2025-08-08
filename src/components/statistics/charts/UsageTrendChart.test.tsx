import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { UsageTrendChart } from './UsageTrendChart'

// 模拟数据
const mockData = [
  {
    timestamp: '2024-01-01T00:00:00Z',
    requests: 100,
    tokens: 5000,
    cost: 0.25,
    responseTime: 120,
    errorRate: 0.02
  },
  {
    timestamp: '2024-01-01T01:00:00Z',
    requests: 150,
    tokens: 7500,
    cost: 0.38,
    responseTime: 105,
    errorRate: 0.01
  },
  {
    timestamp: '2024-01-01T02:00:00Z',
    requests: 200,
    tokens: 10000,
    cost: 0.50,
    responseTime: 95,
    errorRate: 0.015
  }
]

describe('UsageTrendChart Component', () => {
  // 基础渲染测试
  it('renders chart title', () => {
    render(
      <UsageTrendChart 
        data={mockData}
        granularity="hour"
        title="Usage Trends"
      />
    )
    expect(screen.getByText('Usage Trends')).toBeInTheDocument()
  })

  it('renders legend items', () => {
    render(
      <UsageTrendChart 
        data={mockData}
        granularity="hour"
        title="Test Chart"
      />
    )
    
    expect(screen.getByText('请求数')).toBeInTheDocument()
    expect(screen.getByText('Token用量')).toBeInTheDocument()
    expect(screen.getByText('成本')).toBeInTheDocument()
    expect(screen.getByText('响应时间')).toBeInTheDocument()
  })

  // 空数据状态测试
  it('renders empty state when no data provided', () => {
    render(
      <UsageTrendChart 
        data={[]}
        granularity="hour"
        title="Empty Chart"
      />
    )
    
    expect(screen.getByText('Empty Chart')).toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  it('renders empty state when data is null/undefined', () => {
    render(
      <UsageTrendChart 
        data={null as any}
        granularity="hour"
        title="Null Data Chart"
      />
    )
    
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  // SVG图表渲染测试
  it('renders SVG chart when data is provided', () => {
    render(
      <UsageTrendChart 
        data={mockData}
        granularity="hour"
        title="Chart with Data"
      />
    )
    
    const svg = screen.getByRole('img', { hidden: true }) || document.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  // 粒度测试
  it('handles different granularity options', () => {
    const granularities = ['hour', 'day', 'week', 'month'] as const
    
    granularities.forEach(granularity => {
      const { unmount } = render(
        <UsageTrendChart 
          data={mockData}
          granularity={granularity}
          title={`${granularity} Chart`}
        />
      )
      
      expect(screen.getByText(`${granularity} Chart`)).toBeInTheDocument()
      unmount()
    })
  })

  // 数据处理测试
  it('processes data correctly with different granularities', () => {
    // 测试不同粒度下组件不崩溃
    const { rerender } = render(
      <UsageTrendChart 
        data={mockData}
        granularity="hour"
        title="Dynamic Chart"
      />
    )

    rerender(
      <UsageTrendChart 
        data={mockData}
        granularity="day"
        title="Dynamic Chart"
      />
    )

    rerender(
      <UsageTrendChart 
        data={mockData}
        granularity="week"
        title="Dynamic Chart"
      />
    )

    rerender(
      <UsageTrendChart 
        data={mockData}
        granularity="month"
        title="Dynamic Chart"
      />
    )

    expect(screen.getByText('Dynamic Chart')).toBeInTheDocument()
  })

  // 边界数据测试
  it('handles single data point', () => {
    const singleData = [mockData[0]]
    
    render(
      <UsageTrendChart 
        data={singleData}
        granularity="hour"
        title="Single Point Chart"
      />
    )
    
    expect(screen.getByText('Single Point Chart')).toBeInTheDocument()
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument()
  })

  it('handles zero values in data', () => {
    const zeroData = [{
      timestamp: '2024-01-01T00:00:00Z',
      requests: 0,
      tokens: 0,
      cost: 0,
      responseTime: 0,
      errorRate: 0
    }]
    
    render(
      <UsageTrendChart 
        data={zeroData}
        granularity="hour"
        title="Zero Values Chart"
      />
    )
    
    expect(screen.getByText('Zero Values Chart')).toBeInTheDocument()
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument()
  })

  it('handles extreme values in data', () => {
    const extremeData = [{
      timestamp: '2024-01-01T00:00:00Z',
      requests: 1000000,
      tokens: 50000000,
      cost: 1000,
      responseTime: 10000,
      errorRate: 1.0 // 100% error rate
    }]
    
    render(
      <UsageTrendChart 
        data={extremeData}
        granularity="hour"
        title="Extreme Values Chart"
      />
    )
    
    expect(screen.getByText('Extreme Values Chart')).toBeInTheDocument()
  })

  // 组件更新测试
  it('updates when data prop changes', () => {
    const { rerender } = render(
      <UsageTrendChart 
        data={mockData}
        granularity="hour"
        title="Original Chart"
      />
    )
    
    expect(screen.getByText('Original Chart')).toBeInTheDocument()
    
    rerender(
      <UsageTrendChart 
        data={[]}
        granularity="hour"
        title="Updated Chart"
      />
    )
    
    expect(screen.getByText('Updated Chart')).toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  // 样式类测试
  it('has correct CSS classes', () => {
    render(
      <UsageTrendChart 
        data={mockData}
        granularity="hour"
        title="Styled Chart"
      />
    )
    
    const container = screen.getByText('Styled Chart').closest('div')
    expect(container).toHaveClass('bg-white', 'rounded-lg', 'shadow', 'p-6')
  })

  // 图例颜色测试
  it('renders legend with correct colors', () => {
    const { container } = render(
      <UsageTrendChart 
        data={mockData}
        granularity="hour"
        title="Legend Test"
      />
    )
    
    // 检查图例颜色点
    const blueLegend = container.querySelector('.bg-blue-500')
    const greenLegend = container.querySelector('.bg-green-500')
    const purpleLegend = container.querySelector('.bg-purple-500')
    const orangeLegend = container.querySelector('.bg-orange-500')
    
    expect(blueLegend).toBeInTheDocument()
    expect(greenLegend).toBeInTheDocument()
    expect(purpleLegend).toBeInTheDocument()
    expect(orangeLegend).toBeInTheDocument()
  })

  // 可访问性测试
  it('has accessible empty state', () => {
    const { container } = render(
      <UsageTrendChart 
        data={[]}
        granularity="hour"
        title="Accessibility Test"
      />
    )
    
    const emptyStateIcon = container.querySelector('svg')
    expect(emptyStateIcon).toBeInTheDocument()
  })

  // 数据格式容错测试
  it('handles malformed timestamp gracefully', () => {
    const malformedData = [{
      timestamp: 'invalid-date',
      requests: 100,
      tokens: 5000,
      cost: 0.25,
      responseTime: 120,
      errorRate: 0.02
    }]
    
    expect(() => {
      render(
        <UsageTrendChart 
          data={malformedData}
          granularity="hour"
          title="Malformed Data Chart"
        />
      )
    }).not.toThrow()
    
    expect(screen.getByText('Malformed Data Chart')).toBeInTheDocument()
  })

  it('handles negative values gracefully', () => {
    const negativeData = [{
      timestamp: '2024-01-01T00:00:00Z',
      requests: -100, // 不应该有负数，但测试容错性
      tokens: 5000,
      cost: -0.25,
      responseTime: 120,
      errorRate: 0.02
    }]
    
    expect(() => {
      render(
        <UsageTrendChart 
          data={negativeData}
          granularity="hour"
          title="Negative Data Chart"
        />
      )
    }).not.toThrow()
  })
})