package logger

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// LogLevel 日志级别
type LogLevel int

const (
	DebugLevel LogLevel = iota
	InfoLevel
	WarnLevel
	ErrorLevel
)

// Logger 简单日志器
type Logger struct {
	level  LogLevel
	logger *log.Logger
}

var defaultLogger *Logger

func init() {
	defaultLogger = &Logger{
		level:  InfoLevel,                 // 默认Info级别
		logger: log.New(os.Stdout, "", 0), // 不使用标准前缀，我们自己格式化
	}
}

// SetLevel 设置日志级别
func SetLevel(level LogLevel) {
	defaultLogger.level = level
}

// SetDebugLevel 设置为调试级别
func SetDebugLevel() {
	SetLevel(DebugLevel)
}

func (l *Logger) log(level LogLevel, prefix, format string, args ...interface{}) {
	if level < l.level {
		return
	}

	timestamp := time.Now().Format("15:04:05")
	message := fmt.Sprintf(format, args...)

	// 格式: [时间] [级别] 消息
	fullMessage := fmt.Sprintf("[%s] [%s] %s", timestamp, prefix, message)
	l.logger.Println(fullMessage)
}

// Debug 调试日志
func Debug(format string, args ...interface{}) {
	defaultLogger.log(DebugLevel, "DEBUG", format, args...)
}

// Info 信息日志
func Info(format string, args ...interface{}) {
	defaultLogger.log(InfoLevel, "INFO", format, args...)
}

// Warn 警告日志
func Warn(format string, args ...interface{}) {
	defaultLogger.log(WarnLevel, "WARN", format, args...)
}

// Error 错误日志
func Error(format string, args ...interface{}) {
	defaultLogger.log(ErrorLevel, "ERROR", format, args...)
}

// IsDebugEnabled 是否启用调试级别
func IsDebugEnabled() bool {
	return defaultLogger.level <= DebugLevel
}

// EnableDebugFromEnv 从环境变量启用调试模式
func EnableDebugFromEnv() {
	if debug := os.Getenv("DEBUG"); debug != "" {
		// 支持多种调试开关格式
		debug = strings.ToLower(debug)
		if debug == "true" || debug == "1" || debug == "on" || debug == "debug" {
			SetDebugLevel()
			Debug("调试模式已启用")
		}
	}
}
