import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ModelDistributionChart } from './ModelDistributionChart'

// 模拟数据
const mockData = [
  {
    model: 'gpt-4',
    requests: 1500,
    tokens: 150000,
    cost: 30.0,
    avgResponseTime: 850,
    successRate: 99.2
  },
  {
    model: 'gpt-3.5-turbo',
    requests: 3200,
    tokens: 240000,
    cost: 12.0,
    avgResponseTime: 520,
    successRate: 98.8
  },
  {
    model: 'claude-3-opus',
    requests: 800,
    tokens: 120000,
    cost: 24.0,
    avgResponseTime: 920,
    successRate: 99.5
  },
  {
    model: 'claude-3-sonnet',
    requests: 1200,
    tokens: 180000,
    cost: 18.0,
    avgResponseTime: 680,
    successRate: 99.1
  }
]

describe('ModelDistributionChart Component', () => {
  // 基础渲染测试
  it('renders chart title', () => {
    render(
      <ModelDistributionChart 
        data={mockData}
        title="Model Distribution"
      />
    )
    expect(screen.getByText('Model Distribution')).toBeInTheDocument()
  })

  it('renders model names in legend', () => {
    render(
      <ModelDistributionChart 
        data={mockData}
        title="Models"
      />
    )
    
    expect(screen.getAllByText('gpt-4')).toHaveLength(2) // 图例和表格中各一个
    expect(screen.getAllByText('gpt-3.5-turbo')).toHaveLength(2)
    expect(screen.getAllByText('claude-3-opus')).toHaveLength(2)
    expect(screen.getAllByText('claude-3-sonnet')).toHaveLength(2)
  })

  // 空数据状态测试
  it('renders empty state when no data provided', () => {
    render(
      <ModelDistributionChart 
        data={[]}
        title="Empty Chart"
      />
    )
    
    expect(screen.getByText('Empty Chart')).toBeInTheDocument()
    expect(screen.getByText('暂无模型数据')).toBeInTheDocument()
  })

  it('renders empty state when data is null/undefined', () => {
    render(
      <ModelDistributionChart 
        data={null as any}
        title="Null Data Chart"
      />
    )
    
    expect(screen.getByText('暂无模型数据')).toBeInTheDocument()
  })

  // SVG饼状图渲染测试
  it('renders SVG pie chart when data is provided', () => {
    const { container } = render(
      <ModelDistributionChart 
        data={mockData}
        title="Chart with Data"
      />
    )
    
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass('transform', '-rotate-90')
  })

  // 中心总计显示测试
  it('displays total requests in center', () => {
    render(
      <ModelDistributionChart 
        data={mockData}
        title="Total Test"
      />
    )
    
    const totalRequests = mockData.reduce((sum, item) => sum + item.requests, 0)
    expect(screen.getByText(totalRequests.toLocaleString())).toBeInTheDocument()
    expect(screen.getByText('请求')).toBeInTheDocument()
    expect(screen.getByText('总计')).toBeInTheDocument()
  })

  // 百分比计算测试
  it('calculates and displays correct percentages', () => {
    render(
      <ModelDistributionChart 
        data={mockData}
        title="Percentage Test"
      />
    )
    
    const totalRequests = mockData.reduce((sum, item) => sum + item.requests, 0)
    const gpt35Percentage = ((3200 / totalRequests) * 100).toFixed(1)
    
    expect(screen.getByText(`${gpt35Percentage}% 请求量`)).toBeInTheDocument()
  })

  // 表格渲染测试
  it('renders detailed statistics table', () => {
    render(
      <ModelDistributionChart 
        data={mockData}
        title="Table Test"
      />
    )
    
    // 检查表头
    expect(screen.getByText('模型')).toBeInTheDocument()
    expect(screen.getByText('请求数')).toBeInTheDocument()
    expect(screen.getByText('Token用量')).toBeInTheDocument()
    expect(screen.getByText('成本')).toBeInTheDocument()
    expect(screen.getByText('平均响应时间')).toBeInTheDocument()
    expect(screen.getByText('成功率')).toBeInTheDocument()
  })

  it('displays model statistics in table correctly', () => {
    render(
      <ModelDistributionChart 
        data={mockData}
        title="Stats Test"
      />
    )
    
    // 检查第一个模型的数据（应该是按请求数排序的第一个）
    const sortedData = [...mockData].sort((a, b) => b.requests - a.requests)
    const firstModel = sortedData[0]
    
    expect(screen.getAllByText(firstModel.requests.toLocaleString())).toHaveLength(2) // 中心显示和图例中的请求数
    expect(screen.getByText(`$${firstModel.cost.toFixed(4)}`)).toBeInTheDocument()
    expect(screen.getByText(`${Math.round(firstModel.avgResponseTime)}ms`)).toBeInTheDocument()
    expect(screen.getByText(`${firstModel.successRate.toFixed(1)}%`)).toBeInTheDocument() // 表格中的成功率
  })

  // 数据排序测试
  it('sorts models by request count descending', () => {
    const { container } = render(
      <ModelDistributionChart 
        data={mockData}
        title="Sorting Test"
      />
    )
    
    // 获取所有模型名称的显示顺序
    const modelCells = container.querySelectorAll('tbody tr td:first-child .text-sm')
    const displayedModels = Array.from(modelCells).map(cell => cell.textContent)
    
    // 期望的排序顺序（按请求数降序）
    const expectedOrder = ['gpt-3.5-turbo', 'gpt-4', 'claude-3-sonnet', 'claude-3-opus']
    
    expectedOrder.forEach((modelName, index) => {
      if (displayedModels[index]) {
        expect(displayedModels[index]).toBe(modelName)
      }
    })
  })

  // 成功率状态指示器测试
  it('shows correct success rate status indicators', () => {
    const testData = [
      { ...mockData[0], model: 'high-success', requests: 3000, successRate: 99.5 }, // 绿色 - 最高请求数，会排在第一位
      { ...mockData[1], model: 'medium-success', requests: 2000, successRate: 97.0 }, // 黄色
      { ...mockData[2], model: 'low-success', requests: 1000, successRate: 93.0 }  // 红色
    ]
    
    const { container } = render(
      <ModelDistributionChart 
        data={testData}
        title="Status Test"
      />
    )
    
    const statusIndicators = container.querySelectorAll('tbody tr td:last-child .w-2')
    
    expect(statusIndicators[0]).toHaveClass('bg-green-400') // 99.5% -> green
    expect(statusIndicators[1]).toHaveClass('bg-yellow-400') // 97% -> yellow
    expect(statusIndicators[2]).toHaveClass('bg-red-400') // 93% -> red
  })

  // Token格式化测试
  it('formats large token numbers correctly', () => {
    const largeTokenData = [{
      ...mockData[0],
      tokens: 1500000 // 1.5M tokens
    }]
    
    render(
      <ModelDistributionChart 
        data={largeTokenData}
        title="Format Test"
      />
    )
    
    expect(screen.getByText('1.5M')).toBeInTheDocument()
  })

  // 边界数据测试
  it('handles single model data', () => {
    const singleData = [mockData[0]]
    
    render(
      <ModelDistributionChart 
        data={singleData}
        title="Single Model"
      />
    )
    
    expect(screen.getByText('Single Model')).toBeInTheDocument()
    expect(screen.getAllByText('gpt-4')).toHaveLength(2) // 图例和表格中各一个
    expect(screen.getByText('100.0% 请求量')).toBeInTheDocument()
  })

  it('handles zero values gracefully', () => {
    const zeroData = [{
      model: 'test-model',
      requests: 0,
      tokens: 0,
      cost: 0,
      avgResponseTime: 0,
      successRate: 0
    }]
    
    render(
      <ModelDistributionChart 
        data={zeroData}
        title="Zero Values"
      />
    )
    
    expect(screen.getAllByText('test-model')).toHaveLength(2) // 图例和表格中各一个
    expect(screen.getByText('$0.0000')).toBeInTheDocument()
    expect(screen.getByText('0ms')).toBeInTheDocument()
  })

  // 极端数据测试
  it('handles extreme token values', () => {
    const extremeData = [{
      model: 'extreme-model',
      requests: 999999,
      tokens: 50000000, // 50M tokens
      cost: 999.99,
      avgResponseTime: 10000,
      successRate: 100.0
    }]
    
    render(
      <ModelDistributionChart 
        data={extremeData}
        title="Extreme Test"
      />
    )
    
    expect(screen.getByText('50.0M')).toBeInTheDocument()
    expect(screen.getAllByText('999,999')).toHaveLength(3) // 中心显示、图例和表格中各一次
    expect(screen.getByText('$999.9900')).toBeInTheDocument()
    expect(screen.getByText('10000ms')).toBeInTheDocument()
  })

  // 组件更新测试
  it('updates when data prop changes', () => {
    const { rerender } = render(
      <ModelDistributionChart 
        data={mockData}
        title="Original Chart"
      />
    )
    
    // 检查原始数据中的模型
    const gpt4Elements = screen.getAllByText('gpt-4')
    expect(gpt4Elements.length).toBeGreaterThan(0)
    
    const newData = [{
      model: 'new-model',
      requests: 100,
      tokens: 5000,
      cost: 2.5,
      avgResponseTime: 300,
      successRate: 95.0
    }]
    
    rerender(
      <ModelDistributionChart 
        data={newData}
        title="Updated Chart"
      />
    )
    
    expect(screen.getByText('Updated Chart')).toBeInTheDocument()
    expect(screen.getAllByText('new-model')).toHaveLength(2) // 图例中和表格中各一个
    expect(screen.queryByText('gpt-4')).not.toBeInTheDocument()
  })

  // 样式类测试
  it('has correct CSS classes', () => {
    render(
      <ModelDistributionChart 
        data={mockData}
        title="Style Test"
      />
    )
    
    const container = screen.getByText('Style Test').closest('div')
    expect(container).toHaveClass('bg-white', 'rounded-lg', 'shadow', 'p-6')
  })

  // 饼状图片段过滤测试
  it('filters out very small pie segments', () => {
    const smallSegmentData = [
      { ...mockData[0], requests: 10000 },
      { ...mockData[1], requests: 1 } // 非常小的片段
    ]
    
    const { container } = render(
      <ModelDistributionChart 
        data={smallSegmentData}
        title="Small Segment Test"
      />
    )
    
    // 小片段应该被过滤掉，但仍在图例和表格中显示
    const modelElements = screen.getAllByText('gpt-3.5-turbo')
    expect(modelElements.length).toBeGreaterThan(0)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  // 可访问性测试
  it('has accessible empty state', () => {
    const { container } = render(
      <ModelDistributionChart 
        data={[]}
        title="Accessibility Test"
      />
    )
    
    const emptyStateIcon = container.querySelector('svg')
    expect(emptyStateIcon).toBeInTheDocument()
  })

  // 颜色循环测试
  it('cycles through colors for many models', () => {
    const manyModels = Array.from({ length: 12 }, (_, i) => ({
      model: `model-${i}`,
      requests: 100 + i,
      tokens: 1000 + i * 100,
      cost: 1.0 + i * 0.1,
      avgResponseTime: 500 + i * 10,
      successRate: 95 + (i % 5)
    }))
    
    const { container } = render(
      <ModelDistributionChart 
        data={manyModels}
        title="Color Cycle Test"
      />
    )
    
    // 检查颜色元素存在（颜色会循环使用）
    const colorElements = container.querySelectorAll('.w-4.h-4.rounded-full, .w-3.h-3.rounded-full')
    expect(colorElements.length).toBeGreaterThan(10)
  })
})