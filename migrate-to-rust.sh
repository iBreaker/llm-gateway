#!/bin/bash

echo "🚀 迁移到纯 Rust 后端..."

# 1. 备份现有数据
echo "📦 备份现有数据..."
cd /Users/breaker/src/llm-gateway

# 导出用户数据
cat > /tmp/export_users.sql << 'EOF'
COPY (
    SELECT email, username, password_hash, 
           CASE role 
               WHEN 'USER' THEN 'USER'::user_role
               WHEN 'ADMIN' THEN 'ADMIN'::user_role
           END as role,
           is_active, created_at, updated_at
    FROM users
) TO '/tmp/users_backup.csv' WITH CSV HEADER;
EOF

# 导出上游账号数据
cat > /tmp/export_upstream.sql << 'EOF'
COPY (
    SELECT u.user_id, u.name, 
           CASE u.type
               WHEN 'ANTHROPICOAUTH' THEN 'ANTHROPIC_OAUTH'
               WHEN 'GEMINICLI' THEN 'GEMINI_CLI'
               WHEN 'ANTHROPICAPI' THEN 'ANTHROPIC_API'
               ELSE u.type::text
           END as type,
           u.email, u.credentials, u.config, u.status::text, 
           u.priority, u.weight, u.last_health_check, u.health_status,
           u.last_used_at, u.request_count, u.success_count, u.error_count,
           u.created_at, u.updated_at
    FROM upstream_accounts u
) TO '/tmp/upstream_accounts_backup.csv' WITH CSV HEADER;
EOF

echo "导出的数据将保存在 /tmp/ 目录"

# 2. 移除 Prisma 相关文件
echo "🧹 清理 Prisma 相关文件..."
rm -rf prisma/
rm -f package.json package-lock.json
rm -rf node_modules/

# 3. 更新 .gitignore
echo "📝 更新 .gitignore..."
cat > .gitignore << 'EOF'
# Rust
target/
Cargo.lock
**/*.rs.bk

# 环境变量
.env
.env.local

# 日志
*.log
logs/

# 临时文件
tmp/
temp/

# IDE
.vscode/
.idea/
*.swp
*.swo

# macOS
.DS_Store

# 备份
*.backup
*.bak
EOF

# 4. 创建新的项目说明
echo "📄 创建新的项目说明..."
cat > README.md << 'EOF'
# LLM Gateway

智能 LLM 代理网关，支持多账号管理、负载均衡和使用统计。

## 项目结构

- `llm-gateway-rust/` - Rust 后端服务
- `src/` - Next.js 前端应用

## 快速开始

### 后端服务

```bash
cd llm-gateway-rust
make db-migrate  # 运行数据库迁移
make server      # 启动后端服务
```

### 前端应用

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器
```

详细文档请查看各子目录的 README 文件。
EOF

echo "✅ 迁移准备完成！"
echo ""
echo "下一步："
echo "1. 在 llm-gateway-rust 目录运行: make db-reset"
echo "2. 导入备份的数据（如果需要）"
echo "3. 启动 Rust 服务: make server"
echo ""
echo "⚠️  注意：这将完全移除 Prisma 和 Node.js 后端依赖！"