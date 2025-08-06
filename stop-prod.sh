#!/bin/bash
# LLM Gateway 生产环境停止脚本

set -e

echo "🛑 停止 LLM Gateway 生产环境服务"
echo "============================="

# 检查并停止Rust服务
if [ -f rust-prod.pid ]; then
    RUST_PID=$(cat rust-prod.pid)
    if kill -0 "$RUST_PID" 2>/dev/null; then
        echo "🛑 停止 Rust 服务 (PID: $RUST_PID)..."
        kill "$RUST_PID"
        sleep 2
        
        # 强制杀死进程（如果仍在运行）
        if kill -0 "$RUST_PID" 2>/dev/null; then
            echo "⚠️ 强制停止 Rust 服务..."
            kill -9 "$RUST_PID"
        fi
        
        echo "✅ Rust 服务已停止"
    else
        echo "⚠️ Rust 服务已经停止"
    fi
    
    rm -f rust-prod.pid
else
    echo "⚠️ 未找到 rust-prod.pid 文件"
fi

# 清理旧的静态服务器PID文件（如果存在）
if [ -f static-server.pid ]; then
    rm -f static-server.pid
fi

echo ""
echo "✅ 所有服务已停止!"
echo ""