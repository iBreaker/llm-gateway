-- 创建测试用户
INSERT INTO users (username, email, password_hash, is_active, created_at, updated_at)
VALUES (
    'admin', 
    'admin@llm-gateway.com', 
    '$2b$12$8Zg5QX8rP3d4K1Lm9Jw2We8Q4Y7R6T5U9I3O2P1A5S6D7F8G9H0J1K', -- bcrypt hash for "4YXDzDeKQe8@260!"
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;