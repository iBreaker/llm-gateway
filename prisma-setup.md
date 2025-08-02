# 使用 Prisma 自动管理 Supabase 数据库

## 安装 Prisma

```bash
npm install prisma @prisma/client
npx prisma init
```

## 配置 schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           BigInt    @id @default(autoincrement())
  email        String    @unique
  username     String    @unique
  passwordHash String    @map("password_hash")
  role         String    @default("user")
  isActive     Boolean   @default(true) @map("is_active")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  
  apiKeys      ApiKey[]
  
  @@map("users")
}

model ApiKey {
  id           BigInt    @id @default(autoincrement())
  userId       BigInt    @map("user_id")
  name         String
  keyHash      String    @unique @map("key_hash")
  permissions  Json      @default("[]")
  isActive     Boolean   @default(true) @map("is_active")
  expiresAt    DateTime? @map("expires_at")
  lastUsedAt   DateTime? @map("last_used_at")
  requestCount BigInt    @default(0) @map("request_count")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  usageRecords UsageRecord[]
  
  @@map("api_keys")
}

model UpstreamAccount {
  id           BigInt    @id @default(autoincrement())
  type         String
  email        String
  credentials  Json
  isActive     Boolean   @default(true) @map("is_active")
  priority     Int       @default(1)
  weight       Int       @default(100)
  lastUsedAt   DateTime? @map("last_used_at")
  requestCount BigInt    @default(0) @map("request_count")
  successCount BigInt    @default(0) @map("success_count")
  errorCount   BigInt    @default(0) @map("error_count")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  
  usageRecords UsageRecord[]
  
  @@map("upstream_accounts")
}

model UsageRecord {
  id                  BigInt    @id @default(autoincrement())
  apiKeyId            BigInt    @map("api_key_id")
  upstreamAccountId   BigInt?   @map("upstream_account_id")
  requestId           String    @unique @map("request_id")
  method              String
  endpoint            String
  statusCode          Int?      @map("status_code")
  responseTime        Int?      @map("response_time")
  tokensUsed          BigInt    @default(0) @map("tokens_used")
  cost                Decimal   @default(0) @db.Decimal(10, 4)
  errorMessage        String?   @map("error_message")
  createdAt           DateTime  @default(now()) @map("created_at")
  
  apiKey              ApiKey    @relation(fields: [apiKeyId], references: [id], onDelete: Cascade)
  upstreamAccount     UpstreamAccount? @relation(fields: [upstreamAccountId], references: [id], onDelete: SetNull)
  
  @@map("usage_records")
}
```

## 自动化命令

```bash
# 生成迁移
npx prisma migrate dev --name init

# 推送到数据库
npx prisma db push

# 生成客户端
npx prisma generate
```