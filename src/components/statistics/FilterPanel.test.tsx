import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FilterPanel } from './FilterPanel'
import { FilterOptions } from './StatisticsDashboard'

// 模拟数据
const mockFilters: FilterOptions = {
  timeRange: '24h',
  models: [],
  accounts: [],
  status: []
}

const mockAvailableModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet']

const mockAvailableAccounts = [
  { id: 'account-1', name: 'Primary Account' },
  { id: 'account-2', name: 'Secondary Account' },
  { id: 'account-3', name: 'Test Account' }
]

const mockOnChange = jest.fn()

describe('FilterPanel Component', () => {
  beforeEach(() => {
    mockOnChange.mockClear()
  })

  // 基础渲染测试
  it('renders filter label', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('筛选条件:')).toBeInTheDocument()
  })

  it('renders quick status filters', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('✅ 成功')).toBeInTheDocument()
    expect(screen.getByText('❌ 错误')).toBeInTheDocument()
    expect(screen.getByText('⏱️ 超时')).toBeInTheDocument()
  })

  it('renders advanced filter toggle button', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('展开 高级筛选')).toBeInTheDocument()
  })

  // 高级筛选展开/收起测试
  it('expands advanced filters when toggle clicked', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const toggleButton = screen.getByText('展开 高级筛选')
    fireEvent.click(toggleButton)
    
    expect(screen.getByText('收起 高级筛选')).toBeInTheDocument()
    expect(screen.getByText('模型类型')).toBeInTheDocument()
    expect(screen.getByText('上游账号')).toBeInTheDocument()
  })

  it('collapses advanced filters when toggle clicked again', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const toggleButton = screen.getByText('展开 高级筛选')
    
    // 展开
    fireEvent.click(toggleButton)
    expect(screen.getByText('模型类型')).toBeInTheDocument()
    
    // 收起
    fireEvent.click(screen.getByText('收起 高级筛选'))
    expect(screen.queryByText('模型类型')).not.toBeInTheDocument()
  })

  // 状态筛选测试
  it('handles status toggle correctly', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const successButton = screen.getByText('✅ 成功')
    fireEvent.click(successButton)
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...mockFilters,
      status: ['success']
    })
  })

  it('removes status from filter when already selected', () => {
    const filtersWithStatus = { ...mockFilters, status: ['success'] }
    
    render(
      <FilterPanel 
        filters={filtersWithStatus}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const successButton = screen.getByText('✅ 成功')
    fireEvent.click(successButton)
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...filtersWithStatus,
      status: []
    })
  })

  it('applies active styling to selected status filters', () => {
    const filtersWithStatus = { ...mockFilters, status: ['success'] }
    
    render(
      <FilterPanel 
        filters={filtersWithStatus}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const successButton = screen.getByText('✅ 成功')
    expect(successButton).toHaveClass('bg-blue-100', 'border-blue-300', 'text-blue-700')
  })

  // 模型筛选测试
  it('renders available models in advanced filter', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    mockAvailableModels.forEach(model => {
      expect(screen.getByText(model)).toBeInTheDocument()
    })
  })

  it('handles model toggle correctly', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    // 点击模型复选框
    const gpt4Checkbox = screen.getByLabelText('gpt-4')
    fireEvent.click(gpt4Checkbox)
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...mockFilters,
      models: ['gpt-4']
    })
  })

  it('shows no models message when no models available', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={[]}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    expect(screen.getByText('暂无可用模型')).toBeInTheDocument()
  })

  // 账号筛选测试
  it('renders available accounts in advanced filter', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    mockAvailableAccounts.forEach(account => {
      expect(screen.getByText(account.name)).toBeInTheDocument()
    })
  })

  it('handles account toggle correctly', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    // 点击账号复选框
    const primaryAccountCheckbox = screen.getByLabelText('Primary Account')
    fireEvent.click(primaryAccountCheckbox)
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...mockFilters,
      accounts: ['account-1']
    })
  })

  it('shows no accounts message when no accounts available', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={[]}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    expect(screen.getByText('暂无可用账号')).toBeInTheDocument()
  })

  // 活跃筛选器显示测试
  it('shows active filters count when filters are applied', () => {
    const filtersWithActive = {
      ...mockFilters,
      models: ['gpt-4'],
      accounts: ['account-1'],
      status: ['success']
    }
    
    render(
      <FilterPanel 
        filters={filtersWithActive}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('3 个活跃筛选')).toBeInTheDocument()
  })

  it('shows clear all button when filters are active', () => {
    const filtersWithActive = {
      ...mockFilters,
      models: ['gpt-4'],
      status: ['success']
    }
    
    render(
      <FilterPanel 
        filters={filtersWithActive}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('清除所有')).toBeInTheDocument()
  })

  it('clears all filters when clear all button clicked', () => {
    const filtersWithActive = {
      ...mockFilters,
      models: ['gpt-4'],
      accounts: ['account-1'],
      status: ['success']
    }
    
    render(
      <FilterPanel 
        filters={filtersWithActive}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const clearAllButton = screen.getByText('清除所有')
    fireEvent.click(clearAllButton)
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...filtersWithActive,
      models: [],
      accounts: [],
      status: []
    })
  })

  // 活跃筛选器标签测试
  it('displays active model filter tags', () => {
    const filtersWithModels = { ...mockFilters, models: ['gpt-4', 'claude-3-opus'] }
    
    render(
      <FilterPanel 
        filters={filtersWithModels}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('模型: gpt-4')).toBeInTheDocument()
    expect(screen.getByText('模型: claude-3-opus')).toBeInTheDocument()
  })

  it('displays active account filter tags', () => {
    const filtersWithAccounts = { ...mockFilters, accounts: ['account-1'] }
    
    render(
      <FilterPanel 
        filters={filtersWithAccounts}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('账号: Primary Account')).toBeInTheDocument()
  })

  it('displays active status filter tags', () => {
    const filtersWithStatus = { ...mockFilters, status: ['success', 'error'] }
    
    render(
      <FilterPanel 
        filters={filtersWithStatus}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('状态: success')).toBeInTheDocument()
    expect(screen.getByText('状态: error')).toBeInTheDocument()
  })

  // 筛选器标签移除测试
  it('removes model filter when tag close button clicked', () => {
    const filtersWithModels = { ...mockFilters, models: ['gpt-4'] }
    
    render(
      <FilterPanel 
        filters={filtersWithModels}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const modelTag = screen.getByText('模型: gpt-4')
    const closeButton = modelTag.querySelector('button')
    fireEvent.click(closeButton!)
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...filtersWithModels,
      models: []
    })
  })

  it('removes account filter when tag close button clicked', () => {
    const filtersWithAccounts = { ...mockFilters, accounts: ['account-1'] }
    
    render(
      <FilterPanel 
        filters={filtersWithAccounts}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const accountTag = screen.getByText('账号: Primary Account')
    const closeButton = accountTag.querySelector('button')
    fireEvent.click(closeButton!)
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...filtersWithAccounts,
      accounts: []
    })
  })

  // 复选框状态测试
  it('checks model checkboxes based on filters', () => {
    const filtersWithModels = { ...mockFilters, models: ['gpt-4'] }
    
    render(
      <FilterPanel 
        filters={filtersWithModels}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    const gpt4Checkbox = screen.getByLabelText('gpt-4') as HTMLInputElement
    const gpt35Checkbox = screen.getByLabelText('gpt-3.5-turbo') as HTMLInputElement
    
    expect(gpt4Checkbox.checked).toBe(true)
    expect(gpt35Checkbox.checked).toBe(false)
  })

  it('checks account checkboxes based on filters', () => {
    const filtersWithAccounts = { ...mockFilters, accounts: ['account-1'] }
    
    render(
      <FilterPanel 
        filters={filtersWithAccounts}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    const primaryCheckbox = screen.getByLabelText('Primary Account') as HTMLInputElement
    const secondaryCheckbox = screen.getByLabelText('Secondary Account') as HTMLInputElement
    
    expect(primaryCheckbox.checked).toBe(true)
    expect(secondaryCheckbox.checked).toBe(false)
  })

  // 边界情况测试
  it('handles missing account name gracefully', () => {
    const filtersWithUnknownAccount = { ...mockFilters, accounts: ['unknown-account'] }
    
    render(
      <FilterPanel 
        filters={filtersWithUnknownAccount}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('账号: unknown-account')).toBeInTheDocument()
  })

  it('handles multiple filter types simultaneously', () => {
    const complexFilters = {
      ...mockFilters,
      models: ['gpt-4', 'claude-3-opus'],
      accounts: ['account-1'],
      status: ['success', 'error']
    }
    
    render(
      <FilterPanel 
        filters={complexFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    expect(screen.getByText('5 个活跃筛选')).toBeInTheDocument()
    expect(screen.getByText('模型: gpt-4')).toBeInTheDocument()
    expect(screen.getByText('模型: claude-3-opus')).toBeInTheDocument()
    expect(screen.getByText('账号: Primary Account')).toBeInTheDocument()
    expect(screen.getByText('状态: success')).toBeInTheDocument()
    expect(screen.getByText('状态: error')).toBeInTheDocument()
  })

  // 滚动测试
  it('applies scrollable styles to long lists', () => {
    const manyModels = Array.from({ length: 20 }, (_, i) => `model-${i}`)
    
    const { container } = render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={manyModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    const modelScrollArea = container.querySelector('.max-h-40.overflow-y-auto')
    expect(modelScrollArea).toBeInTheDocument()
  })

  // 可访问性测试
  it('has proper checkbox labels', () => {
    render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    mockAvailableModels.forEach(model => {
      expect(screen.getByLabelText(model)).toBeInTheDocument()
    })
    
    mockAvailableAccounts.forEach(account => {
      expect(screen.getByLabelText(account.name)).toBeInTheDocument()
    })
  })

  // 样式切换测试
  it('rotates arrow icon when advanced filters expanded', () => {
    const { container } = render(
      <FilterPanel 
        filters={mockFilters}
        onChange={mockOnChange}
        availableModels={mockAvailableModels}
        availableAccounts={mockAvailableAccounts}
      />
    )
    
    const arrowIcon = container.querySelector('svg')
    expect(arrowIcon).not.toHaveClass('rotate-180')
    
    // 展开高级筛选
    fireEvent.click(screen.getByText('展开 高级筛选'))
    
    expect(arrowIcon).toHaveClass('rotate-180')
  })
})