/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生产模式配置：标准构建
  output: undefined,
  trailingSlash: true,
  
  // Rust 后端集成 - 将所有 API 请求转发到 Rust 后端
  async rewrites() {
    const rustBackendUrl = process.env.NEXT_PUBLIC_RUST_BACKEND_URL || process.env.RUST_BACKEND_URL || 'http://localhost:9527';
    
    console.log(`🦀 生产模式：所有 API 请求转发到 Rust 后端 ${rustBackendUrl}`);
    
    return [
      // 将所有 /api/* 请求转发到 Rust 后端
      {
        source: '/api/:path*',
        destination: `${rustBackendUrl}/api/:path*`,
      },
      // LLM API 请求
      {
        source: '/v1/:path*',
        destination: `${rustBackendUrl}/v1/:path*`,
      },
      // 健康检查
      {
        source: '/health',
        destination: `${rustBackendUrl}/health`,
      },
    ];
  },
  
  env: {
    // 环境变量配置
    NEXT_PUBLIC_APP_NAME: 'LLM Gateway',
    NEXT_PUBLIC_APP_VERSION: '0.1.0',
    RUST_BACKEND_URL: process.env.RUST_BACKEND_URL,
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
}

module.exports = nextConfig