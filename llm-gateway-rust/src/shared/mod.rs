//! 共享模块
//! 
//! 包含跨层共享的类型、错误处理、工具函数等

pub mod error;
pub mod types;
pub mod utils;
pub mod constants;

// 重新导出常用类型
pub use error::{AppError, AppResult};
pub use types::{
    ApiResponse, PaginatedResponse, PaginationInfo, PaginationParams, 
    SortDirection, SortParams, UserId, ApiKeyId, UpstreamAccountId
};