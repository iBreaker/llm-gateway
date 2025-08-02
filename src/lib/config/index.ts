/**
 * 配置管理模块入口
 */

export * from './manager';
export * from './defaults';

// 便捷导出
import { getConfig, setConfig, getAllConfigs } from './manager';
import { DEFAULT_CONFIGS } from './defaults';

export { getConfig, setConfig, getAllConfigs, DEFAULT_CONFIGS };