#!/bin/bash

# LLM Gateway HTTP代理功能测试脚本

set -e

echo "🚀 开始测试LLM Gateway HTTP代理功能"

# 配置
GATEWAY_URL="http://localhost:8081"
API_KEY=""

# 检查服务器是否运行
echo "📋 检查服务器状态..."
if ! curl -s "$GATEWAY_URL/health" > /dev/null; then
    echo "❌ 服务器未运行，请先启动: ./bin/llm-gateway server start"
    exit 1
fi

echo "✅ 服务器运行正常"

# 获取API Key（从我们之前创建的Gateway API Key）
echo "🔑 查找可用的API Key..."

# 列出所有keys并获取第一个active的key
KEYS_OUTPUT=$(./bin/llm-gateway apikey list)
echo "Keys output: $KEYS_OUTPUT"

# 如果没有active key，创建一个
if ! echo "$KEYS_OUTPUT" | grep -q "active"; then
    echo "📝 创建新的测试API Key..."
    ./bin/llm-gateway apikey add --name="测试代理密钥" --permissions="read,write"
    KEYS_OUTPUT=$(./bin/llm-gateway apikey list)
fi

echo "📊 当前Gateway API Keys:"
echo "$KEYS_OUTPUT"

echo "⚠️  注意: 需要手动获取API Key进行测试"
echo "使用 ./bin/llm-gateway apikey list 查看keys"
echo "然后使用完整的API key（64字符）进行测试"

# 测试用例1：无认证请求
echo "🧪 测试1: 无认证请求 (应该返回401)"
curl -s -X POST "$GATEWAY_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet",
    "messages": [{"role": "user", "content": "Hello"}]
  }' | jq . || echo "Response: $(curl -s -X POST "$GATEWAY_URL/v1/chat/completions" -H "Content-Type: application/json" -d '{"model": "claude-3-sonnet", "messages": [{"role": "user", "content": "Hello"}]}')"

echo ""
echo "✅ HTTP代理功能基础测试完成!"
echo "🔧 要进行完整测试，请:"
echo "1. 获取真实的Gateway API Key"
echo "2. 添加真实的上游账号（Anthropic API Key）"
echo "3. 使用以下命令测试:"
echo ""
echo "curl -X POST $GATEWAY_URL/v1/chat/completions \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"Authorization: Bearer YOUR_GATEWAY_API_KEY\" \\"
echo "  -d '{"
echo "    \"model\": \"claude-3-sonnet\","
echo "    \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]"
echo "  }'"