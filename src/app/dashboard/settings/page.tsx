import DashboardLayout from '@/components/dashboard/DashboardLayout'

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">系统设置</h1>
          <p className="text-gray-600 mt-2">配置系统参数和服务选项</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 基础设置 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">基础设置</h2>
            <div className="space-y-4">
              <SettingItem
                label="服务名称"
                value="LLM Gateway"
                type="input"
              />
              <SettingItem
                label="默认超时时间"
                value="30秒"
                type="select"
                options={['15秒', '30秒', '60秒', '120秒']}
              />
              <SettingItem
                label="启用日志记录"
                value={true}
                type="toggle"
              />
              <SettingItem
                label="启用监控告警"
                value={true}
                type="toggle"
              />
            </div>
          </div>

          {/* 限流设置 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">限流设置</h2>
            <div className="space-y-4">
              <SettingItem
                label="每分钟请求限制"
                value="1000"
                type="input"
              />
              <SettingItem
                label="每小时请求限制"
                value="50000"
                type="input"
              />
              <SettingItem
                label="单IP限制"
                value="100/分钟"
                type="input"
              />
              <SettingItem
                label="启用IP白名单"
                value={false}
                type="toggle"
              />
            </div>
          </div>

          {/* 数据库设置 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">数据库设置</h2>
            <div className="space-y-4">
              <SettingItem
                label="数据库类型"
                value="SQLite"
                type="select"
                options={['SQLite', 'PostgreSQL']}
              />
              <SettingItem
                label="自动备份"
                value={true}
                type="toggle"
              />
              <SettingItem
                label="备份频率"
                value="每日"
                type="select"
                options={['每小时', '每日', '每周']}
              />
              <SettingItem
                label="数据保留期"
                value="30天"
                type="select"
                options={['7天', '30天', '90天', '永久']}
              />
            </div>
          </div>

          {/* 缓存设置 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">缓存设置</h2>
            <div className="space-y-4">
              <SettingItem
                label="缓存类型"
                value="内存缓存"
                type="select"
                options={['内存缓存', 'Redis']}
              />
              <SettingItem
                label="缓存TTL"
                value="1小时"
                type="select"
                options={['15分钟', '30分钟', '1小时', '6小时']}
              />
              <SettingItem
                label="最大缓存大小"
                value="100MB"
                type="input"
              />
              <SettingItem
                label="启用缓存压缩"
                value={true}
                type="toggle"
              />
            </div>
          </div>
        </div>

        {/* 系统信息 */}
        <div className="bg-white rounded-lg shadow border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">系统信息</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoItem label="版本" value="v0.1.0" />
            <InfoItem label="运行时间" value="3天 2小时 15分钟" />
            <InfoItem label="Node.js 版本" value="v18.19.0" />
            <InfoItem label="内存使用" value="128 MB / 512 MB" />
            <InfoItem label="磁盘使用" value="2.1 GB / 10 GB" />
            <InfoItem label="负载均衡" value="启用" />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end space-x-4">
          <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            重置
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            保存设置
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}

function SettingItem({ 
  label, 
  value, 
  type, 
  options = [] 
}: { 
  label: string
  value: any
  type: 'input' | 'select' | 'toggle'
  options?: string[]
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="w-48">
        {type === 'input' && (
          <input
            type="text"
            defaultValue={value}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        )}
        {type === 'select' && (
          <select
            defaultValue={value}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            {options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        )}
        {type === 'toggle' && (
          <button
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              value ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                value ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        )}
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}