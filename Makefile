.PHONY: build clean run test deps fmt check lint security cross-build docker help

# 变量定义
BINARY_NAME=llm-gateway
BUILD_DIR=bin
DIST_DIR=dist
CMD_DIR=cmd
GO_VERSION=1.21
LDFLAGS=-ldflags="-s -w -X main.version=$(shell git describe --tags --always --dirty)"

# 默认目标
all: clean deps fmt check lint test build

# 构建
build:
	@mkdir -p $(BUILD_DIR)
	go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./$(CMD_DIR)/main.go

# 交叉编译
cross-build:
	@mkdir -p $(DIST_DIR)
	# Linux
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-linux-amd64 ./$(CMD_DIR)/main.go
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-linux-arm64 ./$(CMD_DIR)/main.go
	# macOS
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-darwin-amd64 ./$(CMD_DIR)/main.go
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-darwin-arm64 ./$(CMD_DIR)/main.go
	# Windows
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-windows-amd64.exe ./$(CMD_DIR)/main.go

# 清理
clean:
	rm -rf $(BUILD_DIR) $(DIST_DIR) coverage.out coverage.html
	go clean

# 运行
run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

# 测试
test:
	go test -race -v ./...

# 测试覆盖率
test-cover:
	go test -race -cover ./...

# 生成覆盖率报告
test-coverage:
	go test -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# 基准测试
bench:
	go test -bench=. -benchmem ./...

# 安装依赖
deps:
	go mod download
	go mod tidy
	go mod verify

# 格式化代码
fmt:
	go fmt ./...
	goimports -w -local github.com/iBreaker/llm-gateway .

# 检查代码
check:
	go vet ./...
	go mod verify

# Lint检查
lint:
	@which golangci-lint > /dev/null || (echo "请安装 golangci-lint: https://golangci-lint.run/usage/install/" && exit 1)
	golangci-lint run --timeout=5m

# 安装golangci-lint
install-lint:
	@which golangci-lint > /dev/null || \
	(echo "安装 golangci-lint..." && \
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(shell go env GOPATH)/bin v1.54.2)

# 安全扫描
security:
	@which gosec > /dev/null || go install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest
	gosec -fmt=json -out=gosec-report.json -stdout ./...

# Docker构建
docker:
	docker build -t $(BINARY_NAME):latest .

# 安装到系统
install: build
	@mkdir -p ~/bin
	cp $(BUILD_DIR)/$(BINARY_NAME) ~/bin/
	@echo "已安装到 ~/bin/$(BINARY_NAME)"

# 卸载
uninstall:
	rm -f ~/bin/$(BINARY_NAME)

# 发布准备
release: clean deps fmt check lint test cross-build
	@echo "发布包已准备就绪，位于 $(DIST_DIR)/ 目录"

# CI流水线
ci: deps check lint test-coverage

# 本地开发环境检查
dev-setup: install-lint deps
	@echo "开发环境已设置完成"

# 代码质量检查
quality: fmt check lint security test-coverage
	@echo "代码质量检查完成"

# 运行质量检查脚本
quality-check:
	@./scripts/quality-check.sh

# 运行集成测试
integration-test: build
	@./scripts/integration-test.sh

# 帮助信息
help:
	@echo "可用的Make目标:"
	@echo "  build         - 构建二进制文件"
	@echo "  cross-build   - 交叉编译多平台版本"
	@echo "  clean         - 清理构建产物"
	@echo "  run           - 构建并运行程序"
	@echo "  test          - 运行测试"
	@echo "  test-cover    - 运行测试并显示覆盖率"
	@echo "  test-coverage - 生成覆盖率报告"
	@echo "  bench         - 运行基准测试"
	@echo "  deps          - 下载和整理依赖"
	@echo "  fmt           - 格式化代码"
	@echo "  check         - 静态代码检查"
	@echo "  lint          - 运行golangci-lint"
	@echo "  install-lint  - 安装golangci-lint"
	@echo "  security      - 安全扫描"
	@echo "  docker        - 构建Docker镜像"
	@echo "  install       - 安装到系统"
	@echo "  uninstall     - 从系统卸载"
	@echo "  release       - 准备发布包"
	@echo "  ci            - CI流水线"
	@echo "  dev-setup     - 设置开发环境"
	@echo "  quality       - 代码质量检查"
	@echo "  quality-check - 运行质量检查脚本"
	@echo "  integration-test - 运行集成测试"
	@echo "  help          - 显示此帮助信息"