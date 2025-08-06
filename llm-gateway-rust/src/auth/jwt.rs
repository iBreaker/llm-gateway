//! JWT Token处理模块

use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use super::AuthError;

/// JWT Claims结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,          // 用户ID
    pub username: String,     // 用户名
    pub exp: i64,            // 过期时间
    pub iat: i64,            // 签发时间
    pub iss: String,         // 签发者
}

/// JWT Token服务
pub struct JwtService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    issuer: String,
}

impl JwtService {
    /// 创建新的JWT服务
    pub fn new(secret: &str, issuer: String) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
            issuer,
        }
    }

    /// 生成JWT Token
    pub fn generate_token(&self, user_id: i64, username: &str) -> Result<String, AuthError> {
        let now = Utc::now();
        let exp = now + Duration::hours(24); // 24小时过期

        let claims = Claims {
            sub: user_id.to_string(),
            username: username.to_string(),
            exp: exp.timestamp(),
            iat: now.timestamp(),
            iss: self.issuer.clone(),
        };

        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| AuthError::AuthenticationFailed(format!("Token生成失败: {}", e)))
    }

    /// 验证JWT Token
    pub fn verify_token(&self, token: &str) -> Result<Claims, AuthError> {
        let validation = Validation::default();
        
        decode::<Claims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
                _ => AuthError::InvalidToken,
            })
    }

    /// 刷新Token（生成新的Token）
    pub fn refresh_token(&self, old_token: &str) -> Result<String, AuthError> {
        let claims = self.verify_token(old_token)?;
        let user_id: i64 = claims.sub.parse()
            .map_err(|_| AuthError::InvalidToken)?;
        
        self.generate_token(user_id, &claims.username)
    }
}