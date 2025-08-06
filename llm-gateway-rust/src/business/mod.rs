//! 业务逻辑层模块
//! 
//! 包含核心业务逻辑、领域模型、服务接口等

pub mod domain;
pub mod services;
pub mod validators;
pub mod events;

// 重新导出常用类型
pub use domain::*;
pub use services::*;