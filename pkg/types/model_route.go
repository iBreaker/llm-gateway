package types

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

// matchPattern 简单的通配符匹配
func matchPattern(pattern, str string) bool {
	if pattern == "*" {
		return true
	}
	if pattern == str {
		return true
	}
	// 支持 * 通配符（简单实现）
	if len(pattern) > 0 && pattern[len(pattern)-1] == '*' {
		prefix := pattern[:len(pattern)-1]
		return len(str) >= len(prefix) && str[:len(prefix)] == prefix
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
}

// FindRoute 根据模型名查找匹配的路由规则
func (config *ModelRouteConfig) FindRoute(model string) *ModelRoute {
	var bestMatch *ModelRoute
	bestPriority := -1

	for i := range config.Routes {
		route := &config.Routes[i]
		if route.Matches(model) {
			// 选择优先级最高的规则（数字越小优先级越高）
			if bestMatch == nil || route.Priority < bestPriority {
				bestMatch = route
				bestPriority = route.Priority
			}
		}
	}

	return bestMatch
}

// CreateContext 根据路由规则创建模型路由上下文
func (config *ModelRouteConfig) CreateContext(originalModel string) *ModelRouteContext {
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