#!/bin/bash

# 代码质量检查脚本
set -e

echo "🔍 开始代码质量检查..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_step() {
    local step_name="$1"
    local command="$2"
    
    echo -n "📋 $step_name... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 通过${NC}"
        return 0
    else
        echo -e "${RED}❌ 失败${NC}"
        return 1
    fi
}

# 详细检查函数
check_step_verbose() {
    local step_name="$1"
    local command="$2"
    
    echo "📋 $step_name..."
    
    if eval "$command"; then
        echo -e "${GREEN}✅ $step_name 通过${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ $step_name 失败${NC}"
        echo ""
        return 1
    fi
}

# 初始化计数器
passed=0
failed=0
total=0

# 检查Go环境
echo "🔧 检查开发环境..."
check_step "Go版本检查" "go version | grep -q '1.21'"
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

check_step "Go模块验证" "go mod verify"
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

# 代码格式检查
echo ""
echo "📝 代码格式检查..."
check_step_verbose "代码格式化检查" "gofmt -d . | tee /tmp/gofmt.out && [[ ! -s /tmp/gofmt.out ]]"
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

# 静态分析
echo "🔬 静态代码分析..."
check_step_verbose "Go Vet检查" "go vet ./..."
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

# 如果安装了golangci-lint，运行它
if command -v golangci-lint &> /dev/null; then
    check_step_verbose "Golangci-lint检查" "golangci-lint run --timeout=5m"
    ((total++))
    if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi
else
    echo -e "${YELLOW}⚠️  golangci-lint 未安装，跳过高级lint检查${NC}"
fi

# 安全扫描
if command -v gosec &> /dev/null; then
    check_step_verbose "安全扫描" "gosec -quiet ./..."
    ((total++))
    if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi
else
    echo -e "${YELLOW}⚠️  gosec 未安装，跳过安全扫描${NC}"
fi

# 测试覆盖率
echo "🧪 测试执行..."
check_step_verbose "单元测试" "go test -race -v ./..."
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

check_step_verbose "测试覆盖率检查" "go test -race -coverprofile=coverage.out ./... && go tool cover -func=coverage.out"
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

# 构建测试
echo "🏗️  构建测试..."
check_step "构建测试" "go build -o /tmp/llm-gateway-test ./cmd/main.go"
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

# 交叉编译测试
check_step "Linux交叉编译" "GOOS=linux GOARCH=amd64 go build -o /tmp/llm-gateway-linux ./cmd/main.go"
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

check_step "Windows交叉编译" "GOOS=windows GOARCH=amd64 go build -o /tmp/llm-gateway.exe ./cmd/main.go"
((total++))
if [[ $? -eq 0 ]]; then ((passed++)); else ((failed++)); fi

# 清理临时文件
rm -f /tmp/llm-gateway-test /tmp/llm-gateway-linux /tmp/llm-gateway.exe /tmp/gofmt.out

# 结果汇总
echo ""
echo "📊 检查结果汇总:"
echo -e "  总检查项: $total"
echo -e "  ${GREEN}通过: $passed${NC}"
echo -e "  ${RED}失败: $failed${NC}"

if [[ $failed -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}🎉 所有代码质量检查通过！${NC}"
    echo ""
    echo "💡 建议的下一步操作:"
    echo "  • 运行 make ci 执行完整CI流程"
    echo "  • 运行 make integration-test 执行集成测试"
    echo "  • 提交代码前运行 make quality 确保代码质量"
    exit 0
else
    echo ""
    echo -e "${RED}❌ 代码质量检查失败，请修复上述问题后重试${NC}"
    echo ""
    echo "🛠️  修复建议:"
    echo "  • 运行 make fmt 自动格式化代码"
    echo "  • 运行 make lint 查看详细lint信息"
    echo "  • 运行 go test -v ./... 查看测试详情"
    exit 1
fi