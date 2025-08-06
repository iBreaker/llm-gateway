//! 基础设施层模块
//! 
//! 负责数据持久化、外部服务调用、配置管理等基础设施相关功能

pub mod config;
pub mod database;
pub mod repositories;
pub mod external;

// 重新导出常用类型和错误
pub use config::Config;
pub use database::{Database, DatabaseError, DatabaseVersionInfo};

// 重新导出认证错误
pub use crate::auth::AuthError;