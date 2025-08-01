/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 服务端构建时排除 better-sqlite3 的二进制文件
      config.externals.push('better-sqlite3')
    }
    return config
  },
  env: {
    // 环境变量配置
    NEXT_PUBLIC_APP_NAME: 'LLM Gateway',
    NEXT_PUBLIC_APP_VERSION: '0.1.0'
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' }
        ]
      }
    ]
  }
}

module.exports = nextConfig