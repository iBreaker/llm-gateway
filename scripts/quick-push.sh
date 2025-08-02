#!/bin/bash

# 快速推送脚本
# 使用方法: ./scripts/quick-push.sh "提交信息"

# 检查是否提供了提交信息
if [ -z "$1" ]; then
    echo "❌ 请提供提交信息"
    echo "使用方法: ./scripts/quick-push.sh \"提交信息\""
    exit 1
fi

COMMIT_MESSAGE="$1"

echo "🚀 开始快速推送流程..."

# 1. 查看状态
echo "📋 查看修改状态..."
git status

# 2. 添加所有修改
echo "➕ 添加所有修改..."
git add .

# 3. 提交修改
echo "💾 提交修改..."
git commit -m "$COMMIT_MESSAGE"

# 4. 推送到远程仓库
echo "📤 推送到远程仓库..."
git push

echo "✅ 快速推送完成！"
echo "🔄 Vercel 正在自动部署..." 