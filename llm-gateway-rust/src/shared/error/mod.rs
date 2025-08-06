//! 统一错误处理模块
//! 
//! 定义系统中所有错误类型，提供统一的错误处理机制

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// 应用程序统一错误类型
#[derive(Debug, Error)]
pub enum AppError {
    /// 数据库相关错误
    #[error("数据库错误: {0}")]
    Database(#[from] sqlx::Error),
    
    /// 认证相关错误
    #[error("认证错误: {0}")]
    Authentication(#[from] crate::infrastructure::AuthError),
    
    /// 验证错误
    #[error("验证错误: {0}")]
    Validation(String),
    
    /// 业务逻辑错误
    #[error("业务错误: {0}")]
    Business(String),
    
    /// 外部服务错误
    #[error("外部服务错误: {0}")]
    ExternalService(String),
    
    /// 配置错误
    #[error("配置错误: {0}")]
    Configuration(String),
    
    /// 内部服务器错误
    #[error("内部错误: {0}")]
    Internal(String),
    
    /// 权限不足错误
    #[error("权限不足: {0}")]
    Forbidden(String),
    
    /// 资源未找到错误
    #[error("资源未找到: {0}")]
    NotFound(String),
}

impl AppError {
    /// 获取HTTP状态码
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Authentication(_) => StatusCode::UNAUTHORIZED,
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::Business(_) => StatusCode::BAD_REQUEST,
            AppError::ExternalService(_) => StatusCode::BAD_GATEWAY,
            AppError::Configuration(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
        }
    }
    
    /// 获取错误代码
    pub fn error_code(&self) -> &'static str {
        match self {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Authentication(_) => "AUTH_ERROR",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::Business(_) => "BUSINESS_ERROR",
            AppError::ExternalService(_) => "EXTERNAL_SERVICE_ERROR",
            AppError::Configuration(_) => "CONFIG_ERROR",
            AppError::Internal(_) => "INTERNAL_ERROR",
            AppError::Forbidden(_) => "FORBIDDEN",
            AppError::NotFound(_) => "NOT_FOUND",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status_code = self.status_code();
        let error_code = self.error_code();
        
        tracing::error!(
            status = ?status_code,
            error_code = error_code,
            error = %self,
            "处理请求时发生错误"
        );
        
        let body = Json(json!({
            "error": {
                "code": error_code,
                "message": self.to_string(),
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }
        }));
        
        (status_code, body).into_response()
    }
}

/// 应用程序结果类型
pub type AppResult<T> = Result<T, AppError>;

/// 业务错误构造宏
#[macro_export]
macro_rules! business_error {
    ($msg:expr) => {
        $crate::shared::error::AppError::Business($msg.to_string())
    };
    ($fmt:expr, $($arg:tt)*) => {
        $crate::shared::error::AppError::Business(format!($fmt, $($arg)*))
    };
}

/// 验证错误构造宏
#[macro_export]
macro_rules! validation_error {
    ($msg:expr) => {
        $crate::shared::error::AppError::Validation($msg.to_string())
    };
    ($fmt:expr, $($arg:tt)*) => {
        $crate::shared::error::AppError::Validation(format!($fmt, $($arg)*))
    };
}

/// 内部错误构造宏
#[macro_export]
macro_rules! internal_error {
    ($msg:expr) => {
        $crate::shared::error::AppError::Internal($msg.to_string())
    };
    ($fmt:expr, $($arg:tt)*) => {
        $crate::shared::error::AppError::Internal(format!($fmt, $($arg)*))
    };
}