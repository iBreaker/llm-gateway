package transform

import (
	"encoding/json"
	"fmt"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// RequestFormat API请求格式类型
type RequestFormat string

const (
	FormatOpenAI    RequestFormat = "openai"
	FormatAnthropic RequestFormat = "anthropic"
	FormatUnknown   RequestFormat = "unknown"
)

// Transformer 请求响应转换器
type Transformer struct{}

// NewTransformer 创建新的转换器
func NewTransformer() *Transformer {
	return &Transformer{}
}

// DetectFormat 检测请求格式 - 基于请求结构而非模型名称
func (t *Transformer) DetectFormat(requestBody []byte) RequestFormat {
	return t.DetectFormatWithEndpoint(requestBody, "")
}

// DetectFormatWithEndpoint 基于请求结构和端点检测格式
func (t *Transformer) DetectFormatWithEndpoint(requestBody []byte, endpoint string) RequestFormat {
	var data map[string]interface{}
	if err := json.Unmarshal(requestBody, &data); err != nil {
		return FormatUnknown
	}

	// 检查Anthropic特有字段
	if _, hasSystem := data["system"]; hasSystem {
		// system字段是Anthropic格式的特征
		return FormatAnthropic
	}

	// 基于端点路径判断
	if endpoint == "/v1/messages" {
		// Anthropic的原生端点
		return FormatAnthropic
	}
	if endpoint == "/v1/chat/completions" {
		// OpenAI的标准端点
		return FormatOpenAI
	}

	// 检查是否有messages字段（两种格式都支持）
	if _, hasMessages := data["messages"]; hasMessages {
		// 默认认为是OpenAI格式，除非有其他Anthropic特征
		return FormatOpenAI
	}

	// 检查是否有旧版本的prompt字段（OpenAI遗留格式）
	if _, hasPrompt := data["prompt"]; hasPrompt {
		return FormatOpenAI
	}

	return FormatUnknown
}

// TransformRequest 转换请求到统一格式
func (t *Transformer) TransformRequest(requestBody []byte, format RequestFormat) (*types.ProxyRequest, error) {
	switch format {
	case FormatOpenAI:
		return t.transformOpenAIRequest(requestBody)
	case FormatAnthropic:
		return t.transformAnthropicRequest(requestBody)
	default:
		return nil, fmt.Errorf("不支持的请求格式: %s", format)
	}
}

// TransformResponse 转换响应到客户端格式
func (t *Transformer) TransformResponse(response *types.ProxyResponse, targetFormat RequestFormat) ([]byte, error) {
	switch targetFormat {
	case FormatOpenAI:
		return t.transformToOpenAIResponse(response)
	case FormatAnthropic:
		return t.transformToAnthropicResponse(response)
	default:
		return nil, fmt.Errorf("不支持的响应格式: %s", targetFormat)
	}
}

// transformOpenAIRequest 转换OpenAI格式请求
func (t *Transformer) transformOpenAIRequest(requestBody []byte) (*types.ProxyRequest, error) {
	var openaiReq struct {
		Model       string              `json:"model"`
		Messages    []types.Message     `json:"messages"`
		MaxTokens   int                 `json:"max_tokens,omitempty"`
		Temperature float64             `json:"temperature,omitempty"`
		Stream      bool                `json:"stream,omitempty"`
	}

	if err := json.Unmarshal(requestBody, &openaiReq); err != nil {
		return nil, fmt.Errorf("解析OpenAI请求失败: %w", err)
	}

	return &types.ProxyRequest{
		Model:          openaiReq.Model,
		Messages:       openaiReq.Messages,
		MaxTokens:      openaiReq.MaxTokens,
		Temperature:    openaiReq.Temperature,
		Stream:         openaiReq.Stream,
		OriginalFormat: string(FormatOpenAI),
	}, nil
}

// transformAnthropicRequest 转换Anthropic格式请求
func (t *Transformer) transformAnthropicRequest(requestBody []byte) (*types.ProxyRequest, error) {
	var anthropicReq struct {
		Model       string              `json:"model"`
		Messages    []types.Message     `json:"messages"`
		MaxTokens   int                 `json:"max_tokens,omitempty"`
		Temperature float64             `json:"temperature,omitempty"`
		Stream      bool                `json:"stream,omitempty"`
	}

	if err := json.Unmarshal(requestBody, &anthropicReq); err != nil {
		return nil, fmt.Errorf("解析Anthropic请求失败: %w", err)
	}

	return &types.ProxyRequest{
		Model:          anthropicReq.Model,
		Messages:       anthropicReq.Messages,
		MaxTokens:      anthropicReq.MaxTokens,
		Temperature:    anthropicReq.Temperature,
		Stream:         anthropicReq.Stream,
		OriginalFormat: string(FormatAnthropic),
	}, nil
}

// transformToOpenAIResponse 转换到OpenAI格式响应
func (t *Transformer) transformToOpenAIResponse(response *types.ProxyResponse) ([]byte, error) {
	return json.Marshal(response)
}

// transformToAnthropicResponse 转换到Anthropic格式响应
func (t *Transformer) transformToAnthropicResponse(response *types.ProxyResponse) ([]byte, error) {
	// 构建真正的Anthropic响应格式
	anthropicResp := map[string]interface{}{
		"id":   response.ID,
		"type": "message",
		"role": "assistant",
		"model": response.Model,
		"content": []map[string]interface{}{
			{
				"type": "text",
				"text": "", // 从choices中提取
			},
		},
		"stop_reason": "end_turn",
		"stop_sequence": nil,
		"usage": map[string]interface{}{
			"input_tokens":  response.Usage.PromptTokens,
			"output_tokens": response.Usage.CompletionTokens,
		},
	}
	
	// 提取消息内容
	if len(response.Choices) > 0 && response.Choices[0].Message.Content != "" {
		anthropicResp["content"] = []map[string]interface{}{
			{
				"type": "text", 
				"text": response.Choices[0].Message.Content,
			},
		}
		
		// 转换结束原因
		switch response.Choices[0].FinishReason {
		case "stop":
			anthropicResp["stop_reason"] = "end_turn"
		case "length":
			anthropicResp["stop_reason"] = "max_tokens"
		default:
			anthropicResp["stop_reason"] = "end_turn"
		}
	}
	
	return json.Marshal(anthropicResp)
}

// TransformToAnthropicRequest 转换内部格式到Anthropic格式
func (t *Transformer) TransformToAnthropicRequest(request *types.ProxyRequest) ([]byte, error) {
	anthropicReq := map[string]interface{}{
		"model":     request.Model,
		"messages":  request.Messages,
		"max_tokens": request.MaxTokens,
	}
	
	if request.Temperature != 0 {
		anthropicReq["temperature"] = request.Temperature
	}
	
	if request.Stream {
		anthropicReq["stream"] = request.Stream
	}
	
	return json.Marshal(anthropicReq)
}

// TransformToOpenAIRequest 转换内部格式到OpenAI格式
func (t *Transformer) TransformToOpenAIRequest(request *types.ProxyRequest) ([]byte, error) {
	openaiReq := map[string]interface{}{
		"model":    request.Model,
		"messages": request.Messages,
	}
	
	if request.MaxTokens > 0 {
		openaiReq["max_tokens"] = request.MaxTokens
	}
	
	if request.Temperature != 0 {
		openaiReq["temperature"] = request.Temperature
	}
	
	if request.Stream {
		openaiReq["stream"] = request.Stream
	}
	
	return json.Marshal(openaiReq)
}

// InjectSystemPrompt 注入系统提示词
func (t *Transformer) InjectSystemPrompt(request *types.ProxyRequest, provider types.Provider, upstreamType types.UpstreamType) {
	// 对Anthropic OAuth账号注入Claude Code系统提示词
	if provider == types.ProviderAnthropic && upstreamType == types.UpstreamTypeOAuth {
		systemPrompt := "你是 Claude Code，Anthropic的官方CLI工具"
		
		// 检查是否已有system消息
		hasSystem := false
		for i, msg := range request.Messages {
			if msg.Role == "system" {
				// 合并系统提示词
				request.Messages[i].Content = systemPrompt + "\n\n" + msg.Content
				hasSystem = true
				break
			}
		}
		
		// 如果没有system消息，添加一个
		if !hasSystem {
			systemMsg := types.Message{
				Role:    "system",
				Content: systemPrompt,
			}
			request.Messages = append([]types.Message{systemMsg}, request.Messages...)
		}
	}
}