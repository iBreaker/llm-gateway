'use client'

import { useState } from 'react'

interface TimeRangeSelectorProps {
  value: {
    start: string
    end: string
    preset: string
  }
  onChange: (value: { start: string; end: string; preset: string }) => void
}

const presets = [
  { value: '1h', label: '最近1小时', hours: 1 },
  { value: '24h', label: '最近24小时', hours: 24 },
  { value: '7d', label: '最近7天', hours: 24 * 7 },
  { value: '30d', label: '最近30天', hours: 24 * 30 },
  { value: '90d', label: '最近90天', hours: 24 * 90 },
  { value: 'custom', label: '自定义', hours: 0 }
]

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(value.preset === 'custom')

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      setShowCustom(true)
      onChange({
        ...value,
        preset
      })
    } else {
      setShowCustom(false)
      const presetConfig = presets.find(p => p.value === preset)
      if (presetConfig) {
        const end = new Date()
        const start = new Date(end.getTime() - presetConfig.hours * 60 * 60 * 1000)
        onChange({
          start: start.toISOString(),
          end: end.toISOString(),
          preset
        })
      }
    }
  }

  const handleCustomDateChange = (field: 'start' | 'end', dateValue: string) => {
    onChange({
      ...value,
      [field]: new Date(dateValue).toISOString()
    })
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-700">时间范围:</span>
        <select
          value={value.preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {presets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      {showCustom && (
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">从:</label>
            <input
              type="datetime-local"
              value={new Date(value.start).toISOString().slice(0, 16)}
              onChange={(e) => handleCustomDateChange('start', e.target.value)}
              className="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">到:</label>
            <input
              type="datetime-local"
              value={new Date(value.end).toISOString().slice(0, 16)}
              onChange={(e) => handleCustomDateChange('end', e.target.value)}
              className="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-700">数据粒度:</span>
        <select
          value={value.preset === '1h' ? 'hour' : value.preset === '24h' ? 'hour' : value.preset === '7d' ? 'day' : value.preset === '30d' ? 'day' : 'week'}
          onChange={(e) => {
            // 根据粒度选择合适的时间范围
            const granularity = e.target.value as 'hour' | 'day' | 'week' | 'month'
            let preset = value.preset
            
            if (granularity === 'hour' && !['1h', '24h'].includes(value.preset)) {
              preset = '24h'
              handlePresetChange('24h')
            } else if (granularity === 'day' && !['7d', '30d'].includes(value.preset)) {
              preset = '7d'
              handlePresetChange('7d')
            } else if (granularity === 'week' && value.preset !== '90d') {
              preset = '90d'
              handlePresetChange('90d')
            }
          }}
          className="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="hour">小时</option>
          <option value="day">天</option>
          <option value="week">周</option>
          <option value="month">月</option>
        </select>
      </div>
    </div>
  )
}