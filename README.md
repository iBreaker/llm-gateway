# LLM Gateway

[English](README.md) | [中文](README.zh-CN.md)

🚀 A high-performance LLM API gateway with intelligent format conversion and request routing.

## 🌟 Features

- **Multi-Provider Support**: Seamlessly integrate with Anthropic Claude and OpenAI-compatible providers
- **Format Auto-Conversion**: Automatically detects and converts between OpenAI and Anthropic API formats  
- **Streaming Support**: Full support for Server-Sent Events (SSE) with intelligent event ordering
- **Tool Calling**: Seamless conversion of tool/function calls between different provider formats
- **Intelligent Routing**: Health-first routing strategy with automatic failover
- **OAuth & API Key Support**: Supports both API keys and OAuth flows (including Claude Code integration)
- **CLI Management**: Comprehensive command-line interface for configuration management

## 🏗️ Architecture

```
Client Request (Any Format) → Format Detection → Unified Internal Format → Provider Selection → Provider-Specific Format → Upstream Call → Response Conversion → Client Response
```

### Key Components

- **Format Converter**: Bi-directional conversion between OpenAI and Anthropic formats with unified internal representation
- **Request Router**: Health-first upstream selection with automatic failover  
- **Configuration Manager**: Thread-safe YAML-based configuration with persistence
- **OAuth Manager**: Handles OAuth flows for providers that support them
- **Stream Processing**: Stateful per-stream conversion with intelligent event generation

## 📦 Installation

### Prerequisites

- Go 1.21 or later
- Git

### Build from Source

```bash
git clone https://github.com/iBreaker/llm-gateway.git
cd llm-gateway
go build -o llm-gateway cmd/main.go
```

### Using Docker

```bash
docker build -t llm-gateway .
docker run -p 3847:3847 -v $(pwd)/config:/app/config llm-gateway
```

## 🚀 Quick Start

### 1. Initialize Configuration

```bash
# First run creates default config at ~/.llm-gateway/config.yaml
./llm-gateway server status
```

### 2. Add Upstream Provider Account

```bash
# Add Anthropic API Key
./llm-gateway upstream add --type=api-key --provider=anthropic --name="prod-account" --key=sk-ant-xxxxx

# Add OAuth Account (Claude Code)
./llm-gateway upstream add --type=oauth --provider=anthropic --name="claude-code"
# Follow interactive OAuth flow...
```

### 3. Create Gateway API Key

```bash
./llm-gateway apikey add --name="team-api" --permissions="read,write"
# Save the generated API key securely!
```

### 4. Start the Gateway

```bash
./llm-gateway server start
# Server starts on http://localhost:3847 (default port)
```

### 5. Test API Requests

```bash
# OpenAI-compatible request (auto-converted to Anthropic if routed to Claude)
curl -X POST http://localhost:3847/v1/chat/completions \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# Native Anthropic format request
curl -X POST http://localhost:3847/v1/messages \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229", 
    "system": "You are a helpful assistant.",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# Streaming request with tool calling
curl -X POST http://localhost:3847/v1/chat/completions \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "What time is it?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_current_time",
        "description": "Get the current time"
      }
    }],
    "stream": true
  }'
```

## 📚 CLI Reference

### Server Management

```bash
./llm-gateway server start          # Start HTTP server
./llm-gateway server status         # Show server status
```

### Gateway API Key Management

```bash
./llm-gateway apikey add --name="team-a" --permissions="read,write"
./llm-gateway apikey list            # List all gateway keys
./llm-gateway apikey show <key-id>   # Show key details
./llm-gateway apikey remove <key-id> # Delete key
```

### Upstream Account Management

```bash
# API Key accounts
./llm-gateway upstream add --type=api-key --provider=anthropic --name="prod" --key=sk-ant-xxx

# OAuth accounts  
./llm-gateway upstream add --type=oauth --provider=anthropic --name="claude-code"

./llm-gateway upstream list          # List all upstream accounts
./llm-gateway upstream show <id>     # Show account details
./llm-gateway upstream remove <id>   # Delete account
```

### OAuth Management

```bash
./llm-gateway oauth start <upstream-id>    # Start OAuth flow
./llm-gateway oauth status <upstream-id>   # Check OAuth status
./llm-gateway oauth refresh <upstream-id>  # Refresh tokens
```

### System Status

```bash
./llm-gateway status                # Overall system status
./llm-gateway health                # Health check
```

### Environment Configuration

```bash
./llm-gateway env list              # Show environment variables
./llm-gateway env set --http-proxy=http://proxy:8080
./llm-gateway env show --name=http_proxy
```

## 🔧 Configuration

The gateway uses a YAML configuration file located at `~/.llm-gateway/config.yaml`:

```yaml
server:
  host: "0.0.0.0"
  port: 3847
  timeout: 30

proxy:
  request_timeout: 60
  stream_timeout: 300
  connect_timeout: 10
  tls_timeout: 10
  idle_conn_timeout: 90
  response_timeout: 30

gateway_keys:
  - id: "gw_xxxxx"
    name: "team-api"
    key_hash: "hashed_key"
    permissions: ["read", "write"]
    status: "active"
    # 可选：为此Key配置独立的模型路由（与全局路由合并，Key级别优先级更高）
    model_routes:
      default_behavior: "passthrough"
      enable_logging: true
      routes:
        - id: "key-specific-route"
          source_model: "gpt-4*"
          target_model: "gpt-4-turbo-preview"
          target_provider: "openai"
          priority: 10
          enabled: true
          description: "此Key特有的GPT-4路由规则"

# 全局模型路由配置（作为所有Key的后备规则）
model_routes:
  default_behavior: "passthrough"
  enable_logging: true
  routes:
    - id: "global-claude-route"
      source_model: "claude-*"
      target_model: "claude-3-5-sonnet-20241022"
      target_provider: "anthropic"
      priority: 20
      enabled: true
      description: "全局Claude路由规则"

upstream_accounts:
  - id: "upstream_xxxxx"
    name: "production-anthropic"
    type: "api-key"
    provider: "anthropic"
    api_key: "sk-ant-xxxxx"
    status: "active"

logging:
  level: "info"
  format: "json"

environment:
  http_proxy: ""
  https_proxy: ""
  no_proxy: "localhost,127.0.0.1,::1"
```

## 🔌 API Endpoints

### Health Check
- `GET /health` - Service health status

### LLM API Proxy
- `POST /v1/chat/completions` - OpenAI-compatible chat completions
- `POST /v1/completions` - OpenAI-compatible text completions (mapped to chat completions)  
- `POST /v1/messages` - Anthropic-native messages endpoint

### Supported Request Formats

The gateway automatically detects and converts between:

- **OpenAI Format**: Compatible with OpenAI GPT models and OpenAI-compatible providers
- **Anthropic Format**: Native Anthropic Claude API format

#### Format Conversion Features

- **Bidirectional Conversion**: Seamless conversion between OpenAI ↔ Anthropic formats
- **System Message Handling**: Proper conversion of system messages between formats  
- **Tool Calling Support**: Full conversion of tool/function calls between different formats
- **Streaming Compatibility**: Maintains streaming support across format conversions
- **Metadata Preservation**: Preserves important metadata during format conversion

### Authentication

All API requests require a Gateway API Key:
```
Authorization: Bearer your-gateway-api-key
```

## 🧪 Testing

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific test suites
go test ./internal/converter/...           # Format conversion tests
go test ./internal/upstream/...            # Upstream management tests
go test ./tests/...                        # Integration tests

# Run format consistency tests
go test ./internal/converter/ -run TestRequestConsistency
go test ./internal/converter/ -run TestSpecificFieldPreservation
```

## 🚦 Load Balancing & Routing

The gateway implements a health-first routing strategy:

1. **Health Monitoring**: Tracks the health status of all upstream accounts
2. **Intelligent Selection**: Routes requests to healthy accounts with preference for optimal performance
3. **Automatic Failover**: Switches to backup accounts when primary accounts fail
4. **Provider Matching**: Automatically selects compatible upstream providers based on request format

## 📊 Monitoring & Observability

- **Structured Logging**: JSON-formatted logs with contextual information
- **Health Tracking**: Account status monitoring and health checks
- **Debug Mode**: Detailed logging for troubleshooting format conversion and routing

## 🔧 Troubleshooting

### Common Issues

**Problem**: "Content block not found" error in streaming responses
- **Solution**: The gateway automatically generates missing `content_block_start` events for proper Anthropic format compliance

**Problem**: Tool calling not working with certain providers  
- **Solution**: The gateway handles tool calling format differences automatically during conversion

**Problem**: OAuth token expired
- **Solution**: Use `./llm-gateway oauth refresh <upstream-id>` to refresh tokens

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug ./llm-gateway server start

# Check system health
./llm-gateway health

# Verify configuration
./llm-gateway status
```

## 📁 Project Structure

```
.
├── cmd/                    # Application entry points
├── internal/               # Private application code
│   ├── app/               # Application initialization
│   ├── cli/               # CLI command implementations  
│   ├── config/            # Configuration management
│   ├── converter/         # Format conversion logic
│   ├── router/            # Request routing logic
│   ├── server/            # HTTP server and handlers
│   └── upstream/          # Upstream provider management
├── pkg/                   # Public library code
│   ├── debug/            # Debug utilities
│   ├── logger/           # Logging utilities
│   └── types/            # Shared type definitions
├── tests/                 # Integration tests
├── docs/                  # Documentation
└── scripts/               # Build and utility scripts
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
git clone https://github.com/iBreaker/llm-gateway.git
cd llm-gateway
go mod download
go run cmd/main.go server status
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/iBreaker/llm-gateway/issues)
- **Documentation**: Check the `/docs` directory for additional documentation

## 🗺️ Roadmap

- [x] ~~OpenAI ↔ Anthropic format conversion~~
- [x] ~~Streaming support with intelligent event ordering~~
- [x] ~~OAuth authentication flows~~
- [x] ~~Tool calling format conversion~~
- [ ] Support for more LLM providers (Google Gemini, Azure OpenAI)
- [ ] Web UI for management and monitoring
- [ ] Metrics and monitoring endpoints
- [ ] Advanced routing strategies
- [ ] Request caching and optimization

---

**LLM Gateway - Simplifying Multi-Provider LLM Integration**