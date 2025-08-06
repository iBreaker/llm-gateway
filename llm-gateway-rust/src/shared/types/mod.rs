//! 共享类型定义模块

use serde::{Deserialize, Serialize};

/// 用户ID类型
pub type UserId = i64;

/// API Key ID类型  
pub type ApiKeyId = i64;

/// 上游账号ID类型
pub type UpstreamAccountId = i64;

/// 页码类型
pub type PageNumber = u32;

/// 页面大小类型
pub type PageSize = u32;

/// 分页参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationParams {
    pub page: PageNumber,
    pub size: PageSize,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            page: 1,
            size: 20,
        }
    }
}

impl PaginationParams {
    /// 计算偏移量
    pub fn offset(&self) -> u64 {
        ((self.page - 1) * self.size) as u64
    }
    
    /// 计算限制数量
    pub fn limit(&self) -> u64 {
        self.size as u64
    }
    
    /// 验证分页参数
    pub fn validate(&self) -> Result<(), String> {
        if self.page == 0 {
            return Err("页码必须大于0".to_string());
        }
        if self.size == 0 || self.size > 100 {
            return Err("页面大小必须在1-100之间".to_string());
        }
        Ok(())
    }
}

/// 分页响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: PaginationInfo,
}

/// 分页信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationInfo {
    pub current_page: PageNumber,
    pub page_size: PageSize,
    pub total_count: u64,
    pub total_pages: u32,
    pub has_next: bool,
    pub has_prev: bool,
}

impl PaginationInfo {
    pub fn new(current_page: PageNumber, page_size: PageSize, total_count: u64) -> Self {
        let total_pages = ((total_count as f64) / (page_size as f64)).ceil() as u32;
        let has_next = current_page < total_pages;
        let has_prev = current_page > 1;
        
        Self {
            current_page,
            page_size,
            total_count,
            total_pages,
            has_next,
            has_prev,
        }
    }
}

/// 排序方向
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

impl Default for SortDirection {
    fn default() -> Self {
        Self::Desc
    }
}

/// 排序参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SortParams {
    pub field: String,
    pub direction: SortDirection,
}

impl Default for SortParams {
    fn default() -> Self {
        Self {
            field: "created_at".to_string(),
            direction: SortDirection::Desc,
        }
    }
}

/// 过滤参数基础trait
pub trait FilterParams {
    fn validate(&self) -> Result<(), String>;
    fn apply_filters(&self) -> Vec<String>;
}

/// API响应包装器
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
    pub timestamp: String,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
    
    pub fn success_with_message(data: T, message: String) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: Some(message),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl ApiResponse<()> {
    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}