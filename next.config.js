/** @type {import('next').NextConfig} */
const nextConfig = {
  // 临时禁用静态导出以修复JavaScript交互问题
  // output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  
  // 开发模式才使用API代理
  ...(process.env.NODE_ENV !== 'production' && {
    async rewrites() {
      const rustBackendUrl = process.env.NEXT_PUBLIC_RUST_BACKEND_URL || process.env.RUST_BACKEND_URL || 'http://localhost:9527';
      
      console.log(`🦀 开发模式：所有 API 请求转发到 Rust 后端 ${rustBackendUrl}`);
      
      return [
        {
          source: '/api/:path*',
          destination: `${rustBackendUrl}/api/:path*`,
        },
        {
          source: '/v1/:path*',
          destination: `${rustBackendUrl}/v1/:path*`,
        },
        {
          source: '/health',
          destination: `${rustBackendUrl}/health`,
        },
      ];
    },
    
    async headers() {
      return [
        {
          source: '/api/:path*',
          headers: [
            { key: 'Access-Control-Allow-Origin', value: '*' },
            { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
            { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-api-key' }
          ]
        }
      ]
    }
  }),
  
  env: {
    NEXT_PUBLIC_APP_NAME: 'LLM Gateway',
    NEXT_PUBLIC_APP_VERSION: '0.1.0',
    NEXT_PUBLIC_RUST_BACKEND_URL: process.env.NEXT_PUBLIC_RUST_BACKEND_URL || 'http://localhost:9527',
  }
}

module.exports = nextConfig