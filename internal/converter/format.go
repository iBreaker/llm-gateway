package converter

// Format API请求/响应格式类型
type Format string

const (
	FormatOpenAI    Format = "openai"
	FormatAnthropic Format = "anthropic"
	FormatUnknown   Format = "unknown"
)

// String 实现 fmt.Stringer 接口
func (f Format) String() string {
	return string(f)
}

// IsValid 检查格式是否有效
func (f Format) IsValid() bool {
	switch f {
	case FormatOpenAI, FormatAnthropic:
		return true
	default:
		return false
	}
}

// DetectFormat 从请求体中检测格式
func DetectFormat(requestBody []byte, endpoint string) Format {
	detector := &FormatDetector{}
	return detector.Detect(requestBody, endpoint)
}