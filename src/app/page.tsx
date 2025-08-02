/**
 * 首页组件
 * 重定向逻辑由 middleware.ts 处理
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">正在跳转...</p>
      </div>
    </div>
  )
}