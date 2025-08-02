# Git 工作流程指南

## 🚀 快速推送

### 方法1: 使用快速推送脚本
```bash
# 使用自定义提交信息
./scripts/quick-push.sh "修复API密钥创建问题"

# 或使用npm脚本
npm run push "添加新功能"
```

### 方法2: 手动推送
```bash
# 1. 查看修改状态
git status

# 2. 添加所有修改
git add .

# 3. 提交修改
git commit -m "描述修改内容"

# 4. 推送到远程仓库
git push
```

## 📋 推荐的提交信息格式

### 功能类型前缀
- `feat:` - 新功能
- `fix:` - 修复bug
- `docs:` - 文档更新
- `style:` - 代码格式调整
- `refactor:` - 代码重构
- `test:` - 测试相关
- `chore:` - 构建过程或辅助工具的变动

### 示例
```bash
git commit -m "feat: 添加用户认证功能"
git commit -m "fix: 修复API密钥创建失败问题"
git commit -m "docs: 更新README文档"
git commit -m "refactor: 重构数据库适配器"
```

## 🔧 代码质量检查

### 自动检查（可选）
```bash
# 运行pre-commit钩子
./scripts/pre-commit.sh
```

### 手动检查
```bash
# TypeScript类型检查
npm run typecheck

# ESLint代码风格检查
npm run lint

# 运行测试
npm run test
```

## 🚀 完整部署流程

### 开发环境
```bash
# 1. 开发
npm run dev

# 2. 快速推送
npm run push "功能描述"
```

### 生产部署
```bash
# 1. 构建并推送
npm run deploy

# 2. 或分步执行
npm run build
npm run push "生产部署"
```

## 📝 最佳实践

1. **频繁提交**: 每次修改后及时提交，避免大量代码堆积
2. **清晰的提交信息**: 使用描述性的提交信息，说明修改内容
3. **分支管理**: 重要功能开发时使用feature分支
4. **代码审查**: 推送前运行代码质量检查
5. **测试**: 确保修改不会破坏现有功能

## 🔄 Vercel自动部署

- 推送到 `main` 分支后，Vercel会自动触发部署
- 部署状态可以在Vercel Dashboard中查看
- 部署完成后可以立即测试新功能 