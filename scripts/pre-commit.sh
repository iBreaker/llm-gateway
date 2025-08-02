#!/bin/bash

# Pre-commit 钩子脚本
# 在提交前自动运行代码质量检查

echo "🔍 运行代码质量检查..."

# 1. 运行 TypeScript 类型检查
echo "📝 运行 TypeScript 类型检查..."
npm run typecheck
if [ $? -ne 0 ]; then
    echo "❌ TypeScript 类型检查失败，请修复类型错误"
    exit 1
fi

# 2. 运行 ESLint 检查
echo "🔧 运行 ESLint 检查..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ ESLint 检查失败，请修复代码风格问题"
    exit 1
fi

echo "✅ 代码质量检查通过！"
exit 0 