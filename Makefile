# LLM Gateway Makefile
# 提供统一的开发和部署命令

.PHONY: help init dev build clean stop logs test lint typecheck release

# 默认目标
help:
	@echo "🦀 LLM Gateway - 可用命令:"
	@echo ""
	@echo "初始化命令:"
	@echo "  make init     - 初始化项目环境 (安装依赖、设置数据库、运行迁移)"
	@echo ""
	@echo "开发命令:"
	@echo "  make dev      - 启动完整开发环境 (前端 + Rust后端)"
	@echo "  make frontend - 仅启动前端开发服务器"
	@echo "  make backend  - 仅启动Rust后端服务"
	@echo "  make stop     - 停止所有服务"
	@echo ""
	@echo "构建命令:"
	@echo "  make build    - 构建所有组件"
	@echo "  make release  - 构建生产版本"
	@echo ""
	@echo "工具命令:"
	@echo "  make test     - 运行所有测试"
	@echo "  make lint     - 代码检查"
	@echo "  make clean    - 清理构建文件"
	@echo "  make logs     - 查看服务日志"

# 项目初始化
init:
	@echo "🚀 初始化 LLM Gateway 项目环境..."
	@echo ""
	@echo "📦 安装 Node.js 依赖..."
	@npm install
	@echo ""
	@echo "🦀 安装 Rust 工具链..."
	@rustup component add clippy rustfmt
	@echo ""
	@echo "🔧 安装 SQLx CLI..."
	@cargo install sqlx-cli --features postgres
	@echo ""
	@echo "🗃️  创建必要目录..."
	@mkdir -p postgres/init logs
	@chmod 755 postgres/init
	@echo ""
	@echo "🐳 启动数据库服务 (PostgreSQL + Redis)..."
	@docker-compose up -d postgres redis
	@echo "⏳ 等待数据库服务启动..."
	@sleep 10
	@echo ""
	@echo "🗃️  运行数据库迁移..."
	@export DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway" && cd llm-gateway-rust && sqlx migrate run
	@echo ""
	@echo "✅ 项目初始化完成!"
	@echo ""
	@echo "🎯 接下来您可以："
	@echo "  make dev      - 启动开发环境"
	@echo "  make health   - 检查服务健康状态"
	@echo "  make help     - 查看所有可用命令"

# 开发环境启动
dev:
	@echo "🛑 停止现有服务..."
	@-pkill -f "llm-gateway-rust" 2>/dev/null || true
	@-pkill -f "next dev" 2>/dev/null || true
	@-lsof -ti:9527 | xargs kill -9 2>/dev/null || true
	@-lsof -ti:7439 | xargs kill -9 2>/dev/null || true
	@mkdir -p log
	@echo "🚀 启动 LLM Gateway 开发环境..."
	@echo "📦 构建 Rust 后端..."
	@cd llm-gateway-rust && export DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway" && cargo build
	@echo "🦀 启动 Rust 后端服务 (端口 9527)..."
	@mkdir -p logs && rm -f logs/*.log
	@cd llm-gateway-rust && export DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway" && ./target/debug/llm-gateway-rust >> ../logs/rust-backend.log 2>&1 &
	@sleep 2
	@echo "🌐 启动 Next.js 前端服务 (端口 7439)..."
	@npm run dev >> logs/next-frontend.log 2>&1 &
	@sleep 3
	@echo ""
	@echo "✅ 开发环境启动完成!"
	@echo "📱 前端界面: http://localhost:7439"
	@echo "🔧 后端API: http://localhost:9527"
	@echo "📋 健康检查: http://localhost:9527/health"
	@echo ""
	@echo "📜 查看日志: make logs"
	@echo "🛑 停止服务: make stop"

# 仅启动前端
frontend: 
	@echo "🌐 启动前端开发服务器..."
	@npm run dev

# 仅启动后端
backend:
	@echo "🦀 启动 Rust 后端服务..."
	@cd llm-gateway-rust && export DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway" && cargo run

# 停止所有服务
stop:
	@echo "🛑 停止所有 LLM Gateway 服务..."
	@-pkill -f "llm-gateway-rust" 2>/dev/null || true
	@-pkill -f "next dev" 2>/dev/null || true
	@-lsof -ti:9527 | xargs kill -9 2>/dev/null || true
	@-lsof -ti:7439 | xargs kill -9 2>/dev/null || true
	@echo "✅ 所有服务已停止"

# 构建所有组件
build:
	@echo "🔨 构建前端..."
	@npm run build
	@echo "🦀 构建 Rust 后端..."
	@cd llm-gateway-rust && export DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway" && cargo build

# 生产版本构建
release:
	@echo "🚀 构建生产版本..."
	@echo "🦀 构建 Rust 后端..."
	@cd llm-gateway-rust && export DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway" && cargo build --release
	@echo "🌐 构建 Next.js 前端..."
	@cp next.config.prod.js next.config.js.backup
	@mv next.config.js next.config.dev.js 
	@mv next.config.prod.js next.config.js
	@npm run build
	@mv next.config.js next.config.prod.js
	@mv next.config.dev.js next.config.js
	@echo "✅ 生产版本构建完成"
	@echo "📦 前端构建文件: ./.next/"
	@echo "🦀 Rust 二进制: ./llm-gateway-rust/target/release/llm-gateway-rust"

# 运行测试
test:
	@echo "🧪 运行前端测试..."
	@npm run test:ci || true
	@echo "🦀 运行 Rust 测试..."
	@cd llm-gateway-rust && export DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway" && cargo test

# 代码检查
lint:
	@echo "🔍 前端代码检查..."
	@npm run lint
	@npm run typecheck
	@echo "🦀 Rust 代码检查..."
	@cd llm-gateway-rust && cargo clippy -- -D warnings
	@cd llm-gateway-rust && cargo fmt --check

# 修复代码格式
fix:
	@echo "🔧 修复代码格式..."
	@npm run lint --fix || true
	@cd llm-gateway-rust && cargo fmt
	@cd llm-gateway-rust && cargo fix --allow-dirty

# 清理构建文件
clean:
	@echo "🧹 清理构建文件..."
	@rm -rf .next out node_modules/.cache
	@cd llm-gateway-rust && cargo clean
	@rm -rf logs
	@echo "✅ 清理完成"

# 查看日志
logs:
	@echo "📜 LLM Gateway 服务日志:"
	@echo ""
	@echo "=== Rust 后端日志 ==="
	@tail -f logs/rust-backend.log 2>/dev/null || echo "后端日志文件不存在" &
	@echo ""
	@echo "=== Next.js 前端日志 ==="
	@tail -f logs/next-frontend.log 2>/dev/null || echo "前端日志文件不存在"

# 数据库操作
db-reset:
	@echo "🗃️  重置数据库..."
	@cd llm-gateway-rust && sqlx database reset -y
	@echo "✅ 数据库重置完成"

db-migrate:
	@echo "🗃️  运行数据库迁移..."
	@cd llm-gateway-rust && sqlx migrate run
	@echo "✅ 数据库迁移完成"

# 健康检查
health:
	@echo "🏥 检查服务健康状态..."
	@echo "后端健康检查:"
	@curl -s http://localhost:9527/health | jq . || echo "❌ 后端服务未响应"
	@echo ""
	@echo "前端健康检查:"
	@curl -s http://localhost:7439/api/health | jq . || echo "❌ 前端服务未响应"

# 开发工具安装
install:
	@echo "📦 安装开发依赖..."
	@npm install
	@cd llm-gateway-rust && cargo fetch
	@echo "✅ 依赖安装完成"

# 生产环境启动
prod: release
	@mkdir -p logs
	@echo "🚀 启动生产环境..."
	@echo "🦀 启动 Rust 后端服务 (端口 9527)..."
	@cd llm-gateway-rust && ./target/release/llm-gateway-rust >> ../logs/rust-prod.log 2>&1 &
	@sleep 2
	@echo "🌐 启动 Next.js 生产服务 (端口 3000)..."
	@npm start >> logs/next-prod.log 2>&1 &
	@sleep 3
	@echo ""
	@echo "✅ 生产环境启动完成!"
	@echo "📱 前端界面: http://localhost:3000"
	@echo "🔧 后端API: http://localhost:9527"
	@echo "📋 健康检查: http://localhost:9527/health"
	@echo ""
	@echo "📜 查看日志: tail -f logs/rust-prod.log logs/next-prod.log"
	@echo "🛑 停止服务: make stop"

# 生产部署
deploy: release
	@echo "🚀 部署到生产环境..."
	@echo "请根据您的部署环境执行相应的部署脚本"