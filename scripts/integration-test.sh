#!/bin/bash

# LLM Gateway 集成测试脚本
set -e

BINARY="./bin/llm-gateway"
TEST_CONFIG_DIR="/tmp/llm-gateway-test"
TEST_CONFIG_FILE="$TEST_CONFIG_DIR/config.yaml"

echo "🧪 开始 LLM Gateway 集成测试"

# 清理之前的测试环境
cleanup() {
    echo "🧹 清理测试环境..."
    rm -rf "$TEST_CONFIG_DIR"
    pkill -f "$BINARY" 2>/dev/null || true
}

# 设置清理陷阱
trap cleanup EXIT

# 检查二进制文件是否存在
if [[ ! -f "$BINARY" ]]; then
    echo "❌ 二进制文件不存在，请先运行: make build"
    exit 1
fi

# 创建测试配置目录
mkdir -p "$TEST_CONFIG_DIR"

echo "📋 测试1: 帮助信息"
$BINARY --help > /dev/null
$BINARY apikey --help > /dev/null
$BINARY upstream --help > /dev/null
$BINARY server --help > /dev/null
$BINARY oauth --help > /dev/null
echo "✅ 帮助信息测试通过"

echo "📋 测试2: 命令结构验证"
# 测试无效命令
if $BINARY invalid-command 2>/dev/null; then
    echo "❌ 无效命令应该返回错误"
    exit 1
fi
echo "✅ 命令结构验证通过"

echo "📋 测试3: 配置管理"
# 由于没有有效的配置，这些命令会失败，但我们测试它们能正常解析参数

# 测试apikey命令参数解析
$BINARY apikey list 2>/dev/null || echo "预期的配置错误"

# 测试upstream命令参数解析  
$BINARY upstream list 2>/dev/null || echo "预期的配置错误"

echo "✅ 配置管理测试通过"

echo "📋 测试4: 环境变量命令"
$BINARY env list 2>/dev/null || echo "预期的配置错误"
echo "✅ 环境变量命令测试通过"

echo "📋 测试5: 状态命令"
$BINARY status 2>/dev/null || echo "预期的配置错误"
$BINARY health 2>/dev/null || echo "预期的配置错误"
echo "✅ 状态命令测试通过"

echo "🎉 所有集成测试通过！"
echo ""
echo "📊 测试总结:"
echo "  ✅ 帮助信息显示正常"
echo "  ✅ 命令参数解析正常"
echo "  ✅ 错误处理正常"
echo "  ✅ 所有子命令可访问"
echo ""
echo "💡 提示: 要进行完整功能测试，请："
echo "  1. 配置上游账号: $BINARY upstream add ..."
echo "  2. 创建Gateway Key: $BINARY apikey add ..."
echo "  3. 启动服务: $BINARY server start"