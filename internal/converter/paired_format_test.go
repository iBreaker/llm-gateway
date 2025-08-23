package converter

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"path/filepath"
	"strings"
	"testing"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// PairTestCase 成对测试用例
type PairTestCase struct {
	Name         string
	InputFile    string
	ExpectFile   string
	SourceFormat RequestFormat
	TargetFormat RequestFormat
	DataType     string // "request" or "response"
}

// TestPairedFormatConversions 测试成对的格式转换
func TestPairedFormatConversions(t *testing.T) {
	conv := NewRequestResponseConverter()

	// 自动发现测试对
	testCases, err := discoverPairTestCases("testdata/pairs")
	if err != nil {
		t.Fatalf("发现测试用例失败: %v", err)
	}

	for _, tc := range testCases {
		t.Run(tc.Name, func(t *testing.T) {
			// 读取输入文件
			inputData, err := ioutil.ReadFile(tc.InputFile)
			if err != nil {
				t.Fatalf("读取输入文件失败: %v", err)
			}

			// 读取期望输出文件
			expectData, err := ioutil.ReadFile(tc.ExpectFile)
			if err != nil {
				t.Fatalf("读取期望文件失败: %v", err)
			}

			// 执行转换
			var actualData []byte
			if tc.DataType == "request" {
				actualData, err = executeRequestConversion(conv, inputData, tc.SourceFormat, tc.TargetFormat)
			} else if tc.DataType == "response_stream" {
				actualData, err = executeStreamResponseConversion(conv, inputData, tc.SourceFormat, tc.TargetFormat)
			} else {
				actualData, err = executeResponseConversion(conv, inputData, tc.SourceFormat, tc.TargetFormat)
			}

			if err != nil {
				t.Fatalf("转换失败: %v", err)
			}

			// 对比结果
			t.Logf("=== %s ===", tc.Name)
			t.Logf("输入 (%s):", tc.SourceFormat)
			t.Logf("%s", formatJSON(inputData))
			t.Logf("期望输出 (%s):", tc.TargetFormat)
			t.Logf("%s", formatJSON(expectData))
			t.Logf("实际输出 (%s):", tc.TargetFormat)
			t.Logf("%s", formatJSON(actualData))

			// 验证转换结果
			if err := validateConversionResult(expectData, actualData, tc); err != nil {
				t.Errorf("验证失败: %v", err)
			} else {
				t.Logf("✅ 转换成功")
			}
		})
	}
}

// discoverPairTestCases 自动发现测试对
func discoverPairTestCases(dir string) ([]PairTestCase, error) {
	// 发现JSON格式的测试文件
	jsonFiles, err := filepath.Glob(filepath.Join(dir, "*_input.json"))
	if err != nil {
		return nil, err
	}
	
	// 发现流式响应的测试文件
	streamFiles, err := filepath.Glob(filepath.Join(dir, "*_input.txt"))
	if err != nil {
		return nil, err
	}

	var testCases []PairTestCase
	
	// 处理JSON测试文件
	for _, inputFile := range jsonFiles {
		// 构造期望文件路径
		expectFile := strings.Replace(inputFile, "_input.json", "_expect.json", 1)
		
		// 解析文件名获取测试信息
		basename := filepath.Base(inputFile)
		testName, sourceFormat, targetFormat, dataType, err := parseTestFileName(basename)
		if err != nil {
			continue // 跳过无法解析的文件
		}

		testCases = append(testCases, PairTestCase{
			Name:         testName,
			InputFile:    inputFile,
			ExpectFile:   expectFile,
			SourceFormat: sourceFormat,
			TargetFormat: targetFormat,
			DataType:     dataType,
		})
	}
	
	// 处理流式响应测试文件
	for _, inputFile := range streamFiles {
		// 构造期望文件路径
		expectFile := strings.Replace(inputFile, "_input.txt", "_expect.txt", 1)
		
		// 解析文件名获取测试信息（去掉.txt扩展名）
		basename := strings.TrimSuffix(filepath.Base(inputFile), "_input.txt") + "_input.json"
		testName, sourceFormat, targetFormat, dataType, err := parseTestFileName(basename)
		if err != nil {
			continue // 跳过无法解析的文件
		}

		testCases = append(testCases, PairTestCase{
			Name:         testName + "_stream",
			InputFile:    inputFile,
			ExpectFile:   expectFile,
			SourceFormat: sourceFormat,
			TargetFormat: targetFormat,
			DataType:     dataType + "_stream", // 标记为流式
		})
	}

	return testCases, nil
}

// parseTestFileName 解析测试文件名
// 格式: {source}_to_{target}_{type}_{scenario}_input.json
func parseTestFileName(filename string) (string, RequestFormat, RequestFormat, string, error) {
	// 移除 _input.json 后缀
	name := strings.TrimSuffix(filename, "_input.json")
	parts := strings.Split(name, "_")
	
	if len(parts) < 5 {
		return "", "", "", "", fmt.Errorf("invalid filename format: %s", filename)
	}

	// 解析格式
	var sourceFormat, targetFormat RequestFormat
	var dataType string

	// 查找 "to" 的位置
	toIndex := -1
	for i, part := range parts {
		if part == "to" {
			toIndex = i
			break
		}
	}

	if toIndex == -1 {
		return "", "", "", "", fmt.Errorf("missing 'to' in filename: %s", filename)
	}

	// 解析源格式
	sourceParts := parts[:toIndex]
	source := strings.Join(sourceParts, "_")
	switch source {
	case "openai":
		sourceFormat = FormatOpenAI
	case "anthropic":
		sourceFormat = FormatAnthropic
	default:
		return "", "", "", "", fmt.Errorf("unknown source format: %s", source)
	}

	// 解析目标格式和数据类型
	remainingParts := parts[toIndex+1:]
	if len(remainingParts) < 3 {
		return "", "", "", "", fmt.Errorf("insufficient parts after 'to': %s", filename)
	}

	target := remainingParts[0]
	switch target {
	case "openai":
		targetFormat = FormatOpenAI
	case "anthropic":
		targetFormat = FormatAnthropic
	default:
		return "", "", "", "", fmt.Errorf("unknown target format: %s", target)
	}

	dataType = remainingParts[1]
	scenario := strings.Join(remainingParts[2:], "_")

	testName := fmt.Sprintf("%s_to_%s_%s_%s", source, target, dataType, scenario)
	
	return testName, sourceFormat, targetFormat, dataType, nil
}

// executeRequestConversion 执行请求转换
func executeRequestConversion(conv *RequestResponseConverter, input []byte, sourceFormat, targetFormat RequestFormat) ([]byte, error) {
	// 步骤1: 输入格式 -> 中间格式
	proxyReq, err := conv.TransformRequest(input, sourceFormat)
	if err != nil {
		return nil, fmt.Errorf("转换到中间格式失败: %w", err)
	}

	// 步骤2: 中间格式 -> 目标格式
	switch targetFormat {
	case FormatOpenAI:
		return conv.BuildOpenAIRequest(proxyReq)
	case FormatAnthropic:
		return conv.BuildAnthropicRequest(proxyReq)
	default:
		return nil, fmt.Errorf("不支持的目标格式: %s", targetFormat)
	}
}

// executeResponseConversion 执行响应转换
func executeResponseConversion(conv *RequestResponseConverter, input []byte, sourceFormat, targetFormat RequestFormat) ([]byte, error) {
	// 步骤1: 输入格式 -> 中间格式
	var proxyResp *types.ProxyResponse
	var err error

	switch sourceFormat {
	case FormatOpenAI:
		proxyResp, err = conv.parseOpenAIResponse(input)
	case FormatAnthropic:
		proxyResp, err = conv.parseAnthropicResponse(input)
	default:
		return nil, fmt.Errorf("不支持的源格式: %s", sourceFormat)
	}

	if err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	// 步骤2: 中间格式 -> 目标格式
	switch targetFormat {
	case FormatOpenAI:
		return conv.buildOpenAIResponse(proxyResp)
	case FormatAnthropic:
		return conv.buildAnthropicResponse(proxyResp)
	default:
		return nil, fmt.Errorf("不支持的目标格式: %s", targetFormat)
	}
}

// validateConversionResult 验证转换结果
func validateConversionResult(expectData, actualData []byte, tc PairTestCase) error {
	// 流式响应使用文本对比
	if tc.DataType == "response_stream" {
		return validateStreamResponse(expectData, actualData, tc)
	}
	
	// 非流式响应使用JSON对比
	var expect, actual map[string]interface{}
	
	if err := json.Unmarshal(expectData, &expect); err != nil {
		return fmt.Errorf("解析期望数据失败: %w", err)
	}
	
	if err := json.Unmarshal(actualData, &actual); err != nil {
		return fmt.Errorf("解析实际数据失败: %w", err)
	}

	// 验证关键字段
	switch tc.TargetFormat {
	case FormatAnthropic:
		if tc.DataType == "request" {
			return validateAnthropicRequestFields(expect, actual)
		} else {
			return validateAnthropicResponseFields(expect, actual)
		}
	case FormatOpenAI:
		if tc.DataType == "request" {
			return validateOpenAIRequestFields(expect, actual)
		} else {
			return validateOpenAIResponseFields(expect, actual)
		}
	}

	return nil
}

// validateAnthropicRequestFields 验证Anthropic请求字段
func validateAnthropicRequestFields(expect, actual map[string]interface{}) error {
	requiredFields := []string{"model", "messages"}
	
	for _, field := range requiredFields {
		if _, exists := actual[field]; !exists {
			return fmt.Errorf("缺少必要字段: %s", field)
		}
	}

	// 验证system字段处理
	if expectSystem, hasExpectSystem := expect["system"]; hasExpectSystem {
		if actualSystem, hasActualSystem := actual["system"]; !hasActualSystem {
			return fmt.Errorf("期望有system字段但实际没有")
		} else {
			// 简单的字符串对比验证
			if fmt.Sprintf("%v", expectSystem) != fmt.Sprintf("%v", actualSystem) {
				return fmt.Errorf("system字段不匹配: 期望=%v, 实际=%v", expectSystem, actualSystem)
			}
		}
	}

	return nil
}

// validateAnthropicResponseFields 验证Anthropic响应字段
func validateAnthropicResponseFields(expect, actual map[string]interface{}) error {
	requiredFields := []string{"id", "type", "role", "content", "model"}
	
	for _, field := range requiredFields {
		if _, exists := actual[field]; !exists {
			return fmt.Errorf("缺少必要字段: %s", field)
		}
	}

	return nil
}

// validateOpenAIRequestFields 验证OpenAI请求字段
func validateOpenAIRequestFields(expect, actual map[string]interface{}) error {
	requiredFields := []string{"model", "messages"}
	
	for _, field := range requiredFields {
		if _, exists := actual[field]; !exists {
			return fmt.Errorf("缺少必要字段: %s", field)
		}
	}

	return nil
}

// validateOpenAIResponseFields 验证OpenAI响应字段
func validateOpenAIResponseFields(expect, actual map[string]interface{}) error {
	requiredFields := []string{"id", "object", "model", "choices"}
	
	for _, field := range requiredFields {
		if _, exists := actual[field]; !exists {
			return fmt.Errorf("缺少必要字段: %s", field)
		}
	}

	return nil
}

// executeStreamResponseConversion 执行流式响应转换
func executeStreamResponseConversion(conv *RequestResponseConverter, input []byte, sourceFormat, targetFormat RequestFormat) ([]byte, error) {
	// 创建输入读取器
	inputReader := strings.NewReader(string(input))
	
	// 创建输出缓冲区
	var outputBuffer strings.Builder
	
	// 确定源提供商
	var sourceProvider types.Provider
	switch sourceFormat {
	case FormatOpenAI:
		sourceProvider = types.ProviderOpenAI
	case FormatAnthropic:
		sourceProvider = types.ProviderAnthropic
	default:
		return nil, fmt.Errorf("不支持的源格式: %s", sourceFormat)
	}
	
	// 创建流式处理器
	processor := conv.GetStreamResponseProcessor()
	
	// 处理流式响应
	err := processor.ProcessStream(inputReader, sourceProvider, targetFormat, func(event string, tokens int) {
		if event == "[DONE]" {
			outputBuffer.WriteString("data: [DONE]\n")
		} else {
			// 根据目标格式决定输出格式
			if targetFormat == FormatAnthropic {
				// Anthropic格式保持event: + data: 格式
				if !strings.Contains(event, "event: ") {
					// 如果没有event前缀，说明是转换后的data，需要确定事件类型
					outputBuffer.WriteString("event: content_block_delta\n")
					outputBuffer.WriteString("data: ")
					outputBuffer.WriteString(event)
					outputBuffer.WriteString("\n\n")
				} else {
					// 已经包含完整格式
					outputBuffer.WriteString(event)
					outputBuffer.WriteString("\n\n")
				}
			} else {
				// OpenAI格式只需要data: 
				outputBuffer.WriteString("data: ")
				outputBuffer.WriteString(event)
				outputBuffer.WriteString("\n\n")
			}
		}
	})
	
	if err != nil {
		return nil, fmt.Errorf("流式转换失败: %w", err)
	}
	
	return []byte(outputBuffer.String()), nil
}

// validateStreamResponse 验证流式响应
func validateStreamResponse(expectData, actualData []byte, tc PairTestCase) error {
	expectStr := strings.TrimSpace(string(expectData))
	actualStr := strings.TrimSpace(string(actualData))
	
	// 简化验证：检查是否包含关键的内容片段
	expectLines := strings.Split(expectStr, "\n")
	actualLines := strings.Split(actualStr, "\n")
	
	// 提取期望的文本内容
	expectedContentPieces := extractStreamContent(expectLines)
	actualContentPieces := extractStreamContent(actualLines)
	
	// 验证内容片段是否匹配
	if len(expectedContentPieces) != len(actualContentPieces) {
		return fmt.Errorf("内容片段数量不匹配: 期望=%d, 实际=%d", len(expectedContentPieces), len(actualContentPieces))
	}
	
	for i, expectedPiece := range expectedContentPieces {
		if i < len(actualContentPieces) {
			if expectedPiece != actualContentPieces[i] {
				return fmt.Errorf("内容片段不匹配[%d]: 期望='%s', 实际='%s'", i, expectedPiece, actualContentPieces[i])
			}
		}
	}
	
	// 验证格式特定的结构
	switch tc.TargetFormat {
	case FormatOpenAI:
		// 验证OpenAI格式是否包含必要的字段
		if !strings.Contains(actualStr, "data: ") {
			return fmt.Errorf("OpenAI流式响应缺少'data: '前缀")
		}
		if !strings.Contains(actualStr, "[DONE]") {
			return fmt.Errorf("OpenAI流式响应缺少'[DONE]'标记")
		}
	case FormatAnthropic:
		// 验证Anthropic格式是否包含必要的事件
		if !strings.Contains(actualStr, "event: ") {
			return fmt.Errorf("Anthropic流式响应缺少'event: '字段")
		}
		if !strings.Contains(actualStr, "message_start") && !strings.Contains(actualStr, "content_block_delta") {
			return fmt.Errorf("Anthropic流式响应缺少必要的事件类型")
		}
	}
	
	return nil
}

// extractStreamContent 从流式响应中提取文本内容片段
func extractStreamContent(lines []string) []string {
	var contentPieces []string
	
	for _, line := range lines {
		if strings.HasPrefix(line, "data: ") {
			// OpenAI格式
			data := line[6:] // 去掉"data: "前缀
			if data != "[DONE]" {
				var jsonData map[string]interface{}
				if err := json.Unmarshal([]byte(data), &jsonData); err == nil {
					if choices, ok := jsonData["choices"].([]interface{}); ok && len(choices) > 0 {
						if choice, ok := choices[0].(map[string]interface{}); ok {
							if delta, ok := choice["delta"].(map[string]interface{}); ok {
								if content, ok := delta["content"].(string); ok && content != "" {
									contentPieces = append(contentPieces, content)
								}
							}
						}
					}
				}
			}
		} else if strings.HasPrefix(line, "data: {") {
			// Anthropic格式的data行
			var jsonData map[string]interface{}
			if err := json.Unmarshal([]byte(line[6:]), &jsonData); err == nil {
				if eventType, ok := jsonData["type"].(string); ok && eventType == "content_block_delta" {
					if delta, ok := jsonData["delta"].(map[string]interface{}); ok {
						if text, ok := delta["text"].(string); ok && text != "" {
							contentPieces = append(contentPieces, text)
						}
					}
				}
			}
		}
	}
	
	return contentPieces
}

// formatJSON 格式化JSON用于显示
func formatJSON(data []byte) string {
	// 对于流式响应，不进行JSON格式化，直接返回原始文本
	if strings.Contains(string(data), "data: ") || strings.Contains(string(data), "event: ") {
		return string(data)
	}
	
	var obj interface{}
	if err := json.Unmarshal(data, &obj); err != nil {
		return string(data)
	}
	
	formatted, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return string(data)
	}
	
	return string(formatted)
}