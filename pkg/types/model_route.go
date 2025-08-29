package types

import "fmt"

// ModelRouteContext 模型路由上下文，用于在请求处理过程中传递模型替换信息
type ModelRouteContext struct {
	// OriginalModel 客户端请求的原始模型名
	OriginalModel string

	// TargetModel 实际使用的目标模型名
	TargetModel string

	// TargetProvider 目标模型的提供商
	TargetProvider Provider

	// RouteRuleID 使用的路由规则ID（用于日志和统计）
	RouteRuleID string

	// Enabled 是否启用模型替换
	Enabled bool
}

// HasModelRoute 检查是否需要进行模型替换
func (ctx *ModelRouteContext) HasModelRoute() bool {
	return ctx != nil && ctx.Enabled && ctx.OriginalModel != "" && ctx.TargetModel != "" && ctx.OriginalModel != ctx.TargetModel
}

// ModelRoute 模型路由规则定义
type ModelRoute struct {
	// ID 路由规则唯一标识
	ID string `yaml:"id" json:"id"`

	// SourceModel 源模型名（支持通配符）
	SourceModel string `yaml:"source_model" json:"source_model"`

	// TargetModel 目标模型名
	TargetModel string `yaml:"target_model" json:"target_model"`

	// TargetProvider 目标提供商
	TargetProvider Provider `yaml:"target_provider" json:"target_provider"`

	// Priority 路由优先级，数字越小优先级越高
	Priority int `yaml:"priority" json:"priority"`

	// Enabled 是否启用此路由规则
	Enabled bool `yaml:"enabled" json:"enabled"`

	// Description 规则描述
	Description string `yaml:"description" json:"description"`
}

// Matches 检查模型是否匹配此路由规则
func (route *ModelRoute) Matches(model string) bool {
	if !route.Enabled {
		return false
	}
	return matchPattern(route.SourceModel, model)
}

// matchPattern 安全的通配符匹配，带输入验证
func matchPattern(pattern, str string) bool {
	// 输入验证
	if pattern == "" || str == "" {
		return false
	}

	// 防止DoS攻击，限制模式长度
	if len(pattern) > 1000 || len(str) > 1000 {
		return false
	}

	// 完全匹配通配符
	if pattern == "*" {
		return true
	}

	// 精确匹配
	if pattern == str {
		return true
	}

	// 后缀通配符匹配
	if len(pattern) > 1 && pattern[len(pattern)-1] == '*' {
		prefix := pattern[:len(pattern)-1]
		// 边界检查
		if len(prefix) > len(str) {
			return false
		}
		return str[:len(prefix)] == prefix
	}

	return false
}

// ModelRouteConfig 模型路由配置
type ModelRouteConfig struct {
	// Routes 路由规则列表
	Routes []ModelRoute `yaml:"routes" json:"routes"`

	// DefaultBehavior 默认行为：passthrough（透传）或 reject（拒绝）
	DefaultBehavior string `yaml:"default_behavior" json:"default_behavior"`

	// EnableLogging 是否启用路由日志
	EnableLogging bool `yaml:"enable_logging" json:"enable_logging"`

	// 内部优化索引（不序列化）
	exactMatches   map[string]*ModelRoute `yaml:"-" json:"-"`
	prefixMatches  []*prefixEntry         `yaml:"-" json:"-"`
	wildcardRoutes []*ModelRoute          `yaml:"-" json:"-"`
	initialized    bool                   `yaml:"-" json:"-"`
}

// prefixEntry 前缀匹配项
type prefixEntry struct {
	prefix string
	route  *ModelRoute
}

// initializeIndices 初始化性能优化索引
func (config *ModelRouteConfig) initializeIndices() {
	if config.initialized {
		return
	}

	config.exactMatches = make(map[string]*ModelRoute)
	config.prefixMatches = make([]*prefixEntry, 0)
	config.wildcardRoutes = make([]*ModelRoute, 0)

	// 按优先级排序（数字越小优先级越高）
	sortedRoutes := make([]*ModelRoute, len(config.Routes))
	for i := range config.Routes {
		sortedRoutes[i] = &config.Routes[i]
	}

	// 简单插入排序，按优先级升序
	for i := 1; i < len(sortedRoutes); i++ {
		current := sortedRoutes[i]
		j := i - 1
		for j >= 0 && sortedRoutes[j].Priority > current.Priority {
			sortedRoutes[j+1] = sortedRoutes[j]
			j--
		}
		sortedRoutes[j+1] = current
	}

	// 分类索引
	for _, route := range sortedRoutes {
		if !route.Enabled {
			continue
		}

		pattern := route.SourceModel
		if pattern == "*" {
			config.wildcardRoutes = append(config.wildcardRoutes, route)
		} else if len(pattern) > 1 && pattern[len(pattern)-1] == '*' {
			// 前缀模式
			prefix := pattern[:len(pattern)-1]
			config.prefixMatches = append(config.prefixMatches, &prefixEntry{
				prefix: prefix,
				route:  route,
			})
		} else {
			// 精确匹配
			config.exactMatches[pattern] = route
		}
	}

	config.initialized = true
}

// FindRoute 根据模型名查找匹配的路由规则（优化版本）
func (config *ModelRouteConfig) FindRoute(model string) *ModelRoute {
	// 输入验证
	if model == "" || config == nil {
		return nil
	}

	// 确保索引已初始化
	config.initializeIndices()

	// 1. 精确匹配（O(1)）
	if route, exists := config.exactMatches[model]; exists {
		return route
	}

	// 2. 前缀匹配（O(k)，k为前缀数量，通常远小于总规则数）
	for _, entry := range config.prefixMatches {
		if len(entry.prefix) <= len(model) && model[:len(entry.prefix)] == entry.prefix {
			return entry.route
		}
	}

	// 3. 通配符匹配（O(w)，w为通配符数量）
	for _, route := range config.wildcardRoutes {
		return route // 第一个通配符路由（已按优先级排序）
	}

	return nil
}

// ResetIndices 重置索引（配置更新时调用）
func (config *ModelRouteConfig) ResetIndices() {
	config.exactMatches = nil
	config.prefixMatches = nil
	config.wildcardRoutes = nil
	config.initialized = false
}

// CreateContext 根据路由规则创建模型路由上下文
func (config *ModelRouteConfig) CreateContext(originalModel string) *ModelRouteContext {
	// 输入验证
	if originalModel == "" {
		return nil
	}

	route := config.FindRoute(originalModel)
	if route == nil {
		return nil
	}

	return &ModelRouteContext{
		OriginalModel:  originalModel,
		TargetModel:    route.TargetModel,
		TargetProvider: route.TargetProvider,
		RouteRuleID:    route.ID,
		Enabled:        true,
	}
}

// Validate 验证模型路由配置的完整性
func (config *ModelRouteConfig) Validate() error {
	if config == nil {
		return fmt.Errorf("配置对象为空")
	}

	// 验证默认行为
	switch config.DefaultBehavior {
	case "", "passthrough", "reject":
		// 有效值
	default:
		return fmt.Errorf("无效的默认行为: %s，必须是 passthrough 或 reject", config.DefaultBehavior)
	}

	// 验证路由规则
	idSet := make(map[string]bool)
	for i, route := range config.Routes {
		if err := route.validate(); err != nil {
			return fmt.Errorf("路由规则 [%d] 验证失败: %w", i, err)
		}

		// 检查ID唯一性
		if route.ID != "" {
			if idSet[route.ID] {
				return fmt.Errorf("路由规则ID重复: %s", route.ID)
			}
			idSet[route.ID] = true
		}
	}

	// 验证成功后重置索引，确保配置变更时重新初始化
	config.ResetIndices()

	return nil
}

// validate 验证单个路由规则
func (route *ModelRoute) validate() error {
	if route == nil {
		return fmt.Errorf("路由规则为空")
	}

	if route.ID == "" {
		return fmt.Errorf("路由规则ID不能为空")
	}

	if route.SourceModel == "" {
		return fmt.Errorf("源模型不能为空")
	}

	if route.TargetModel == "" {
		return fmt.Errorf("目标模型不能为空")
	}

	// 验证模型名长度
	if len(route.SourceModel) > 200 {
		return fmt.Errorf("源模型名称过长 (>200字符): %s", route.SourceModel)
	}

	if len(route.TargetModel) > 200 {
		return fmt.Errorf("目标模型名称过长 (>200字符): %s", route.TargetModel)
	}

	// 验证优先级范围
	if route.Priority < 0 {
		return fmt.Errorf("优先级不能为负数: %d", route.Priority)
	}

	// 验证提供商
	switch route.TargetProvider {
	case ProviderOpenAI, ProviderAnthropic, ProviderQwen:
		// 有效提供商
	default:
		return fmt.Errorf("不支持的目标提供商: %s", route.TargetProvider)
	}

	return nil
}
