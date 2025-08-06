import { useEffect } from 'react'

/**
 * 监听ESC键按下并执行回调函数的Hook
 * @param onEscape ESC键按下时的回调函数
 * @param enabled 是否启用ESC键监听，默认为true
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onEscape, enabled])
}