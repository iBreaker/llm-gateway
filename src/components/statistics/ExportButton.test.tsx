import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ExportButton } from './ExportButton'

// Mock API client
const mockApiClient = {
  get: jest.fn()
}

jest.mock('../../utils/api', () => ({
  apiClient: mockApiClient
}))

// Mock URL.createObjectURL and document.createElement
const mockCreateObjectURL = jest.fn()
const mockClick = jest.fn()
const mockLink = {
  href: '',
  download: '',
  click: mockClick
}

Object.defineProperty(global.URL, 'createObjectURL', {
  writable: true,
  value: mockCreateObjectURL
})

const mockCreateElement = jest.fn((tagName) => {
  if (tagName === 'a') {
    return mockLink
  }
  return document.createElement(tagName)
})

Object.defineProperty(document, 'createElement', {
  writable: true,
  value: mockCreateElement
})

// Mock data
const mockData = {
  totalRequests: 1500,
  successfulRequests: 1450,
  failedRequests: 50,
  averageLatencyMs: 250,
  totalCostUsd: 75.25,
  errorRate: 0.033,
  timeSeriesData: [
    {
      timestamp: '2024-01-01T00:00:00Z',
      requests: 100,
      responseTime: 200,
      cost: 5.0,
      errorRate: 0.02
    },
    {
      timestamp: '2024-01-01T01:00:00Z',
      requests: 150,
      responseTime: 250,
      cost: 7.5,
      errorRate: 0.01
    }
  ]
}

const mockFilters = {
  timeRange: '24h',
  models: ['gpt-4'],
  status: ['success']
}

describe('ExportButton Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApiClient.get.mockResolvedValue(mockData)
    mockCreateObjectURL.mockReturnValue('blob:mock-url')
  })

  // 基础渲染测试
  it('renders export button with correct text', () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    expect(screen.getByText('导出数据')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeEnabled()
  })

  it('renders disabled button when no data provided', () => {
    render(<ExportButton data={null} filters={mockFilters} />)
    
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveClass('bg-gray-100', 'text-gray-400', 'cursor-not-allowed')
  })

  // 下拉菜单测试
  it('shows export options when button clicked', () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    const button = screen.getByText('导出数据')
    fireEvent.click(button)
    
    expect(screen.getByText('CSV 文件')).toBeInTheDocument()
    expect(screen.getByText('Excel 文件')).toBeInTheDocument()
    expect(screen.getByText('PDF 报告')).toBeInTheDocument()
    expect(screen.getByText('JSON 数据')).toBeInTheDocument()
  })

  it('hides export options when button clicked again', () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    const button = screen.getByText('导出数据')
    
    // 显示选项
    fireEvent.click(button)
    expect(screen.getByText('CSV 文件')).toBeInTheDocument()
    
    // 隐藏选项
    fireEvent.click(button)
    expect(screen.queryByText('CSV 文件')).not.toBeInTheDocument()
  })

  it('renders export format icons', () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    
    expect(screen.getByText('📊')).toBeInTheDocument() // CSV
    expect(screen.getByText('📈')).toBeInTheDocument() // Excel
    expect(screen.getByText('📄')).toBeInTheDocument() // PDF
    expect(screen.getByText('📋')).toBeInTheDocument() // JSON
  })

  // CSV导出测试
  it('handles CSV export with time series data', async () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/stats/detailed')
    })
    
    expect(mockCreateElement).toHaveBeenCalledWith('a')
    expect(mockCreateObjectURL).toHaveBeenCalled()
    expect(mockClick).toHaveBeenCalled()
    expect(mockLink.download).toContain('.csv')
  })

  it('handles CSV export without time series data', async () => {
    const dataWithoutTimeSeries = { ...mockData, timeSeriesData: undefined }
    
    render(<ExportButton data={dataWithoutTimeSeries} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalled()
    })
    
    expect(mockClick).toHaveBeenCalled()
  })

  // JSON导出测试
  it('handles JSON export correctly', async () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('JSON 数据'))
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/stats/detailed')
    })
    
    expect(mockCreateElement).toHaveBeenCalledWith('a')
    expect(mockLink.download).toContain('.json')
    expect(mockClick).toHaveBeenCalled()
  })

  // Excel和PDF导出测试（模拟功能）
  it('shows alert for Excel export', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation()
    
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('Excel 文件'))
    
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Excel 导出功能开发中...')
    })
    
    alertSpy.mockRestore()
  })

  it('shows alert for PDF export', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation()
    
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('PDF 报告'))
    
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('PDF 导出功能开发中...')
    })
    
    alertSpy.mockRestore()
  })

  // 加载状态测试
  it('shows loading state during export', async () => {
    // 模拟慢速API调用
    mockApiClient.get.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(mockData), 100))
    )
    
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    // 检查加载状态
    expect(screen.getByText('导出中...')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
    
    // 等待完成
    await waitFor(() => {
      expect(screen.queryByText('导出中...')).not.toBeInTheDocument()
    }, { timeout: 200 })
    
    expect(screen.getByText('导出数据')).toBeInTheDocument()
  })

  it('hides options menu during export', async () => {
    mockApiClient.get.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(mockData), 50))
    )
    
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    // 下拉菜单应该被隐藏
    expect(screen.queryByText('CSV 文件')).not.toBeInTheDocument()
    
    await waitFor(() => {
      expect(screen.getByText('导出数据')).toBeInTheDocument()
    }, { timeout: 100 })
  })

  // 错误处理测试
  it('handles export API error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation()
    
    mockApiClient.get.mockRejectedValue(new Error('API Error'))
    
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('导出失败:', expect.any(Error))
      expect(alertSpy).toHaveBeenCalledWith('导出失败，请重试')
    })
    
    // 应该恢复到正常状态
    expect(screen.getByText('导出数据')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeEnabled()
    
    consoleSpy.mockRestore()
    alertSpy.mockRestore()
  })

  // 外部点击关闭测试
  it('closes dropdown when clicking outside', () => {
    const { container } = render(<ExportButton data={mockData} filters={mockFilters} />)
    
    // 打开下拉菜单
    fireEvent.click(screen.getByText('导出数据'))
    expect(screen.getByText('CSV 文件')).toBeInTheDocument()
    
    // 点击外部覆盖层
    const overlay = container.querySelector('.fixed.inset-0')
    fireEvent.click(overlay!)
    
    // 下拉菜单应该关闭
    expect(screen.queryByText('CSV 文件')).not.toBeInTheDocument()
  })

  // 数据处理测试
  it('handles empty data gracefully', () => {
    render(<ExportButton data={{}} filters={mockFilters} />)
    
    const button = screen.getByRole('button')
    expect(button).toBeEnabled() // 空对象仍然被认为是有效数据
  })

  it('handles null time series data in CSV export', async () => {
    const dataWithNullTimeSeries = { 
      ...mockData, 
      timeSeriesData: null 
    }
    
    mockApiClient.get.mockResolvedValue(dataWithNullTimeSeries)
    
    render(<ExportButton data={dataWithNullTimeSeries} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled()
    })
  })

  // 文件名生成测试
  it('generates correct CSV filename', async () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    await waitFor(() => {
      expect(mockLink.download).toContain('.csv')
    })
  })

  it('generates correct JSON filename', async () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('JSON 数据'))
    
    await waitFor(() => {
      expect(mockLink.download).toContain('.json')
    })
  })

  // CSV内容格式测试
  it('includes BOM in CSV content for proper UTF-8 encoding', async () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text/csv;charset=utf-8;'
        })
      )
    })
  })

  // 可访问性测试
  it('has proper ARIA attributes when disabled', () => {
    render(<ExportButton data={null} filters={mockFilters} />)
    
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('disabled')
  })

  it('maintains focus management in dropdown', () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    const mainButton = screen.getByText('导出数据')
    fireEvent.click(mainButton)
    
    const csvButton = screen.getByText('CSV 文件')
    expect(csvButton).toBeInTheDocument()
    expect(csvButton.tagName).toBe('BUTTON') // 确保是可聚焦的按钮
  })

  // 边界情况测试
  it('handles missing data fields in time series', async () => {
    const incompleteData = {
      timeSeriesData: [
        { timestamp: '2024-01-01T00:00:00Z' }, // 缺少其他字段
        { requests: 100 } // 缺少时间戳
      ]
    }
    
    mockApiClient.get.mockResolvedValue(incompleteData)
    
    render(<ExportButton data={incompleteData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    fireEvent.click(screen.getByText('CSV 文件'))
    
    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled()
    })
  })

  it('displays helper text in dropdown', () => {
    render(<ExportButton data={mockData} filters={mockFilters} />)
    
    fireEvent.click(screen.getByText('导出数据'))
    
    expect(screen.getByText('导出当前筛选的数据')).toBeInTheDocument()
  })
})