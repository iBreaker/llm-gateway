import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CostAnalysisChart } from './CostAnalysisChart'

// 模拟数据
const mockData = [
  {
    category: 'API调用费用',
    amount: 45.67,
    percentage: 60.8
  },
  {
    category: 'Token消费',
    amount: 22.34,
    percentage: 29.7
  },
  {
    category: '其他费用',
    amount: 7.12,
    percentage: 9.5
  }
]

const mockPredictions = {
  nextDayCost: 12.45,
  nextWeekCost: 89.23,
  budgetUsage: 75.2,
  budgetRemaining: 124.87
}

const totalCost = 75.13

describe('CostAnalysisChart Component', () => {
  // 基础渲染测试
  it('renders chart title and total cost', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        title="Cost Analysis"
      />
    )
    
    expect(screen.getByText('Cost Analysis')).toBeInTheDocument()
    expect(screen.getByText(`$${totalCost.toFixed(4)}`)).toBeInTheDocument()
    expect(screen.getByText('总成本')).toBeInTheDocument()
  })

  it('renders cost breakdown categories', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        title="Cost Breakdown"
      />
    )
    
    expect(screen.getByText('API调用费用')).toBeInTheDocument()
    expect(screen.getByText('Token消费')).toBeInTheDocument()
    expect(screen.getByText('其他费用')).toBeInTheDocument()
  })

  it('displays cost amounts and percentages', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        title="Cost Details"
      />
    )
    
    expect(screen.getByText('$45.6700')).toBeInTheDocument()
    expect(screen.getByText('60.8%')).toBeInTheDocument()
    expect(screen.getByText('$22.3400')).toBeInTheDocument()
    expect(screen.getByText('29.7%')).toBeInTheDocument()
  })

  // 空数据状态测试
  it('renders empty state when no data provided', () => {
    render(
      <CostAnalysisChart 
        data={[]}
        totalCost={0}
        title="Empty Chart"
      />
    )
    
    expect(screen.getByText('Empty Chart')).toBeInTheDocument()
    expect(screen.getByText('暂无成本数据')).toBeInTheDocument()
  })

  it('renders empty state when data is null/undefined', () => {
    render(
      <CostAnalysisChart 
        data={null as any}
        totalCost={0}
        title="Null Data Chart"
      />
    )
    
    expect(screen.getByText('暂无成本数据')).toBeInTheDocument()
  })

  // 预测数据测试
  it('renders predictions section when predictions provided', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={mockPredictions}
        title="Predictions Test"
      />
    )
    
    expect(screen.getByText('成本预测与预算')).toBeInTheDocument()
    expect(screen.getByText('预测成本')).toBeInTheDocument()
    expect(screen.getByText('预算使用情况')).toBeInTheDocument()
  })

  it('displays prediction values correctly', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={mockPredictions}
        title="Prediction Values"
      />
    )
    
    expect(screen.getByText('$12.4500')).toBeInTheDocument() // nextDayCost
    expect(screen.getByText('$89.2300')).toBeInTheDocument() // nextWeekCost
    expect(screen.getByText('75.2%')).toBeInTheDocument() // budgetUsage
    expect(screen.getByText('$124.8700')).toBeInTheDocument() // budgetRemaining
  })

  it('does not render predictions section when predictions not provided', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        title="No Predictions"
      />
    )
    
    expect(screen.queryByText('成本预测与预算')).not.toBeInTheDocument()
    expect(screen.queryByText('预测成本')).not.toBeInTheDocument()
  })

  // 预算状态测试
  it('applies green color for healthy budget usage', () => {
    const healthyPredictions = { ...mockPredictions, budgetUsage: 50.0 }
    
    const { container } = render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={healthyPredictions}
        title="Healthy Budget"
      />
    )
    
    const progressBar = container.querySelector('.bg-green-500')
    expect(progressBar).toBeInTheDocument()
  })

  it('applies yellow color for moderate budget usage', () => {
    const moderatePredictions = { ...mockPredictions, budgetUsage: 80.0 }
    
    const { container } = render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={moderatePredictions}
        title="Moderate Budget"
      />
    )
    
    const progressBar = container.querySelector('.bg-yellow-500')
    expect(progressBar).toBeInTheDocument()
  })

  it('applies red color for high budget usage', () => {
    const highPredictions = { ...mockPredictions, budgetUsage: 95.0 }
    
    const { container } = render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={highPredictions}
        title="High Budget"
      />
    )
    
    const progressBar = container.querySelector('.bg-red-500')
    expect(progressBar).toBeInTheDocument()
  })

  // 预算警告测试
  it('shows budget warning when usage exceeds 90%', () => {
    const warningPredictions = { ...mockPredictions, budgetUsage: 92.0 }
    
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={warningPredictions}
        title="Budget Warning"
      />
    )
    
    expect(screen.getByText('⚠️ 预算即将耗尽，请注意控制成本')).toBeInTheDocument()
  })

  it('does not show budget warning when usage below 90%', () => {
    const safePredictions = { ...mockPredictions, budgetUsage: 85.0 }
    
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={safePredictions}
        title="Safe Budget"
      />
    )
    
    expect(screen.queryByText('⚠️ 预算即将耗尽，请注意控制成本')).not.toBeInTheDocument()
  })

  // 智能优化建议测试
  it('renders optimization suggestions', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={mockPredictions}
        title="Optimization Test"
      />
    )
    
    expect(screen.getByText('💡 智能优化建议')).toBeInTheDocument()
    expect(screen.getByText('• 定期审查和清理不必要的API调用')).toBeInTheDocument()
    expect(screen.getByText('• 考虑使用缓存机制减少重复请求')).toBeInTheDocument()
  })

  it('shows budget-specific optimization suggestion when usage high', () => {
    const highBudgetPredictions = { ...mockPredictions, budgetUsage: 85.0 }
    
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={highBudgetPredictions}
        title="High Budget Suggestions"
      />
    )
    
    expect(screen.getByText('• 考虑调整API调用频率或使用更经济的模型')).toBeInTheDocument()
  })

  it('shows category-specific optimization when one category dominates', () => {
    const dominantCategoryData = [
      { category: '主要费用', amount: 70.0, percentage: 70.0 },
      { category: '次要费用', amount: 30.0, percentage: 30.0 }
    ]
    
    render(
      <CostAnalysisChart 
        data={dominantCategoryData}
        totalCost={100}
        predictions={mockPredictions}
        title="Dominant Category"
      />
    )
    
    expect(screen.getByText('• 主要费用 占比较高，可考虑优化此部分的使用')).toBeInTheDocument()
  })

  // 数据排序测试
  it('sorts categories by amount descending', () => {
    const unsortedData = [
      { category: '小费用', amount: 5.0, percentage: 10.0 },
      { category: '大费用', amount: 45.0, percentage: 90.0 }
    ]
    
    const { container } = render(
      <CostAnalysisChart 
        data={unsortedData}
        totalCost={50}
        title="Sorting Test"
      />
    )
    
    // 获取类别显示顺序
    const categoryElements = container.querySelectorAll('.truncate')
    const displayedCategories = Array.from(categoryElements).map(el => el.textContent)
    
    expect(displayedCategories[0]).toBe('大费用') // 应该排在第一位
    expect(displayedCategories[1]).toBe('小费用') // 应该排在第二位
  })

  // 边界数据测试
  it('handles single category data', () => {
    const singleData = [mockData[0]]
    
    render(
      <CostAnalysisChart 
        data={singleData}
        totalCost={45.67}
        title="Single Category"
      />
    )
    
    expect(screen.getByText('Single Category')).toBeInTheDocument()
    expect(screen.getByText('API调用费用')).toBeInTheDocument()
    const costElements = screen.getAllByText('$45.6700')
    expect(costElements.length).toBeGreaterThan(0)
  })

  it('handles zero cost values', () => {
    const zeroData = [{
      category: '零成本项目',
      amount: 0,
      percentage: 0
    }]
    
    render(
      <CostAnalysisChart 
        data={zeroData}
        totalCost={0}
        title="Zero Cost"
      />
    )
    
    expect(screen.getByText('零成本项目')).toBeInTheDocument()
    expect(screen.getByText('$0.0000')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('handles negative budget remaining', () => {
    const negativeBudgetPredictions = {
      ...mockPredictions,
      budgetRemaining: -25.50
    }
    
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={negativeBudgetPredictions}
        title="Negative Budget"
      />
    )
    
    const remainingElement = screen.getByText('$-25.5000')
    expect(remainingElement).toHaveClass('text-red-600')
  })

  // 极端数据测试
  it('handles very large cost values', () => {
    const largeData = [{
      category: '大额费用',
      amount: 999999.9999,
      percentage: 100.0
    }]
    
    render(
      <CostAnalysisChart 
        data={largeData}
        totalCost={999999.9999}
        title="Large Cost"
      />
    )
    
    expect(screen.getByText('$999999.9999')).toBeInTheDocument()
  })

  it('caps budget progress bar at 100%', () => {
    const overBudgetPredictions = {
      ...mockPredictions,
      budgetUsage: 150.0 // 超过100%
    }
    
    const { container } = render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        predictions={overBudgetPredictions}
        title="Over Budget"
      />
    )
    
    const progressBar = container.querySelector('.h-2.rounded-full.transition-all')
    expect(progressBar).toHaveStyle({ width: '100%' })
  })

  // 组件更新测试
  it('updates when data prop changes', () => {
    const { rerender } = render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        title="Original Chart"
      />
    )
    
    expect(screen.getByText('API调用费用')).toBeInTheDocument()
    
    const newData = [{
      category: '新费用项目',
      amount: 100.0,
      percentage: 100.0
    }]
    
    rerender(
      <CostAnalysisChart 
        data={newData}
        totalCost={100}
        title="Updated Chart"
      />
    )
    
    expect(screen.getByText('Updated Chart')).toBeInTheDocument()
    expect(screen.getByText('新费用项目')).toBeInTheDocument()
    expect(screen.queryByText('API调用费用')).not.toBeInTheDocument()
  })

  // 样式类测试
  it('has correct CSS classes', () => {
    render(
      <CostAnalysisChart 
        data={mockData}
        totalCost={totalCost}
        title="Style Test"
      />
    )
    
    const container = screen.getByText('Style Test').closest('div')
    expect(container).toHaveClass('bg-white', 'rounded-lg', 'shadow', 'p-6')
  })

  // 可访问性测试
  it('has accessible empty state', () => {
    const { container } = render(
      <CostAnalysisChart 
        data={[]}
        totalCost={0}
        title="Accessibility Test"
      />
    )
    
    const emptyStateIcon = container.querySelector('svg')
    expect(emptyStateIcon).toBeInTheDocument()
  })

  // 颜色循环测试
  it('cycles through colors for many categories', () => {
    const manyCategories = Array.from({ length: 12 }, (_, i) => ({
      category: `Category ${i}`,
      amount: 10 - i,
      percentage: (10 - i) * 2
    }))
    
    const { container } = render(
      <CostAnalysisChart 
        data={manyCategories}
        totalCost={100}
        title="Color Cycle Test"
      />
    )
    
    // 检查颜色元素存在（颜色会循环使用）
    const colorElements = container.querySelectorAll('.w-3.h-3.rounded-full')
    expect(colorElements.length).toBe(12)
  })

  // 长文本处理测试
  it('handles long category names with truncation', () => {
    const longNameData = [{
      category: '这是一个非常非常长的费用类别名称，应该会被截断处理',
      amount: 50.0,
      percentage: 100.0
    }]
    
    const { container } = render(
      <CostAnalysisChart 
        data={longNameData}
        totalCost={50}
        title="Long Name Test"
      />
    )
    
    const categoryElement = container.querySelector('.truncate')
    expect(categoryElement).toHaveClass('truncate')
    expect(categoryElement).toBeInTheDocument()
  })
})