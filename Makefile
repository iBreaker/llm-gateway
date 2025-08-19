.PHONY: build clean run test deps

# 变量定义
BINARY_NAME=llm-gateway
BUILD_DIR=bin
CMD_DIR=cmd

# 构建
build:
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./$(CMD_DIR)/main.go

# 清理
clean:
	rm -rf $(BUILD_DIR)
	go clean

# 运行
run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

# 测试
test:
	go test ./...

# 测试覆盖率
test-cover:
	go test ./... -cover

# 生成覆盖率报告
test-coverage:
	go test ./... -coverprofile=coverage.out
	go tool cover -html=coverage.out -o coverage.html

# 安装依赖
deps:
	go mod tidy

# 格式化代码
fmt:
	go fmt ./...

# 检查代码
check:
	go vet ./...