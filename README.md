# LLM Gateway


一个为 Claude Code 和 Gemini CLI 提供统一代理服务的智能网关工具。

## 🚀 核心功能

### 1. 用户池管理
- 支持添加和管理多个 Claude Code 账号
- 支持添加和管理多个 Gemini CLI 账号
- 账号状态监控和健康检查
- 账号配额和限制管理

### 2. API Key 管理
- 生成和管理 API 密钥
- 支持不同权限级别的 API Key
- API Key 使用统计和监控
- 自动过期和轮换机制

### 3. 智能路由与负载均衡
- 基于账号可用性的智能切换
- 负载均衡算法优化
- 故障转移和重试机制
- 请求分发策略配置

### 4. 统计与监控
- 实时使用统计
- 账号使用情况分析
- 请求成功率监控
- 性能指标追踪

## 📋 项目状态

当前项目处于初期规划阶段，正在完善项目文档和架构设计。

## 🏗️ 架构概览

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   API Gateway   │    │  Upstream Pool  │
│                 │    │                 │    │                 │
│ - Web Dashboard │◄──►│ - Authentication│◄──►│ - Claude Code   │
│ - CLI Tools     │    │ - Load Balancer │    │ - Gemini CLI    │
│ - SDK/API       │    │ - Rate Limiting │    │ - Health Check  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Data Layer    │
                       │                 │
                       │ - User Pool     │
                       │ - API Keys      │
                       │ - Statistics    │
                       │ - Configuration │
                       └─────────────────┘
```

## 🛠️ 技术栈

- **前端**: Next.js (全栈方案)
- **数据库**: SQLite (默认) / PostgreSQL (可选)
- **缓存**: Redis (可选，用于性能优化)
- **部署**: 支持 Vercel 和本地 Docker 部署
- **架构**: 简单高效的单体架构

## 📚 文档结构

- [产品需求文档](docs/PRD.md) - 产品需求和规划
- [功能规格说明](docs/SPECS.md) - 详细功能规格
- [架构设计](docs/ARCHITECTURE.md) - 系统架构和设计理念
- [部署配置](docs/DEPLOYMENT.md) - 部署方案和环境配置
- [功能特性跟踪](docs/FEATURES.md) - 功能开发进度
- [Bug 跟踪](docs/BUGS.md) - 问题跟踪和修复

## 🚦 快速开始

项目正在开发中，敬请期待...

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进项目。

## 📄 许可证

待定

---