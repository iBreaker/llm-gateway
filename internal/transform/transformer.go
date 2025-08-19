package transform

import (
	"encoding/json"
	"fmt"
	"strings"

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

// DetectFormat 检测请求格式
func (t *Transformer) DetectFormat(requestBody []byte) RequestFormat {
	var data map[string]interface{}
	if err := json.Unmarshal(requestBody, &data); err != nil {
		return FormatUnknown
	}

	// 检查是否有Anthropic特有的字段
	if _, hasMessages := data["messages"]; hasMessages {
		if model, hasModel := data["model"].(string); hasModel {
			if strings.Contains(model, "claude") || strings.Contains(model, "anthropic") {
				return FormatAnthropic
			}
		}
		// 默认认为是OpenAI格式
		return FormatOpenAI
	}

	// 检查是否有旧版本的prompt字段
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
	// Anthropic可能有特殊的响应格式要求
	return json.Marshal(response)
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