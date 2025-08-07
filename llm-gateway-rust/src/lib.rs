//! LLM Gateway Rust 服务
//! 
//! 纯Rust实现的LLM代理服务，基于三层架构设计

#![allow(async_fn_in_trait)]

// 核心模块
pub mod shared;          // 共享模块（错误处理、类型定义、工具函数）
pub mod infrastructure;  // 基础设施层（数据库、配置、外部服务）
pub mod business;        // 业务逻辑层（领域模型、服务接口、智能路由）
pub mod presentation;    // 表示层（HTTP处理、路由、中间件）
pub mod auth;           // 认证和授权模块

#[cfg(test)]
pub mod integration_test_cache; // 缓存集成测试

// 重新导出核心类型
pub use infrastructure::{Config, Database};
pub use shared::{AppError, AppResult};
pub use presentation::routes::create_routes;