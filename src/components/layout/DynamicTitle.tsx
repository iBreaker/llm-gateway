'use client'

import { useEffect } from 'react'
import { useSystemSettings } from '@/contexts/SystemSettingsContext'

export default function DynamicTitle() {
  const { settings } = useSystemSettings()

  useEffect(() => {
    if (settings) {
      // 动态设置页面标题
      document.title = settings.systemName
      
      // 同时更新meta description
      const metaDescription = document.querySelector('meta[name="description"]')
      if (metaDescription) {
        metaDescription.setAttribute('content', settings.description)
      }
    }
  }, [settings])

  return null // 这个组件不渲染任何内容，只用来设置页面标题
}