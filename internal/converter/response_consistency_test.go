package converter

import (
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"testing"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// TestResponseConsistency 测试响应的一致性：原始 -> 中间格式 -> 原始
func TestResponseConsistency(t *testing.T) {
	conv := NewRequestResponseConverter()
	
	// 读取所有响应测试文件
	rspFiles, err := filepath.Glob("testdata/rsp/rsp_*.json")
	if err != nil {
		t.Fatalf("读取响应测试文件失败: %v", err)
	}
	
	if len(rspFiles) == 0 {
		t.Skip("未找到响应测试文件")
	}
	
	for _, rspFile := range rspFiles {
		filename := filepath.Base(rspFile)
		t.Run(filename, func(t *testing.T) {
			// 读取原始响应
			originalData, err := ioutil.ReadFile(rspFile)
			if err != nil {
				t.Fatalf("读取文件失败: %v", err)
			}
			
			// 根据文件名确定格式
			var provider types.Provider
			var targetFormat RequestFormat
			filename := filepath.Base(rspFile)
			if len(filename) > 4 && filename[:4] == "rsp_" {
				if len(filename) > 13 && filename[4:13] == "anthropic" {
					provider = types.ProviderAnthropic
					targetFormat = FormatAnthropic
				} else if len(filename) > 10 && filename[4:10] == "openai" {
					provider = types.ProviderOpenAI
					targetFormat = FormatOpenAI
				}
			}
			
			if provider == "" {
				t.Fatalf("无法确定响应格式: %s", filename)
			}
			
			t.Logf("检测到格式: %s, 提供商: %s", targetFormat, provider)
			
			// 步骤1: 原始响应 -> 中间格式 (ProxyResponse)
			var proxyResp *types.ProxyResponse
			switch provider {
			case types.ProviderAnthropic:
				proxyResp, err = conv.parseAnthropicResponse(originalData)
			case types.ProviderOpenAI:
				proxyResp, err = conv.parseOpenAIResponse(originalData)
			default:
				t.Fatalf("不支持的提供商: %s", provider)
			}
			
			if err != nil {
				t.Fatalf("解析响应失败: %v", err)
			}
			
			// 步骤2: 中间格式 -> 原始格式
			rebuiltData, err := conv.TransformResponse(proxyResp, targetFormat)
			if err != nil {
				t.Fatalf("重建响应失败: %v", err)
			}
			
			// 步骤3: 比较一致性
			if !isJSONEqual(t, originalData, rebuiltData, filename) {
				t.Errorf("响应不一致")
				t.Logf("原始: %s", string(originalData))
				t.Logf("重建: %s", string(rebuiltData))
			}
		})
	}
}

// TestSpecificResponseFieldPreservation 测试响应特定字段保留
func TestSpecificResponseFieldPreservation(t *testing.T) {
	conv := NewRequestResponseConverter()
	
	testCases := []struct {
		name     string
		filename string
		checks   []func(t *testing.T, original, rebuilt []byte)
	}{
		{
			name:     "Anthropic基础响应",
			filename: "testdata/rsp/rsp_anthropic_basic.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkResponseBasicFields,
				checkAnthropicResponseSpecificFields,
			},
		},
		{
			name:     "Anthropic工具使用响应",
			filename: "testdata/rsp/rsp_anthropic_tool_use.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkResponseBasicFields,
				checkAnthropicToolUseFields,
			},
		},
		{
			name:     "Anthropic多工具响应",
			filename: "testdata/rsp/rsp_anthropic_multiple_tools.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkResponseBasicFields,
				checkAnthropicMultipleToolsFields,
			},
		},
		{
			name:     "OpenAI基础响应",
			filename: "testdata/rsp/rsp_openai_basic.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkResponseBasicFields,
				checkOpenAIResponseSpecificFields,
			},
		},
		{
			name:     "OpenAI工具调用响应",
			filename: "testdata/rsp/rsp_openai_tool_call.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkResponseBasicFields,
				checkOpenAIToolCallFields,
			},
		},
		{
			name:     "OpenAI多工具调用响应",
			filename: "testdata/rsp/rsp_openai_multiple_tool_calls.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkResponseBasicFields,
				checkOpenAIMultipleToolCallsFields,
			},
		},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// 读取测试文件
			originalData, err := ioutil.ReadFile(tc.filename)
			if err != nil {
				t.Fatalf("读取文件失败: %v", err)
			}
			
			// 确定格式和提供商
			var provider types.Provider
			var targetFormat RequestFormat
			if filepath.Base(tc.filename)[4:12] == "anthropic" {
				provider = types.ProviderAnthropic
				targetFormat = FormatAnthropic
			} else if filepath.Base(tc.filename)[4:10] == "openai" {
				provider = types.ProviderOpenAI
				targetFormat = FormatOpenAI
			}
			
			// 解析和重建
			var proxyResp *types.ProxyResponse
			switch provider {
			case types.ProviderAnthropic:
				proxyResp, err = conv.parseAnthropicResponse(originalData)
			case types.ProviderOpenAI:
				proxyResp, err = conv.parseOpenAIResponse(originalData)
			}
			
			if err != nil {
				t.Fatalf("解析响应失败: %v", err)
			}
			
			rebuiltData, err := conv.TransformResponse(proxyResp, targetFormat)
			if err != nil {
				t.Fatalf("重建响应失败: %v", err)
			}
			
			// 执行所有检查
			for _, check := range tc.checks {
				check(t, originalData, rebuiltData)
			}
		})
	}
}

// 检查响应基础字段
func checkResponseBasicFields(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	json.Unmarshal(original, &origObj)
	json.Unmarshal(rebuilt, &rebuiltObj)
	
	basicFields := []string{"id", "model"}
	
	for _, field := range basicFields {
		origValue, origExists := origObj[field]
		rebuiltValue, rebuiltExists := rebuiltObj[field]
		
		if origExists != rebuiltExists {
			t.Errorf("%s字段存在性不一致: 原始=%v, 重建=%v", field, origExists, rebuiltExists)
			continue
		}
		
		if origExists && !deepEqual(origValue, rebuiltValue) {
			t.Errorf("%s字段值不一致: 原始=%v, 重建=%v", field, origValue, rebuiltValue)
		}
	}
}

// 检查Anthropic响应特定字段
func checkAnthropicResponseSpecificFields(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	json.Unmarshal(original, &origObj)
	json.Unmarshal(rebuilt, &rebuiltObj)
	
	anthropicFields := []string{"type", "role", "stop_reason", "stop_sequence", "usage"}
	
	for _, field := range anthropicFields {
		origValue, origExists := origObj[field]
		rebuiltValue, rebuiltExists := rebuiltObj[field]
		
		if origExists != rebuiltExists {
			t.Errorf("Anthropic %s字段存在性不一致: 原始=%v, 重建=%v", field, origExists, rebuiltExists)
			continue
		}
		
		if origExists && !deepEqual(origValue, rebuiltValue) {
			t.Errorf("Anthropic %s字段值不一致: 原始=%v, 重建=%v", field, origValue, rebuiltValue)
		}
	}
}

// 检查Anthropic工具使用字段
func checkAnthropicToolUseFields(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	json.Unmarshal(original, &origObj)
	json.Unmarshal(rebuilt, &rebuiltObj)
	
	// 检查content数组中的tool_use
	origContent, origExists := origObj["content"]
	rebuiltContent, rebuiltExists := rebuiltObj["content"]
	
	if origExists != rebuiltExists {
		t.Errorf("content字段存在性不一致")
		return
	}
	
	if origExists {
		if !deepEqual(origContent, rebuiltContent) {
			t.Errorf("content字段不一致")
			t.Logf("原始content: %v", origContent)
			t.Logf("重建content: %v", rebuiltContent)
		}
	}
}

// 检查Anthropic多工具字段
func checkAnthropicMultipleToolsFields(t *testing.T, original, rebuilt []byte) {
	checkAnthropicToolUseFields(t, original, rebuilt)
}

// 检查OpenAI响应特定字段
func checkOpenAIResponseSpecificFields(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	json.Unmarshal(original, &origObj)
	json.Unmarshal(rebuilt, &rebuiltObj)
	
	openaiFields := []string{"object", "created", "choices", "usage"}
	
	for _, field := range openaiFields {
		origValue, origExists := origObj[field]
		rebuiltValue, rebuiltExists := rebuiltObj[field]
		
		if origExists != rebuiltExists {
			t.Errorf("OpenAI %s字段存在性不一致: 原始=%v, 重建=%v", field, origExists, rebuiltExists)
			continue
		}
		
		if origExists && !deepEqual(origValue, rebuiltValue) {
			t.Errorf("OpenAI %s字段值不一致: 原始=%v, 重建=%v", field, origValue, rebuiltValue)
		}
	}
}

// 检查OpenAI工具调用字段
func checkOpenAIToolCallFields(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	json.Unmarshal(original, &origObj)
	json.Unmarshal(rebuilt, &rebuiltObj)
	
	// 检查choices中的tool_calls
	origChoices, origExists := origObj["choices"]
	rebuiltChoices, rebuiltExists := rebuiltObj["choices"]
	
	if origExists != rebuiltExists {
		t.Errorf("choices字段存在性不一致")
		return
	}
	
	if origExists {
		if !deepEqual(origChoices, rebuiltChoices) {
			t.Errorf("choices字段不一致，可能包含tool_calls差异")
		}
	}
}

// 检查OpenAI多工具调用字段
func checkOpenAIMultipleToolCallsFields(t *testing.T, original, rebuilt []byte) {
	checkOpenAIToolCallFields(t, original, rebuilt)
}