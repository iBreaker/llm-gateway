#!/bin/bash
# 全 Rust 开发模式脚本

set -e

echo "🦀 启动全 Rust 开发环境..."

# 构建最新的前端静态文件
echo "📦 构建前端静态文件..."
npm run build:static

# 设置环境变量并启动 Rust 服务
echo "🚀 启动 Rust 全栈服务..."
export FRONTEND_DIST_PATH="$(pwd)/out"
export RUST_LOG="llm_gateway_rust=debug,tower_http=debug"

cd llm-gateway-rust
cargo run --bin llm-gateway-rust