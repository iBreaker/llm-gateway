//! 表示层模块
//! 
//! 负责HTTP请求处理、路由管理、中间件等

pub mod handlers;
pub mod middleware;
pub mod routes;
pub mod dto;

// 重新导出路由创建函数
pub use routes::create_routes;