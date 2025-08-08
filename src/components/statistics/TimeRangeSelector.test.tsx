import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TimeRangeSelector } from './TimeRangeSelector'

const mockValue = {
  start: '2024-01-15T11:00:00Z',
  end: '2024-01-15T12:00:00Z',
  preset: '1h'
}

const mockOnChange = jest.fn()

describe('TimeRangeSelector Component', () => {
  beforeEach(() => {
    mockOnChange.mockClear()
  })

  // 基础渲染测试
  it('renders time range label and select', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    expect(screen.getByText('时间范围:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('最近1小时')).toBeInTheDocument()
  })

  it('renders all preset options', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const select = screen.getByDisplayValue('最近1小时')
    expect(select).toBeInTheDocument()
    
    // 检查所有预设选项
    expect(screen.getByText('最近1小时')).toBeInTheDocument()
    expect(screen.getByText('最近24小时')).toBeInTheDocument()
    expect(screen.getByText('最近7天')).toBeInTheDocument()
    expect(screen.getByText('最近30天')).toBeInTheDocument()
    expect(screen.getByText('最近90天')).toBeInTheDocument()
    expect(screen.getByText('自定义')).toBeInTheDocument()
  })

  it('renders data granularity selector', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    expect(screen.getByText('数据粒度:')).toBeInTheDocument()
    expect(screen.getByText('小时')).toBeInTheDocument()
    expect(screen.getByText('天')).toBeInTheDocument()
    expect(screen.getByText('周')).toBeInTheDocument()
    expect(screen.getByText('月')).toBeInTheDocument()
  })

  // 预设时间范围测试
  it('handles preset change to 24h', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const select = screen.getByDisplayValue('最近1小时')
    fireEvent.change(select, { target: { value: '24h' } })
    
    expect(mockOnChange).toHaveBeenCalledWith({
      start: expect.any(String),
      end: expect.any(String),
      preset: '24h'
    })
  })

  it('handles preset change to 7d', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const select = screen.getByDisplayValue('最近1小时')
    fireEvent.change(select, { target: { value: '7d' } })
    
    expect(mockOnChange).toHaveBeenCalledWith({
      start: expect.any(String),
      end: expect.any(String),
      preset: '7d'
    })
  })

  // 自定义时间范围测试
  it('shows custom date inputs when custom preset selected', () => {
    const customValue = { ...mockValue, preset: 'custom' }
    
    render(<TimeRangeSelector value={customValue} onChange={mockOnChange} />)
    
    expect(screen.getByLabelText('从:')).toBeInTheDocument()
    expect(screen.getByLabelText('到:')).toBeInTheDocument()
  })

  it('switches to custom mode when custom option selected', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const select = screen.getByDisplayValue('最近1小时')
    fireEvent.change(select, { target: { value: 'custom' } })
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...mockValue,
      preset: 'custom'
    })
  })

  it('handles custom start date change', () => {
    const customValue = { ...mockValue, preset: 'custom' }
    
    render(<TimeRangeSelector value={customValue} onChange={mockOnChange} />)
    
    const startInput = screen.getByLabelText('从:')
    fireEvent.change(startInput, { target: { value: '2024-01-15T10:00' } })
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...customValue,
      start: '2024-01-15T10:00:00.000Z'
    })
  })

  it('handles custom end date change', () => {
    const customValue = { ...mockValue, preset: 'custom' }
    
    render(<TimeRangeSelector value={customValue} onChange={mockOnChange} />)
    
    const endInput = screen.getByLabelText('到:')
    fireEvent.change(endInput, { target: { value: '2024-01-15T13:00' } })
    
    expect(mockOnChange).toHaveBeenCalledWith({
      ...customValue,
      end: '2024-01-15T13:00:00.000Z'
    })
  })

  // 数据粒度测试
  it('shows correct granularity for 1h preset', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const granularitySelect = screen.getByDisplayValue('小时')
    expect(granularitySelect).toBeInTheDocument()
  })

  it('shows correct granularity for 7d preset', () => {
    const weekValue = { ...mockValue, preset: '7d' }
    
    render(<TimeRangeSelector value={weekValue} onChange={mockOnChange} />)
    
    const granularitySelect = screen.getByDisplayValue('天')
    expect(granularitySelect).toBeInTheDocument()
  })

  it('shows correct granularity for 90d preset', () => {
    const monthValue = { ...mockValue, preset: '90d' }
    
    render(<TimeRangeSelector value={monthValue} onChange={mockOnChange} />)
    
    const granularitySelect = screen.getByDisplayValue('周')
    expect(granularitySelect).toBeInTheDocument()
  })

  it('changes preset when granularity requires it', () => {
    const longRangeValue = { ...mockValue, preset: '30d' }
    
    render(<TimeRangeSelector value={longRangeValue} onChange={mockOnChange} />)
    
    const granularitySelect = screen.getByDisplayValue('天')
    fireEvent.change(granularitySelect, { target: { value: 'hour' } })
    
    // 应该切换到24h预设因为小时粒度需要较短的时间范围
    expect(mockOnChange).toHaveBeenCalledWith({
      start: expect.any(String),
      end: expect.any(String),
      preset: '24h'
    })
  })

  it('changes preset from hour granularity to day', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const granularitySelect = screen.getByDisplayValue('小时')
    fireEvent.change(granularitySelect, { target: { value: 'day' } })
    
    // 应该切换到7d预设因为天粒度需要较长的时间范围
    expect(mockOnChange).toHaveBeenCalledWith({
      start: expect.any(String),
      end: expect.any(String),
      preset: '7d'
    })
  })

  // 响应式布局测试
  it('applies responsive CSS classes', () => {
    const { container } = render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const mainContainer = container.querySelector('.flex.flex-col.sm\\:flex-row')
    expect(mainContainer).toBeInTheDocument()
  })

  // 表单控件样式测试
  it('applies correct CSS classes to select elements', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    const timeRangeSelect = screen.getByDisplayValue('最近1小时')
    expect(timeRangeSelect).toHaveClass(
      'rounded-md',
      'border-gray-300',
      'text-sm',
      'focus:border-blue-500',
      'focus:ring-blue-500'
    )
  })

  it('applies correct CSS classes to datetime inputs', () => {
    const customValue = { ...mockValue, preset: 'custom' }
    
    render(<TimeRangeSelector value={customValue} onChange={mockOnChange} />)
    
    const startInput = screen.getByLabelText('从:')
    expect(startInput).toHaveClass(
      'rounded-md',
      'border-gray-300',
      'text-sm',
      'focus:border-blue-500',
      'focus:ring-blue-500'
    )
    expect(startInput).toHaveAttribute('type', 'datetime-local')
  })

  // 边界情况测试
  it('handles invalid date strings gracefully', () => {
    const invalidValue = {
      start: 'invalid-date',
      end: 'invalid-date',
      preset: 'custom'
    }
    
    expect(() => {
      render(<TimeRangeSelector value={invalidValue} onChange={mockOnChange} />)
    }).not.toThrow()
  })

  it('handles undefined preset gracefully', () => {
    const undefinedValue = {
      start: mockValue.start,
      end: mockValue.end,
      preset: 'undefined-preset'
    }
    
    expect(() => {
      render(<TimeRangeSelector value={undefinedValue} onChange={mockOnChange} />)
    }).not.toThrow()
  })

  // 时间格式测试
  it('formats datetime-local input values correctly', () => {
    const customValue = { ...mockValue, preset: 'custom' }
    
    render(<TimeRangeSelector value={customValue} onChange={mockOnChange} />)
    
    const startInput = screen.getByLabelText('从:')
    const endInput = screen.getByLabelText('到:')
    
    // datetime-local格式应该是YYYY-MM-DDTHH:mm
    expect(startInput).toHaveValue('2024-01-15T11:00')
    expect(endInput).toHaveValue('2024-01-15T12:00')
  })

  // 可访问性测试
  it('has proper label associations', () => {
    const customValue = { ...mockValue, preset: 'custom' }
    
    render(<TimeRangeSelector value={customValue} onChange={mockOnChange} />)
    
    expect(screen.getByLabelText('从:')).toBeInTheDocument()
    expect(screen.getByLabelText('到:')).toBeInTheDocument()
  })

  it('has descriptive text for form sections', () => {
    render(<TimeRangeSelector value={mockValue} onChange={mockOnChange} />)
    
    expect(screen.getByText('时间范围:')).toBeInTheDocument()
    expect(screen.getByText('数据粒度:')).toBeInTheDocument()
  })

  // 状态持久化测试
  it('maintains custom mode state when switching back to custom', () => {
    const { rerender } = render(
      <TimeRangeSelector value={mockValue} onChange={mockOnChange} />
    )
    
    // 切换到自定义模式
    const select = screen.getByDisplayValue('最近1小时')
    fireEvent.change(select, { target: { value: 'custom' } })
    
    // 重新渲染为自定义模式
    const customValue = { ...mockValue, preset: 'custom' }
    rerender(<TimeRangeSelector value={customValue} onChange={mockOnChange} />)
    
    expect(screen.getByLabelText('从:')).toBeInTheDocument()
    
    // 切换到其他预设
    const newSelect = screen.getByDisplayValue('自定义')
    fireEvent.change(newSelect, { target: { value: '24h' } })
    
    // 再切换回自定义
    fireEvent.change(newSelect, { target: { value: 'custom' } })
    
    expect(mockOnChange).toHaveBeenLastCalledWith({
      ...mockValue,
      preset: 'custom'
    })
  })
})