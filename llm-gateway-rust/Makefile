.PHONY: help db-check db-migrate db-reset db-create server test build clean

# 默认目标
help:
	@echo "LLM Gateway Rust - 可用命令："
	@echo "  make db-check    - 检查数据库连接"
	@echo "  make db-migrate  - 运行数据库迁移"
	@echo "  make db-reset    - 重置数据库（危险！）"
	@echo "  make db-create   - 创建新的迁移文件"
	@echo "  make server      - 启动服务器"
	@echo "  make test        - 运行测试"
	@echo "  make build       - 构建项目"
	@echo "  make clean       - 清理构建产物"

# 数据库操作
db-check:
	cargo run --bin db -- check

db-migrate:
	cargo run --bin db -- migrate

db-reset:
	cargo run --bin db -- reset

db-create:
	@read -p "输入迁移名称: " name; \
	cargo run --bin db -- create "$$name"

# 开发
server:
	cargo run --bin llm-gateway-rust

test:
	cargo test

build:
	cargo build --release

clean:
	cargo clean
	rm -f /tmp/rust-service.log

# 快捷命令
dev: db-migrate server