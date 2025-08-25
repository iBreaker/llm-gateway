package debug

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/logger"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// DebugMode 调试模式状态
var (
	enabled bool
	mu      sync.RWMutex
	logDir  string
)

// RequestTrace 请求跟踪信息
type RequestTrace struct {
	RequestID      string         `json:"request_id"`
	Timestamp      time.Time      `json:"timestamp"`
	GatewayKeyID   string         `json:"gateway_key_id"`
	UpstreamID     string         `json:"upstream_id"`
	Provider       types.Provider `json:"provider"`
	Model          string         `json:"model"`
	ClientEndpoint string         `json:"client_endpoint"`
	UpstreamPath   string         `json:"upstream_path"`
	RequestFormat  string         `json:"request_format"`
	ResponseFormat string         `json:"response_format"`
	IsStreaming    bool           `json:"is_streaming"`

	// 原始请求
	RawClientRequest json.RawMessage `json:"raw_client_request"`

	// 中间格式请求（ProxyRequest）
	ProxyRequest *types.ProxyRequest `json:"proxy_request"`

	// 转换后的上游请求
	UpstreamRequest json.RawMessage `json:"upstream_request"`

	// 原始上游响应
	RawUpstreamResponse json.RawMessage `json:"raw_upstream_response,omitempty"`

	// 中间格式响应（ProxyResponse）
	ProxyResponse *types.ProxyResponse `json:"proxy_response,omitempty"`

	// 转换后的客户端响应
	ClientResponse json.RawMessage `json:"client_response,omitempty"`

	// 流式响应记录
	StreamChunks []StreamChunkTrace `json:"stream_chunks,omitempty"`

	// 统计信息
	TotalDuration      time.Duration `json:"total_duration"`
	UpstreamDuration   time.Duration `json:"upstream_duration"`
	ConversionDuration time.Duration `json:"conversion_duration"`

	// 错误信息
	Error   string `json:"error,omitempty"`
	ErrorAt string `json:"error_at,omitempty"`
}

// StreamChunkTrace 流式响应块跟踪
type StreamChunkTrace struct {
	Timestamp      time.Time       `json:"timestamp"`
	EventType      string          `json:"event_type"`
	RawData        json.RawMessage `json:"raw_data"`
	ConvertedData  json.RawMessage `json:"converted_data,omitempty"`
	ProcessingTime time.Duration   `json:"processing_time"`
}

// Enable 启用调试模式
func Enable() error {
	mu.Lock()
	defer mu.Unlock()

	if enabled {
		return nil
	}

	// 设置日志目录
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("获取用户家目录失败: %w", err)
	}

	logDir = filepath.Join(homeDir, ".llm-gateway", "debug")

	// 创建调试日志目录
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("创建调试日志目录失败: %w", err)
	}

	enabled = true

	// 记录调试模式启用
	fmt.Printf("🐛 Debug模式已启用，日志目录: %s\n", logDir)
	return nil
}

// Disable 禁用调试模式
func Disable() {
	mu.Lock()
	defer mu.Unlock()
	enabled = false
}

// IsEnabled 检查是否启用调试模式
func IsEnabled() bool {
	mu.RLock()
	defer mu.RUnlock()
	return enabled
}

// NewRequestTrace 创建新的请求跟踪
func NewRequestTrace(requestID string) *RequestTrace {
	if !IsEnabled() {
		return nil
	}

	return &RequestTrace{
		RequestID: requestID,
		Timestamp: time.Now(),
	}
}

// SetClientRequest 设置原始客户端请求
func (t *RequestTrace) SetClientRequest(data []byte) {
	if t == nil {
		return
	}
	t.RawClientRequest = json.RawMessage(data)
}

// SetProxyRequest 设置中间格式请求
func (t *RequestTrace) SetProxyRequest(req *types.ProxyRequest) {
	if t == nil {
		return
	}
	t.ProxyRequest = req
	if req != nil {
		t.GatewayKeyID = req.GatewayKeyID
		t.UpstreamID = req.UpstreamID
		t.Model = req.Model
		if req.Stream != nil {
			t.IsStreaming = *req.Stream
		}
	}
}

// SetUpstreamRequest 设置转换后的上游请求
func (t *RequestTrace) SetUpstreamRequest(data []byte) {
	if t == nil {
		return
	}
	t.UpstreamRequest = json.RawMessage(data)
}

// SetUpstreamResponse 设置原始上游响应
func (t *RequestTrace) SetUpstreamResponse(data []byte) {
	if t == nil {
		return
	}
	t.RawUpstreamResponse = json.RawMessage(data)
}

// SetProxyResponse 设置中间格式响应
func (t *RequestTrace) SetProxyResponse(resp *types.ProxyResponse) {
	if t == nil {
		return
	}
	t.ProxyResponse = resp
}

// SetClientResponse 设置转换后的客户端响应
func (t *RequestTrace) SetClientResponse(data []byte) {
	if t == nil {
		return
	}
	t.ClientResponse = json.RawMessage(data)
}

// AddStreamChunk 添加流式响应块
func (t *RequestTrace) AddStreamChunk(eventType string, rawData, convertedData []byte, processingTime time.Duration) {
	if t == nil {
		return
	}

	chunk := StreamChunkTrace{
		Timestamp:      time.Now(),
		EventType:      eventType,
		ProcessingTime: processingTime,
	}

	// 安全地处理原始数据 - 如果是有效JSON则直接使用，否则转换为字符串
	if len(rawData) > 0 {
		if json.Valid(rawData) {
			chunk.RawData = json.RawMessage(rawData)
		} else {
			// 将非JSON数据转换为JSON字符串
			safeData, _ := json.Marshal(string(rawData))
			chunk.RawData = json.RawMessage(safeData)
		}
	}

	// 安全地处理转换后数据
	if len(convertedData) > 0 {
		if json.Valid(convertedData) {
			chunk.ConvertedData = json.RawMessage(convertedData)
		} else {
			// 将非JSON数据转换为JSON字符串
			safeData, _ := json.Marshal(string(convertedData))
			chunk.ConvertedData = json.RawMessage(safeData)
		}
	}

	t.StreamChunks = append(t.StreamChunks, chunk)
}

// SetContextInfo 设置上下文信息
func (t *RequestTrace) SetContextInfo(provider types.Provider, clientEndpoint, upstreamPath, requestFormat, responseFormat string) {
	if t == nil {
		return
	}

	t.Provider = provider
	t.ClientEndpoint = clientEndpoint
	t.UpstreamPath = upstreamPath
	t.RequestFormat = requestFormat
	t.ResponseFormat = responseFormat
}

// SetDurations 设置耗时统计
func (t *RequestTrace) SetDurations(total, upstream, conversion time.Duration) {
	if t == nil {
		return
	}

	t.TotalDuration = total
	t.UpstreamDuration = upstream
	t.ConversionDuration = conversion
}

// SetError 设置错误信息
func (t *RequestTrace) SetError(err error, stage string) {
	if t == nil {
		return
	}

	if err != nil {
		t.Error = err.Error()
		t.ErrorAt = stage
	}
}

// Save 保存请求跟踪信息到文件
func (t *RequestTrace) Save() error {
	if t == nil || !IsEnabled() {
		return nil
	}

	mu.RLock()
	dir := logDir
	mu.RUnlock()

	// 按日期创建子目录
	dateDir := filepath.Join(dir, t.Timestamp.Format("2006-01-02"))
	if err := os.MkdirAll(dateDir, 0755); err != nil {
		return fmt.Errorf("创建日期目录失败: %w", err)
	}

	// 文件名格式: HHMMSS_microseconds_requestID.json 确保时间顺序
	filename := fmt.Sprintf("%s_%06d_%s.json",
		t.Timestamp.Format("150405"),
		t.Timestamp.Nanosecond()/1000, // 微秒精度
		t.RequestID)

	filepath := filepath.Join(dateDir, filename)

	// 序列化为JSON
	data, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化跟踪数据失败: %w", err)
	}

	// 写入文件
	if err := os.WriteFile(filepath, data, 0644); err != nil {
		return fmt.Errorf("写入调试文件失败: %w", err)
	}

	return nil
}

// SaveAsync 异步保存请求跟踪信息
func (t *RequestTrace) SaveAsync() {
	if t == nil || !IsEnabled() {
		return
	}

	go func() {
		if err := t.Save(); err != nil {
			fmt.Printf("保存调试信息失败: %v\n", err)
		}
	}()
}

// EnableFromConfig 从配置启用调试模式
func EnableFromConfig(level string, file string) error {
	// 统一使用 logger 模块的调试级别判断
	if logger.IsDebugEnabled() {
		return Enable()
	}
	return nil
}

// CleanOldLogs 清理旧的调试日志（保留最近N天）
func CleanOldLogs(keepDays int) error {
	if !IsEnabled() {
		return nil
	}

	mu.RLock()
	dir := logDir
	mu.RUnlock()

	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	cutoffTime := time.Now().AddDate(0, 0, -keepDays)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		// 解析日期目录名
		if date, err := time.Parse("2006-01-02", entry.Name()); err == nil {
			if date.Before(cutoffTime) {
				oldDir := filepath.Join(dir, entry.Name())
				if err := os.RemoveAll(oldDir); err != nil {
					fmt.Printf("删除旧调试日志目录失败 %s: %v\n", oldDir, err)
				}
			}
		}
	}

	return nil
}
