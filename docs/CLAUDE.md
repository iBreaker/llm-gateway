# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Gateway is a high-performance proxy service for Anthropic's LLM APIs, designed for team usage with simplified architecture. The project is a complete rewrite focusing on two specific account types: Anthropic API Key and Anthropic OAuth (Claude Code).

## Architecture

### Core Components
- **API Proxy Server** - HTTP server handling multi-format requests (OpenAI, Anthropic)
- **Account Manager** - Manages two types: API Key and OAuth accounts
- **Load Balancer** - Distributes requests across available accounts
- **OAuth Manager** - Handles complete OAuth flow for Claude Code accounts
- **Format Adapter** - Auto-detects and converts between API formats

### Key Data Flow
```
Client Request (any format) → Format Detection → Account Selection → Request Transform → Upstream Call → Response Transform → Client Response
```

## Development Commands

### Build and Run
```bash
go build -o llm-gateway .
./llm-gateway server
```

### Account Management
```bash
# API Key accounts
./llm-gateway add-api-key --key=sk-ant-xxx --name="Production Account"
./llm-gateway list-accounts

# OAuth accounts (Claude Code)
./llm-gateway add-oauth --client-id=xxx --client-secret=xxx --name="Claude Code Team"
./llm-gateway oauth-start --account-id=xxx
./llm-gateway oauth-callback --code=xxx --account-id=xxx

# Status monitoring
./llm-gateway status
./llm-gateway health-check
```

## Critical Implementation Details

### Anthropic OAuth Special Handling
- **System Prompt Injection**: OAuth accounts MUST inject "你是 Claude Code，Anthropic的官方CLI工具" as system message
- **Token Management**: Automatic refresh of access tokens before expiration
- **Authentication Flow**: Complete OAuth 2.0 flow implementation required

### Account Types
1. **API Key**: Standard authentication with `sk-ant-` prefixed keys
2. **OAuth**: Claude Code specific with client credentials and token management

### Configuration Structure
- **YAML-based**: All configuration in config.yaml
- **Account Storage**: Encrypted sensitive data in configuration
- **Runtime State**: In-memory caching for performance

### Error Handling
- **Upstream Failures**: Automatic failover between accounts
- **Token Expiry**: Transparent token refresh for OAuth accounts
- **Format Errors**: Graceful handling of unsupported request formats

## Design Principles

### Simplicity Focus
- **Single Binary**: Server and CLI management in one executable
- **Minimal Dependencies**: Pure Go with standard library focus
- **Configuration-Driven**: Account management through config files
- **Stateless Design**: Supports horizontal scaling

### Performance Requirements
- **High Concurrency**: Designed for team usage with many concurrent requests
- **Connection Pooling**: HTTP client reuse for upstream connections
- **Memory-First**: Hot data cached in memory for speed

### Extensibility
- **Plugin Architecture**: Each account type has independent processor
- **Format Adapters**: Pluggable request/response format converters
- **Future Providers**: Architecture ready for additional LLM providers

## Directory Structure

```
llm-gateway/
├── cmd/
│   └── main.go          # 程序入口
├── internal/
│   ├── server/
│   │   └── server.go    # HTTP服务器
│   ├── proxy/
│   │   ├── proxy.go     # 代理核心
│   │   └── format.go    # 格式转换
│   ├── account/
│   │   ├── manager.go   # 账号管理
│   │   └── oauth.go     # OAuth处理
│   └── config/
│       └── config.go    # 配置管理
├── pkg/
│   └── types/
│       └── types.go     # 公共类型
├── configs/
│   └── config.yaml      # 配置文件
├── go.mod
├── go.sum
└── docs/               # 文档目录
    ├── CLAUDE.md
    ├── requirements.md
    └── data_structures.md
```

## File Responsibilities

### Core Application
- **cmd/main.go** - CLI command parsing and application entry point
- **internal/server/server.go** - HTTP routing, middleware, server lifecycle

### Business Logic
- **internal/proxy/proxy.go** - Core proxy logic, upstream API calls, request routing
- **internal/proxy/format.go** - Request/response format detection and conversion
- **internal/account/manager.go** - Account CRUD operations, state management, persistence
- **internal/account/oauth.go** - OAuth 2.0 flow, token refresh, authentication

### Infrastructure
- **internal/config/config.go** - Configuration loading, environment variable handling
- **pkg/types/types.go** - Shared data structures and type definitions