//! 智能代理服务模块
//! 
//! 支持多种认证方式和请求格式的可扩展代理系统

pub mod traits;
pub mod auth;
pub mod request_builder;
pub mod response_processor;
pub mod providers;
pub mod metrics;
pub mod coordinator;

// 重新导出核心类型和接口
pub use traits::*;
pub use coordinator::ProxyCoordinator;
pub use metrics::ProxyStats;

// 重新导出原有的公共类型以保持向后兼容
pub use coordinator::{ProxyRequest, ProxyResponse};