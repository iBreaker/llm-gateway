package converter

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// TestRequestConsistency 测试请求的一致性：原始 -> 中间格式 -> 原始
func TestRequestConsistency(t *testing.T) {
	conv := NewRequestResponseConverter()

	// 读取所有请求测试文件
	reqFiles, err := filepath.Glob("testdata/req/req_*.json")
	if err != nil {
		t.Fatalf("读取测试文件失败: %v", err)
	}

	if len(reqFiles) == 0 {
		t.Skip("未找到测试文件")
	}

	for _, reqFile := range reqFiles {
		filename := filepath.Base(reqFile)
		t.Run(filename, func(t *testing.T) {
			// 读取原始请求
			originalData, err := os.ReadFile(reqFile)
			if err != nil {
				t.Fatalf("读取文件失败: %v", err)
			}

			// 检测格式
			format := conv.DetectFormat(originalData)
			if format == FormatUnknown {
				t.Fatalf("无法检测请求格式")
			}

			t.Logf("检测到格式: %s", format)

			// 步骤1: 原始 -> 中间格式
			proxyReq, err := conv.TransformRequest(originalData, format)
			if err != nil {
				t.Fatalf("转换到中间格式失败: %v", err)
			}

			// 步骤2: 中间格式 -> 原始格式
			var rebuiltData []byte
			switch format {
			case FormatAnthropic:
				rebuiltData, err = conv.BuildAnthropicRequest(proxyReq)
			case FormatOpenAI:
				rebuiltData, err = conv.BuildOpenAIRequest(proxyReq)
			default:
				t.Fatalf("不支持的格式: %s", format)
			}

			if err != nil {
				t.Fatalf("重建请求失败: %v", err)
			}

			// 步骤3: 比较一致性
			if !isJSONEqual(t, originalData, rebuiltData, filename) {
				t.Errorf("请求不一致")
				t.Logf("原始: %s", string(originalData))
				t.Logf("重建: %s", string(rebuiltData))
			}
		})
	}
}

// TestSpecificFieldPreservation 测试特定字段保留
func TestSpecificFieldPreservation(t *testing.T) {
	conv := NewRequestResponseConverter()

	testCases := []struct {
		name     string
		filename string
		checks   []func(t *testing.T, original, rebuilt []byte)
	}{
		{
			name:     "Anthropic基础请求",
			filename: "testdata/req/req_anthropic_basic.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkSystemFieldPreservation,
				checkBasicFieldsPreservation,
			},
		},
		{
			name:     "Anthropic数组system",
			filename: "testdata/req/req_anthropic_system_array.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkSystemFieldPreservation,
				checkCacheControlPreservation,
				checkBasicFieldsPreservation,
			},
		},
		{
			name:     "Anthropic包含metadata",
			filename: "testdata/req/req_anthropic_with_metadata.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkSystemFieldPreservation,
				checkMetadataPreservation,
				checkBasicFieldsPreservation,
			},
		},
		{
			name:     "Anthropic复杂请求",
			filename: "testdata/req/req_anthropic_complex.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkSystemFieldPreservation,
				checkMetadataPreservation,
				checkComplexContentPreservation,
				checkBasicFieldsPreservation,
			},
		},
		{
			name:     "OpenAI基础请求",
			filename: "testdata/req/req_openai_basic.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkBasicFieldsPreservation,
			},
		},
		{
			name:     "OpenAI复杂请求",
			filename: "testdata/req/req_openai_complex.json",
			checks: []func(t *testing.T, original, rebuilt []byte){
				checkComplexContentPreservation,
				checkBasicFieldsPreservation,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// 读取测试文件
			originalData, err := os.ReadFile(tc.filename)
			if err != nil {
				t.Fatalf("读取文件失败: %v", err)
			}

			// 检测格式并转换
			format := conv.DetectFormat(originalData)
			proxyReq, err := conv.TransformRequest(originalData, format)
			if err != nil {
				t.Fatalf("转换失败: %v", err)
			}

			// 重建请求
			var rebuiltData []byte
			switch format {
			case FormatAnthropic:
				rebuiltData, err = conv.BuildAnthropicRequest(proxyReq)
			case FormatOpenAI:
				rebuiltData, err = conv.BuildOpenAIRequest(proxyReq)
			default:
				t.Fatalf("不支持的格式: %s", format)
			}

			if err != nil {
				t.Fatalf("重建失败: %v", err)
			}

			// 执行所有检查
			for _, check := range tc.checks {
				check(t, originalData, rebuiltData)
			}
		})
	}
}

// 辅助函数：检查JSON是否相等
func isJSONEqual(t *testing.T, data1, data2 []byte, context string) bool {
	var obj1, obj2 interface{}

	if err := json.Unmarshal(data1, &obj1); err != nil {
		t.Logf("解析JSON1失败 (%s): %v", context, err)
		return false
	}

	if err := json.Unmarshal(data2, &obj2); err != nil {
		t.Logf("解析JSON2失败 (%s): %v", context, err)
		return false
	}

	return deepEqual(obj1, obj2)
}

// 深度比较两个对象
func deepEqual(a, b interface{}) bool {
	aJSON, _ := json.Marshal(a)
	bJSON, _ := json.Marshal(b)
	return string(aJSON) == string(bJSON)
}

// 检查system字段保留
func checkSystemFieldPreservation(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	_ = json.Unmarshal(original, &origObj)
	_ = json.Unmarshal(rebuilt, &rebuiltObj)

	origSystem, origExists := origObj["system"]
	rebuiltSystem, rebuiltExists := rebuiltObj["system"]

	if origExists != rebuiltExists {
		t.Errorf("system字段存在性不一致: 原始=%v, 重建=%v", origExists, rebuiltExists)
		return
	}

	if origExists {
		// 检查类型是否一致
		if fmt.Sprintf("%T", origSystem) != fmt.Sprintf("%T", rebuiltSystem) {
			t.Errorf("system字段类型不一致: 原始=%T, 重建=%T", origSystem, rebuiltSystem)
			return
		}

		// 检查内容是否一致
		if !deepEqual(origSystem, rebuiltSystem) {
			t.Errorf("system字段内容不一致")
			t.Logf("原始: %v", origSystem)
			t.Logf("重建: %v", rebuiltSystem)
		}
	}
}

// 检查metadata字段保留
func checkMetadataPreservation(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	_ = json.Unmarshal(original, &origObj)
	_ = json.Unmarshal(rebuilt, &rebuiltObj)

	origMetadata, origExists := origObj["metadata"]
	rebuiltMetadata, rebuiltExists := rebuiltObj["metadata"]

	if origExists != rebuiltExists {
		t.Errorf("metadata字段存在性不一致: 原始=%v, 重建=%v", origExists, rebuiltExists)
		return
	}

	if origExists {
		if !deepEqual(origMetadata, rebuiltMetadata) {
			t.Errorf("metadata字段内容不一致")
			t.Logf("原始: %v", origMetadata)
			t.Logf("重建: %v", rebuiltMetadata)
		}
	}
}

// 检查cache_control字段保留
func checkCacheControlPreservation(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	_ = json.Unmarshal(original, &origObj)
	_ = json.Unmarshal(rebuilt, &rebuiltObj)

	// 检查system数组中的cache_control
	if origSystem, exists := origObj["system"]; exists {
		if origArray, ok := origSystem.([]interface{}); ok {
			rebuiltSystem := rebuiltObj["system"].([]interface{})

			for i, origBlock := range origArray {
				origBlockMap := origBlock.(map[string]interface{})
				rebuiltBlockMap := rebuiltSystem[i].(map[string]interface{})

				if origCC, exists := origBlockMap["cache_control"]; exists {
					rebuiltCC, rebuiltExists := rebuiltBlockMap["cache_control"]

					if !rebuiltExists {
						t.Errorf("cache_control字段丢失 (block %d)", i)
						continue
					}

					if !deepEqual(origCC, rebuiltCC) {
						t.Errorf("cache_control字段不一致 (block %d)", i)
						t.Logf("原始: %v", origCC)
						t.Logf("重建: %v", rebuiltCC)
					}
				}
			}
		}
	}
}

// 检查基础字段保留
func checkBasicFieldsPreservation(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	_ = json.Unmarshal(original, &origObj)
	_ = json.Unmarshal(rebuilt, &rebuiltObj)

	basicFields := []string{"model", "max_tokens", "temperature", "stream"}

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

// 检查复杂content字段保留
func checkComplexContentPreservation(t *testing.T, original, rebuilt []byte) {
	var origObj, rebuiltObj map[string]interface{}
	_ = json.Unmarshal(original, &origObj)
	_ = json.Unmarshal(rebuilt, &rebuiltObj)

	origMessages, origExists := origObj["messages"]
	rebuiltMessages, rebuiltExists := rebuiltObj["messages"]

	if origExists != rebuiltExists {
		t.Errorf("messages字段存在性不一致")
		return
	}

	if origExists {
		if !deepEqual(origMessages, rebuiltMessages) {
			t.Errorf("messages字段内容不一致")
			// 详细比较每个message
			origArray := origMessages.([]interface{})
			rebuiltArray := rebuiltMessages.([]interface{})

			if len(origArray) != len(rebuiltArray) {
				t.Errorf("messages数量不一致: 原始=%d, 重建=%d", len(origArray), len(rebuiltArray))
				return
			}

			for i, origMsg := range origArray {
				rebuiltMsg := rebuiltArray[i]
				if !deepEqual(origMsg, rebuiltMsg) {
					t.Errorf("message[%d]不一致", i)
					t.Logf("原始: %v", origMsg)
					t.Logf("重建: %v", rebuiltMsg)
				}
			}
		}
	}
}
