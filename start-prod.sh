#!/bin/bash
# LLM Gateway 生产环境启动脚本

set -e

echo "🚀 LLM Gateway 生产环境启动"
echo "=============================="

# 检查依赖
if ! command -v cargo &> /dev/null; then
    echo "❌ 错误: 未安装 Rust/Cargo"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js/npm"
    exit 1
fi

# 构建前端 (生产模式 - 静态导出)
echo "🌐 构建前端静态文件..."
NODE_ENV=production npm run build

# 构建 Rust 后端
echo "🦀 构建 Rust 后端..."
cd llm-gateway-rust
cargo build --release
cd ..

# 停止旧服务（如果存在）
echo "🛑 检查并停止旧服务..."
if [ -f rust-prod.pid ]; then
    OLD_PID=$(cat rust-prod.pid)
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "🛑 停止旧的 Rust 服务 (PID: $OLD_PID)..."
        kill "$OLD_PID"
        sleep 2
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo "⚠️ 强制停止旧服务..."
            kill -9 "$OLD_PID"
        fi
        echo "✅ 旧服务已停止"
    fi
    rm -f rust-prod.pid
fi

# 启动服务
echo "🚀 启动Rust服务（同时提供前端和API）..."

# 设置环境变量，告诉Rust服务器静态文件位置
export FRONTEND_DIST_PATH="../out"

# 启动 Rust 后端（集成前端静态文件服务）
echo "▶️  启动 Rust 统一服务 (端口 9527)..."
cd llm-gateway-rust
nohup ./target/release/llm-gateway-rust > ../rust-prod.log 2>&1 &
RUST_PID=$!
cd ..

# 等待服务启动
sleep 3

echo ""
echo "✅ 生产环境启动完成!"
echo "================================"
echo "🌐 统一服务入口: http://localhost:9527"
echo "📱 前端界面: http://localhost:9527"
echo "🔧 后端API: http://localhost:9527/api"
echo "📋 健康检查: http://localhost:9527/health"
echo ""
echo "📜 查看日志:"
echo "  服务日志: tail -f rust-prod.log"
echo ""
echo "🛑 停止服务:"
echo "  kill $RUST_PID"
echo "  或运行: ./stop-prod.sh"
echo ""

# 保存PID到文件
echo "$RUST_PID" > rust-prod.pid

echo "🎯 进程 ID 已保存到 rust-prod.pid 文件"