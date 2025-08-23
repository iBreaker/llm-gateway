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

// formatJSON 格式化JSON用于显示
func formatJSON(data []byte) string {
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