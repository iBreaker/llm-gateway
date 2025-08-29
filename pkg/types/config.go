package types

// Config - 全局配置
type Config struct {
	Server           ServerConfig      `yaml:"server"`
	Proxy            ProxyConfig       `yaml:"proxy"`
	GatewayKeys      []GatewayAPIKey   `yaml:"gateway_keys"`
	UpstreamAccounts []UpstreamAccount `yaml:"upstream_accounts"`
	ModelRoutes      ModelRouteConfig  `yaml:"model_routes"`
	Logging          LoggingConfig     `yaml:"logging"`
	Environment      EnvironmentConfig `yaml:"environment"`
}

// ServerConfig - 服务器配置
type ServerConfig struct {
	Host    string `yaml:"host"`
	Port    int    `yaml:"port"`
	Timeout int    `yaml:"timeout_seconds"`
}

// ProxyConfig - 代理配置
type ProxyConfig struct {
	RequestTimeout  int `yaml:"request_timeout_seconds"`   // 普通请求超时
	StreamTimeout   int `yaml:"stream_timeout_seconds"`    // 流式请求超时
	ConnectTimeout  int `yaml:"connect_timeout_seconds"`   // 连接超时
	TLSTimeout      int `yaml:"tls_timeout_seconds"`       // TLS握手超时
	IdleConnTimeout int `yaml:"idle_conn_timeout_seconds"` // 空闲连接超时
	ResponseTimeout int `yaml:"response_timeout_seconds"`  // 响应头超时
}

// LoggingConfig - 日志配置
type LoggingConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
	File   string `yaml:"file"`
}

// EnvironmentConfig - 环境变量配置
type EnvironmentConfig struct {
	HTTPProxy  string `yaml:"http_proxy"`
	HTTPSProxy string `yaml:"https_proxy"`
	NoProxy    string `yaml:"no_proxy"`
}
