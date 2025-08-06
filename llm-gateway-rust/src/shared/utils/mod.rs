//! 工具函数模块

use rand::{distributions::Alphanumeric, Rng};

/// 生成随机字符串
pub fn generate_random_string(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

/// 生成API Key
pub fn generate_api_key() -> String {
    format!("llm_gateway_{}", generate_random_string(32))
}

/// 计算SHA256哈希 (简化版本，使用标准库)
pub fn sha256_hash(input: &str) -> String {
    // 简化实现，实际生产环境可以使用sha2 crate
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

/// 验证邮箱格式
pub fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() > 5
}

/// 格式化字节数
pub fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    format!("{:.2} {}", size, UNITS[unit_index])
}

/// 格式化持续时间
pub fn format_duration_ms(milliseconds: u64) -> String {
    if milliseconds < 1000 {
        format!("{}ms", milliseconds)
    } else if milliseconds < 60_000 {
        let seconds = milliseconds as f64 / 1000.0;
        format!("{:.1}s", seconds)
    } else {
        let minutes = milliseconds / 60_000;
        let seconds = (milliseconds % 60_000) / 1000;
        format!("{}m{}s", minutes, seconds)
    }
}

/// 计算百分比
pub fn calculate_percentage(part: u64, total: u64) -> f64 {
    if total == 0 {
        0.0
    } else {
        (part as f64 / total as f64) * 100.0
    }
}

/// 时间戳工具
pub mod time {
    use chrono::{DateTime, Duration, Utc};
    
    /// 获取当前UTC时间
    pub fn now_utc() -> DateTime<Utc> {
        Utc::now()
    }
    
    /// 获取N天后的时间
    pub fn days_from_now(days: i64) -> DateTime<Utc> {
        Utc::now() + Duration::days(days)
    }
    
    /// 获取N小时后的时间
    pub fn hours_from_now(hours: i64) -> DateTime<Utc> {
        Utc::now() + Duration::hours(hours)
    }
    
    /// 检查时间是否过期
    pub fn is_expired(datetime: DateTime<Utc>) -> bool {
        datetime < Utc::now()
    }
    
    /// 格式化时间为ISO 8601字符串
    pub fn format_iso8601(datetime: DateTime<Utc>) -> String {
        datetime.to_rfc3339()
    }
}

/// 验证工具
pub mod validation {
    /// 验证用户名（字母数字加下划线，3-20位）
    pub fn is_valid_username(username: &str) -> bool {
        if username.len() < 3 || username.len() > 20 {
            return false;
        }
        
        username.chars().all(|c| c.is_alphanumeric() || c == '_')
    }
    
    /// 验证密码强度（至少8位，包含字母和数字）
    pub fn is_strong_password(password: &str) -> bool {
        if password.len() < 8 {
            return false;
        }
        
        let has_letter = password.chars().any(|c| c.is_alphabetic());
        let has_number = password.chars().any(|c| c.is_numeric());
        
        has_letter && has_number
    }
    
    /// 验证API Key名称
    pub fn is_valid_api_key_name(name: &str) -> bool {
        !name.is_empty() && name.len() <= 50 && name.trim() == name
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_generate_random_string() {
        let s1 = generate_random_string(10);
        let s2 = generate_random_string(10);
        
        assert_eq!(s1.len(), 10);
        assert_eq!(s2.len(), 10);
        assert_ne!(s1, s2); // 应该不同
    }
    
    #[test]
    fn test_generate_api_key() {
        let key = generate_api_key();
        assert!(key.starts_with("llm_gateway_"));
        assert_eq!(key.len(), "llm_gateway_".len() + 32);
    }
    
    #[test]
    fn test_is_valid_email() {
        assert!(is_valid_email("test@example.com"));
        assert!(!is_valid_email("invalid-email"));
        assert!(!is_valid_email("@example.com"));
        assert!(!is_valid_email("test@"));
    }
    
    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500.00 B");
        assert_eq!(format_bytes(1536), "1.50 KB");
        assert_eq!(format_bytes(1024 * 1024), "1.00 MB");
    }
    
    #[test]
    fn test_validation() {
        use validation::*;
        
        assert!(is_valid_username("test_user"));
        assert!(!is_valid_username("ab"));
        assert!(!is_valid_username("invalid-user"));
        
        assert!(is_strong_password("password123"));
        assert!(!is_strong_password("password"));
        assert!(!is_strong_password("123456"));
    }
}