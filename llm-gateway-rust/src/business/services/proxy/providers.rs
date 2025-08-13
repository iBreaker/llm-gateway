//! 提供商工厂
//! 
//! 集中管理不同提供商的策略创建

use crate::business::domain::ProviderConfig;
use super::traits::{AuthStrategy, RequestBuilder, ResponseProcessor, ProviderFactory};

/// 默认提供商工厂
pub struct DefaultProviderFactory;

impl ProviderFactory for DefaultProviderFactory {
    fn create_auth_strategy(&self, config: &ProviderConfig) -> Option<Box<dyn AuthStrategy>> {
        super::auth::create_auth_strategy(config)
    }
    
    fn create_request_builder(&self, config: &ProviderConfig) -> Option<Box<dyn RequestBuilder>> {
        super::request_builder::create_request_builder(config)
    }
    
    fn create_response_processor(&self, config: &ProviderConfig) -> Option<Box<dyn ResponseProcessor>> {
        super::response_processor::create_response_processor(config)
    }
    
    fn supported_configs(&self) -> Vec<ProviderConfig> {
        ProviderConfig::all_supported()
    }
}

impl Default for DefaultProviderFactory {
    fn default() -> Self {
        Self
    }
}