'use client'

import { useState } from 'react'
import { apiClient } from '../../utils/api'

interface ExportButtonProps {
  data: any
  filters: any
}

export function ExportButton({ data, filters }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  const exportFormats = [
    { value: 'csv', label: 'CSV 文件', icon: '📊' },
    { value: 'xlsx', label: 'Excel 文件', icon: '📈' },
    { value: 'pdf', label: 'PDF 报告', icon: '📄' },
    { value: 'json', label: 'JSON 数据', icon: '📋' }
  ]

  const handleExport = async (format: string) => {
    setIsExporting(true)
    setShowOptions(false)

    try {
      // 获取最新的详细统计数据用于导出
      const detailedData = await apiClient.get('/api/stats/detailed')
      
      switch (format) {
        case 'csv':
          exportToCSV(detailedData)
          break
        case 'xlsx':
          exportToExcel()
          break
        case 'pdf':
          exportToPDF()
          break
        case 'json':
          exportToJSON(detailedData)
          break
      }
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  const exportToCSV = (exportData: any = data) => {
    if (!exportData) return

    const csvRows = []
    
    // CSV 头部
    csvRows.push(['时间', '请求总数', '成功请求', '失败请求', '平均响应时间(ms)', '总成本(USD)', '错误率'].join(','))
    
    // 如果有时序数据
    if (exportData.timeSeriesData && Array.isArray(exportData.timeSeriesData)) {
      exportData.timeSeriesData.forEach((item: any) => {
        csvRows.push([
          item.timestamp || item.date || new Date().toISOString(),
          item.totalRequests || item.requests || 0,
          item.successfulRequests || 0,
          item.failedRequests || 0,
          item.averageLatencyMs || item.responseTime || 0,
          item.totalCostUsd || item.cost || 0,
          ((item.errorRate || 0) * 100).toFixed(2) + '%'
        ].join(','))
      })
    } else {
      // 如果没有时序数据，使用总体统计
      csvRows.push([
        new Date().toISOString(),
        exportData.totalRequests || 0,
        exportData.successfulRequests || 0,
        exportData.failedRequests || 0,
        exportData.averageLatencyMs || 0,
        exportData.totalCostUsd || 0,
        ((exportData.errorRate || 0) * 100).toFixed(2) + '%'
      ].join(','))
    }

    const csvContent = csvRows.join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `统计数据_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const exportToExcel = () => {
    // 模拟Excel导出
    alert('Excel 导出功能开发中...')
  }

  const exportToPDF = () => {
    // 模拟PDF导出
    alert('PDF 导出功能开发中...')
  }

  const exportToJSON = (exportData: any = data) => {
    if (!exportData) return

    const jsonContent = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `统计数据_${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(!showOptions)}
        disabled={isExporting || !data}
        className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isExporting || !data
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isExporting ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>导出中...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>导出数据</span>
          </>
        )}
      </button>

      {/* 导出选项下拉菜单 */}
      {showOptions && !isExporting && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
          <div className="py-1">
            {exportFormats.map((format) => (
              <button
                key={format.value}
                onClick={() => handleExport(format.value)}
                className="flex items-center space-x-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <span className="text-lg">{format.icon}</span>
                <span>{format.label}</span>
              </button>
            ))}
          </div>
          
          <div className="border-t border-gray-200 py-1">
            <div className="px-4 py-2 text-xs text-gray-500">
              导出当前筛选的数据
            </div>
          </div>
        </div>
      )}

      {/* 点击外部关闭下拉菜单 */}
      {showOptions && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowOptions(false)}
        />
      )}
    </div>
  )
}