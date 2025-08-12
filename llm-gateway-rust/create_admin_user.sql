-- 创建管理员用户
INSERT INTO users (username, email, password_hash, is_active, created_at, updated_at) 
VALUES (
    'admin', 
    'admin@test.com', 
    '$argon2id$v=19$m=65536,t=3,p=1$B2wL3K8X9YgJ2QzP6RvM7A$CzKTM0/WgNlG8vF5oJy7X3pJ9K2r5/8H4Q6w1sL3mN0',  -- 密码是 'admin123'
    true, 
    NOW(), 
    NOW()
) 
ON CONFLICT (email) DO NOTHING;