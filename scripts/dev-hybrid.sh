#!/bin/bash
# 混合开发模式脚本 - Next.js 前端 + Rust 后端

set -e

echo "🔄 启动混合开发环境..."
echo "📱 前端: Next.js 热重载 (localhost:7439)"
echo "🦀 后端: Rust API 服务 (localhost:9527)"

# 启动 Rust 后端（后台）
echo "🚀 启动 Rust API 服务..."
cd llm-gateway-rust
cargo run --bin llm-gateway-rust > ../logs/rust-backend.log 2>&1 &
RUST_PID=$!
cd ..

# 等待后端启动
sleep 5

# 检查后端状态
if curl -s http://localhost:9527/health > /dev/null; then
    echo "✅ Rust 后端服务启动成功"
else
    echo "❌ Rust 后端服务启动失败"
    exit 1
fi

# 启动前端开发服务器
echo "🌐 启动 Next.js 前端服务..."
npm run dev

# 清理：当脚本退出时停止后端进程
trap "echo '🛑 停止后端服务...'; kill $RUST_PID 2>/dev/null || true" EXIT