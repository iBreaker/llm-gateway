# LLM Gateway

[English](README.md) | [中文](README.zh-CN.md)

🚀 A high-performance, multi-provider LLM API gateway with intelligent request routing and format conversion.

## 🌟 Features

- **Multi-Provider Support**: Seamlessly integrate with Anthropic, OpenAI, Google, and Azure LLMs
- **Format Auto-Detection**: Automatically detects and converts between different API formats (OpenAI ↔ Anthropic)
- **Intelligent Load Balancing**: Health-first routing strategy with automatic failover
- **OAuth & API Key Support**: Supports both standard API keys and OAuth flows (including Claude Code integration)
- **CLI Management**: Comprehensive command-line interface for account and key management
- **High Performance**: Built-in connection pooling, concurrent request handling, and optimized streaming
- **Production Ready**: Structured logging, health checks, metrics, and robust error handling

## 🏗️ Architecture

```
Client Request (Any Format) → Format Detection → Account Selection → Request Transform → Upstream Call → Response Transform → Client Response
```

### Key Components

- **Server**: HTTP proxy server with middleware chain (Auth → Rate Limit → CORS → Logging)
- **Converter**: Bi-directional format conversion between OpenAI and Anthropic APIs
- **Router**: Intelligent upstream selection with health monitoring
- **Client Manager**: Gateway API key management and authentication  
- **Upstream Manager**: Multi-provider account management with OAuth support
- **Config Manager**: Thread-safe YAML-based configuration with auto-save

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

# Add Anthropic OAuth (Claude Code)
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
# Server starts on http://localhost:3847
```

### 5. Test with OpenAI-Compatible Request

```bash
curl -X POST http://localhost:3847/v1/chat/completions \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
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
./llm-gateway apikey disable <key-id> # Disable key
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
./llm-gateway upstream enable <id>   # Enable account
./llm-gateway upstream disable <id>  # Disable account
```

### OAuth Management

```bash
./llm-gateway oauth start <upstream-id>    # Start OAuth flow
./llm-gateway oauth status <upstream-id>   # Check OAuth status
./llm-gateway oauth refresh <upstream-id>  # Refresh tokens
```

### System Monitoring

```bash
./llm-gateway status                # Overall system status
./llm-gateway health                # Health check
```

### Environment Configuration

```bash
./llm-gateway env list              # Show environment variables
./llm-gateway env set --http-proxy=http://proxy:8080
./llm-gateway env show --name=http_proxy
./llm-gateway env unset --name=http_proxy
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
- `POST /v1/completions` - OpenAI-compatible text completions  
- `POST /v1/messages` - Anthropic-native messages endpoint

### Supported Request Formats

The gateway automatically detects and converts between:
- **OpenAI Format**: Compatible with OpenAI GPT models
- **Anthropic Format**: Native Anthropic Claude API format

### Authentication

All API requests require a Gateway API Key in the Authorization header:
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
go test ./internal/converter/...
go test ./internal/client/...
go test ./internal/upstream/...

# Integration tests
./scripts/integration-test.sh
```

## 🚦 Load Balancing & Failover

The gateway implements a health-first routing strategy:

1. **Health Monitoring**: Continuous health checks for all upstream accounts
2. **Intelligent Selection**: Routes requests to healthy accounts with best performance
3. **Automatic Failover**: Seamlessly switches to backup accounts on failures
4. **Circuit Breaking**: Temporarily excludes failing accounts to prevent cascade failures

## 🔒 Security Features

- **API Key Authentication**: Gateway-level access control
- **Request Validation**: Input sanitization and format validation
- **Rate Limiting**: Per-key request rate controls
- **Secure Storage**: Encrypted storage of sensitive credentials
- **Environment Variables**: Proxy configuration support
- **CORS Support**: Cross-origin request handling

## 📊 Monitoring & Observability

- **Structured Logging**: JSON-formatted logs with contextual information
- **Usage Statistics**: Request counts, success rates, and latency tracking
- **Health Metrics**: Account status and performance monitoring
- **Error Tracking**: Detailed error logging and categorization

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
go run cmd/main.go --help
```

### Code Style

- Follow Go conventions and `gofmt` formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Write tests for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/iBreaker/llm-gateway/issues)
- **Discussions**: [GitHub Discussions](https://github.com/iBreaker/llm-gateway/discussions)
- **Documentation**: Check the `/docs` directory for detailed documentation

## 🗺️ Roadmap

- [ ] Support for more LLM providers (Google Gemini, Azure OpenAI)
- [ ] WebUI for management and monitoring
- [ ] Prometheus metrics export
- [ ] Docker Compose deployment
- [ ] Kubernetes Helm charts
- [ ] Request caching and deduplication
- [ ] Advanced load balancing strategies
- [ ] Multi-tenant support

---

**Made with ❤️ by the LLM Gateway team**