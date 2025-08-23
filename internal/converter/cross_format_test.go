package converter

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// CrossFormatTestCase 跨格式转换测试用例
type CrossFormatTestCase struct {
	Name           string
	InputFile      string
	InputFormat    RequestFormat
	OutputFormat   RequestFormat
	ExpectedFields []string // 必须保留的关键字段
	ValidationFunc func(input, output []byte) error
}

// TestCrossFormatRequests 测试跨格式请求转换: OpenAI -> Anthropic 和 Anthropic -> OpenAI
func TestCrossFormatRequests(t *testing.T) {
	conv := NewRequestResponseConverter()

	testCases := []CrossFormatTestCase{
		{
			Name:           "OpenAI基础请求转Anthropic",
			InputFile:      "testdata/req/req_openai_basic.json",
			InputFormat:    FormatOpenAI,
			OutputFormat:   FormatAnthropic,
			ExpectedFields: []string{"model", "messages", "max_tokens"},
			ValidationFunc: validateOpenAIToAnthropicRequest,
		},
		{
			Name:           "OpenAI工具调用转Anthropic",
			InputFile:      "testdata/req/req_openai_tools_basic.json",
			InputFormat:    FormatOpenAI,
			OutputFormat:   FormatAnthropic,
			ExpectedFields: []string{"model", "messages", "tools"},
			ValidationFunc: validateOpenAIToAnthropicToolRequest,
		},
		{
			Name:           "Anthropic基础请求转OpenAI",
			InputFile:      "testdata/req/req_anthropic_basic.json",
			InputFormat:    FormatAnthropic,
			OutputFormat:   FormatOpenAI,
			ExpectedFields: []string{"model", "messages"},
			ValidationFunc: validateAnthropicToOpenAIRequest,
		},
		{
			Name:           "Anthropic工具调用转OpenAI",
			InputFile:      "testdata/req/req_anthropic_tools_basic.json",
			InputFormat:    FormatAnthropic,
			OutputFormat:   FormatOpenAI,
			ExpectedFields: []string{"model", "messages", "tools"},
			ValidationFunc: validateAnthropicToOpenAIToolRequest,
		},
		{
			Name:           "Anthropic复杂system转OpenAI",
			InputFile:      "testdata/req/req_anthropic_system_array.json",
			InputFormat:    FormatAnthropic,
			OutputFormat:   FormatOpenAI,
			ExpectedFields: []string{"model", "messages"},
			ValidationFunc: validateAnthropicSystemToOpenAI,
		},
		{
			Name:           "Anthropic cache_control转OpenAI",
			InputFile:      "testdata/req/req_anthropic_cache_control.json",
			InputFormat:    FormatAnthropic,
			OutputFormat:   FormatOpenAI,
			ExpectedFields: []string{"model", "messages", "tools"},
			ValidationFunc: validateAnthropicCacheControlToOpenAI,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.Name, func(t *testing.T) {
			// 读取输入文件
			inputData, err := os.ReadFile(tc.InputFile)
			if err != nil {
				t.Fatalf("读取输入文件失败: %v", err)
			}

			// 执行跨格式转换
			outputData, err := executeCrossFormatTransformation(conv, inputData, tc.InputFormat, tc.OutputFormat)
			if err != nil {
				t.Fatalf("跨格式转换失败: %v", err)
			}

			// 验证输出包含必要字段
			err = validateRequiredFields(outputData, tc.ExpectedFields)
			if err != nil {
				t.Errorf("字段验证失败: %v", err)
			}

			// 执行自定义验证
			if tc.ValidationFunc != nil {
				err = tc.ValidationFunc(inputData, outputData)
				if err != nil {
					t.Errorf("自定义验证失败: %v", err)
				}
			}

			t.Logf("转换成功: %s -> %s", tc.InputFormat, tc.OutputFormat)
			// 显示输出结果的前200个字符用于调试
			outputStr := string(outputData)
			if len(outputStr) > 200 {
				outputStr = outputStr[:200] + "..."
			}
			t.Logf("输出预览: %s", outputStr)
		})
	}
}

// executeCrossFormatTransformation 执行跨格式转换
func executeCrossFormatTransformation(conv *RequestResponseConverter, input []byte, inputFormat, outputFormat RequestFormat) ([]byte, error) {
	// 步骤1: 输入格式 -> 中间格式
	proxyReq, err := conv.TransformRequest(input, inputFormat)
	if err != nil {
		return nil, fmt.Errorf("输入格式转中间格式失败: %w", err)
	}

	// 步骤2: 中间格式 -> 输出格式
	var outputData []byte
	switch outputFormat {
	case FormatOpenAI:
		outputData, err = conv.BuildOpenAIRequest(proxyReq)
	case FormatAnthropic:
		outputData, err = conv.BuildAnthropicRequest(proxyReq)
	default:
		return nil, fmt.Errorf("不支持的输出格式: %s", outputFormat)
	}

	if err != nil {
		return nil, fmt.Errorf("中间格式转输出格式失败: %w", err)
	}

	return outputData, nil
}

// validateRequiredFields 验证输出包含必要字段
func validateRequiredFields(output []byte, requiredFields []string) error {
	var jsonData map[string]interface{}
	if err := json.Unmarshal(output, &jsonData); err != nil {
		return fmt.Errorf("解析输出JSON失败: %w", err)
	}

	for _, field := range requiredFields {
		if _, exists := jsonData[field]; !exists {
			return fmt.Errorf("缺少必要字段: %s", field)
		}
	}

	return nil
}

// 验证函数: OpenAI -> Anthropic 请求转换
func validateOpenAIToAnthropicRequest(input, output []byte) error {
	var openaiReq map[string]interface{}
	var anthropicReq map[string]interface{}

	if err := json.Unmarshal(input, &openaiReq); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &anthropicReq); err != nil {
		return err
	}

	// 验证system消息处理
	if messages, ok := openaiReq["messages"].([]interface{}); ok {
		hasSystemMessage := false
		for _, msg := range messages {
			if msgMap, ok := msg.(map[string]interface{}); ok {
				if msgMap["role"] == "system" {
					hasSystemMessage = true
					break
				}
			}
		}

		if hasSystemMessage {
			// OpenAI有system消息，Anthropic应该有system字段
			if _, exists := anthropicReq["system"]; !exists {
				return fmt.Errorf("OpenAI system消息未正确转换为Anthropic system字段")
			}
		}
	}

	return nil
}

// 验证函数: OpenAI -> Anthropic 工具调用转换
func validateOpenAIToAnthropicToolRequest(input, output []byte) error {
	var openaiReq map[string]interface{}
	var anthropicReq map[string]interface{}

	if err := json.Unmarshal(input, &openaiReq); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &anthropicReq); err != nil {
		return err
	}

	// 验证工具定义转换
	if openaiTools, ok := openaiReq["tools"].([]interface{}); ok && len(openaiTools) > 0 {
		if anthropicTools, ok := anthropicReq["tools"].([]interface{}); ok {
			if len(anthropicTools) != len(openaiTools) {
				return fmt.Errorf("工具数量不匹配: OpenAI %d vs Anthropic %d", len(openaiTools), len(anthropicTools))
			}

			// 验证第一个工具的结构
			if len(anthropicTools) > 0 {
				tool := anthropicTools[0].(map[string]interface{})
				if _, hasName := tool["name"]; !hasName {
					return fmt.Errorf("Anthropic工具缺少name字段")
				}
				if _, hasInputSchema := tool["input_schema"]; !hasInputSchema {
					return fmt.Errorf("Anthropic工具缺少input_schema字段")
				}
			}
		} else {
			return fmt.Errorf("OpenAI工具未正确转换为Anthropic工具")
		}
	}

	return nil
}

// 验证函数: Anthropic -> OpenAI 请求转换
func validateAnthropicToOpenAIRequest(input, output []byte) error {
	var anthropicReq map[string]interface{}
	var openaiReq map[string]interface{}

	if err := json.Unmarshal(input, &anthropicReq); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &openaiReq); err != nil {
		return err
	}

	// 验证system字段处理
	if _, hasSystem := anthropicReq["system"]; hasSystem {
		// Anthropic有system字段，OpenAI应该在messages中有system消息
		if messages, ok := openaiReq["messages"].([]interface{}); ok {
			hasSystemMessage := false
			for _, msg := range messages {
				if msgMap, ok := msg.(map[string]interface{}); ok {
					if msgMap["role"] == "system" {
						hasSystemMessage = true
						break
					}
				}
			}

			if !hasSystemMessage {
				return fmt.Errorf("Anthropic system字段未正确转换为OpenAI system消息")
			}
		}
	}

	return nil
}

// 验证函数: Anthropic -> OpenAI 工具调用转换
func validateAnthropicToOpenAIToolRequest(input, output []byte) error {
	var anthropicReq map[string]interface{}
	var openaiReq map[string]interface{}

	if err := json.Unmarshal(input, &anthropicReq); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &openaiReq); err != nil {
		return err
	}

	// 验证工具定义转换
	if anthropicTools, ok := anthropicReq["tools"].([]interface{}); ok && len(anthropicTools) > 0 {
		if openaiTools, ok := openaiReq["tools"].([]interface{}); ok {
			if len(openaiTools) != len(anthropicTools) {
				return fmt.Errorf("工具数量不匹配: Anthropic %d vs OpenAI %d", len(anthropicTools), len(openaiTools))
			}

			// 验证第一个工具的结构
			if len(openaiTools) > 0 {
				tool := openaiTools[0].(map[string]interface{})
				if tool["type"] != "function" {
					return fmt.Errorf("OpenAI工具type应为function")
				}

				if function, ok := tool["function"].(map[string]interface{}); ok {
					if _, hasName := function["name"]; !hasName {
						return fmt.Errorf("OpenAI工具function缺少name字段")
					}
					if _, hasParams := function["parameters"]; !hasParams {
						return fmt.Errorf("OpenAI工具function缺少parameters字段")
					}
				} else {
					return fmt.Errorf("OpenAI工具缺少function字段")
				}
			}
		} else {
			return fmt.Errorf("Anthropic工具未正确转换为OpenAI工具")
		}
	}

	return nil
}

// 验证函数: Anthropic复杂system -> OpenAI转换
func validateAnthropicSystemToOpenAI(input, output []byte) error {
	var anthropicReq map[string]interface{}
	var openaiReq map[string]interface{}

	if err := json.Unmarshal(input, &anthropicReq); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &openaiReq); err != nil {
		return err
	}

	// 检查复杂system字段处理
	if system, hasSystem := anthropicReq["system"]; hasSystem {
		if systemArray, ok := system.([]interface{}); ok && len(systemArray) > 1 {
			// Anthropic有多个system块，OpenAI应该合并为一个system消息
			if messages, ok := openaiReq["messages"].([]interface{}); ok {
				systemMsgCount := 0
				for _, msg := range messages {
					if msgMap, ok := msg.(map[string]interface{}); ok {
						if msgMap["role"] == "system" {
							systemMsgCount++
						}
					}
				}

				if systemMsgCount != 1 {
					return fmt.Errorf("Anthropic多个system块未正确合并为单个OpenAI system消息，实际数量: %d", systemMsgCount)
				}
			}
		}
	}

	return nil
}

// 验证函数: Anthropic cache_control -> OpenAI转换
func validateAnthropicCacheControlToOpenAI(input, output []byte) error {
	var anthropicReq map[string]interface{}
	var openaiReq map[string]interface{}

	if err := json.Unmarshal(input, &anthropicReq); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &openaiReq); err != nil {
		return err
	}

	// cache_control是Anthropic特有的，转换到OpenAI时应该被忽略但不影响核心功能
	// 验证基本结构完整性
	if _, hasMessages := openaiReq["messages"]; !hasMessages {
		return fmt.Errorf("转换后缺少messages字段")
	}

	// 验证content数组正确处理
	if messages, ok := openaiReq["messages"].([]interface{}); ok {
		for _, msg := range messages {
			if msgMap, ok := msg.(map[string]interface{}); ok {
				if content, hasContent := msgMap["content"]; hasContent {
					// 如果content是数组，应该正确处理
					if contentArray, isArray := content.([]interface{}); isArray {
						for _, contentItem := range contentArray {
							if itemMap, ok := contentItem.(map[string]interface{}); ok {
								// cache_control字段应该被移除
								if _, hasCacheControl := itemMap["cache_control"]; hasCacheControl {
									return fmt.Errorf("cache_control字段未被正确移除")
								}
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// TestCrossFormatResponses 测试跨格式响应转换
func TestCrossFormatResponses(t *testing.T) {
	conv := NewRequestResponseConverter()

	testCases := []CrossFormatTestCase{
		{
			Name:           "OpenAI响应转Anthropic",
			InputFile:      "testdata/rsp/rsp_openai_basic.json",
			InputFormat:    FormatOpenAI,
			OutputFormat:   FormatAnthropic,
			ExpectedFields: []string{"id", "type", "role", "content", "model"},
			ValidationFunc: validateOpenAIToAnthropicResponse,
		},
		{
			Name:           "OpenAI工具调用响应转Anthropic",
			InputFile:      "testdata/rsp/rsp_openai_tool_call.json",
			InputFormat:    FormatOpenAI,
			OutputFormat:   FormatAnthropic,
			ExpectedFields: []string{"id", "type", "role", "content", "model"},
			ValidationFunc: validateOpenAIToolCallToAnthropicResponse,
		},
		{
			Name:           "Anthropic响应转OpenAI",
			InputFile:      "testdata/rsp/rsp_anthropic_basic.json",
			InputFormat:    FormatAnthropic,
			OutputFormat:   FormatOpenAI,
			ExpectedFields: []string{"id", "object", "created", "model", "choices"},
			ValidationFunc: validateAnthropicToOpenAIResponse,
		},
		{
			Name:           "Anthropic工具使用响应转OpenAI",
			InputFile:      "testdata/rsp/rsp_anthropic_tool_use.json",
			InputFormat:    FormatAnthropic,
			OutputFormat:   FormatOpenAI,
			ExpectedFields: []string{"id", "object", "created", "model", "choices"},
			ValidationFunc: validateAnthropicToolUseToOpenAIResponse,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.Name, func(t *testing.T) {
			// 读取输入文件
			inputData, err := os.ReadFile(tc.InputFile)
			if err != nil {
				t.Fatalf("读取输入文件失败: %v", err)
			}

			// 执行跨格式响应转换
			outputData, err := executeCrossFormatResponseTransformation(conv, inputData, tc.InputFormat, tc.OutputFormat)
			if err != nil {
				t.Fatalf("跨格式响应转换失败: %v", err)
			}

			// 验证输出包含必要字段
			err = validateRequiredFields(outputData, tc.ExpectedFields)
			if err != nil {
				t.Errorf("字段验证失败: %v", err)
			}

			// 执行自定义验证
			if tc.ValidationFunc != nil {
				err = tc.ValidationFunc(inputData, outputData)
				if err != nil {
					t.Errorf("自定义验证失败: %v", err)
				}
			}

			t.Logf("响应转换成功: %s -> %s", tc.InputFormat, tc.OutputFormat)
		})
	}
}

// executeCrossFormatResponseTransformation 执行跨格式响应转换
func executeCrossFormatResponseTransformation(conv *RequestResponseConverter, input []byte, inputFormat, outputFormat RequestFormat) ([]byte, error) {
	// 步骤1: 输入格式 -> 中间格式
	var proxyResp *types.ProxyResponse
	var err error

	switch inputFormat {
	case FormatOpenAI:
		proxyResp, err = conv.parseOpenAIResponse(input)
	case FormatAnthropic:
		proxyResp, err = conv.parseAnthropicResponse(input)
	default:
		return nil, fmt.Errorf("不支持的输入格式: %s", inputFormat)
	}

	if err != nil {
		return nil, fmt.Errorf("解析输入响应失败: %w", err)
	}

	// 步骤2: 中间格式 -> 输出格式
	var outputData []byte
	switch outputFormat {
	case FormatOpenAI:
		outputData, err = conv.buildOpenAIResponse(proxyResp)
	case FormatAnthropic:
		outputData, err = conv.buildAnthropicResponse(proxyResp)
	default:
		return nil, fmt.Errorf("不支持的输出格式: %s", outputFormat)
	}

	if err != nil {
		return nil, fmt.Errorf("构建输出响应失败: %w", err)
	}

	return outputData, nil
}

// 响应转换验证函数
func validateOpenAIToAnthropicResponse(input, output []byte) error {
	var openaiResp map[string]interface{}
	var anthropicResp map[string]interface{}

	if err := json.Unmarshal(input, &openaiResp); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &anthropicResp); err != nil {
		return err
	}

	// 验证基本字段映射
	if openaiResp["id"] != anthropicResp["id"] {
		return fmt.Errorf("ID字段未正确映射")
	}

	// 验证content结构
	if anthropicResp["type"] != "message" {
		return fmt.Errorf("Anthropic响应type应为message")
	}

	if anthropicResp["role"] != "assistant" {
		return fmt.Errorf("Anthropic响应role应为assistant")
	}

	return nil
}

func validateOpenAIToolCallToAnthropicResponse(input, output []byte) error {
	var openaiResp map[string]interface{}
	var anthropicResp map[string]interface{}

	if err := json.Unmarshal(input, &openaiResp); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &anthropicResp); err != nil {
		return err
	}

	// 验证tool_calls转换为tool_use
	if content, ok := anthropicResp["content"].([]interface{}); ok {
		hasToolUse := false
		for _, block := range content {
			if blockMap, ok := block.(map[string]interface{}); ok {
				if blockMap["type"] == "tool_use" {
					hasToolUse = true
					break
				}
			}
		}

		if !hasToolUse {
			return fmt.Errorf("OpenAI tool_calls未正确转换为Anthropic tool_use")
		}
	}

	return nil
}

func validateAnthropicToOpenAIResponse(input, output []byte) error {
	var anthropicResp map[string]interface{}
	var openaiResp map[string]interface{}

	if err := json.Unmarshal(input, &anthropicResp); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &openaiResp); err != nil {
		return err
	}

	// 验证基本结构
	if openaiResp["object"] != "chat.completion" {
		return fmt.Errorf("OpenAI响应object应为chat.completion")
	}

	// 验证choices结构
	if choices, ok := openaiResp["choices"].([]interface{}); ok && len(choices) > 0 {
		choice := choices[0].(map[string]interface{})
		if message, ok := choice["message"].(map[string]interface{}); ok {
			if message["role"] != "assistant" {
				return fmt.Errorf("OpenAI响应message role应为assistant")
			}
		}
	} else {
		return fmt.Errorf("OpenAI响应缺少choices结构")
	}

	return nil
}

func validateAnthropicToolUseToOpenAIResponse(input, output []byte) error {
	var anthropicResp map[string]interface{}
	var openaiResp map[string]interface{}

	if err := json.Unmarshal(input, &anthropicResp); err != nil {
		return err
	}
	if err := json.Unmarshal(output, &openaiResp); err != nil {
		return err
	}

	// 验证tool_use转换为tool_calls
	if choices, ok := openaiResp["choices"].([]interface{}); ok && len(choices) > 0 {
		choice := choices[0].(map[string]interface{})
		if message, ok := choice["message"].(map[string]interface{}); ok {
			if toolCalls, ok := message["tool_calls"].([]interface{}); ok && len(toolCalls) > 0 {
				// 验证tool_calls结构
				toolCall := toolCalls[0].(map[string]interface{})
				if toolCall["type"] != "function" {
					return fmt.Errorf("OpenAI tool_calls type应为function")
				}

				if _, hasFunction := toolCall["function"]; !hasFunction {
					return fmt.Errorf("OpenAI tool_calls缺少function字段")
				}
			} else {
				return fmt.Errorf("Anthropic tool_use未正确转换为OpenAI tool_calls")
			}
		}
	}

	return nil
}
