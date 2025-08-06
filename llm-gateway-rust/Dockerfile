# 多阶段构建 Dockerfile
FROM rust:1.75 as builder

WORKDIR /app

# 复制 Cargo 文件
COPY Cargo.toml Cargo.lock ./

# 创建虚拟的 src/main.rs 来缓存依赖
RUN mkdir src && echo "fn main() {}" > src/main.rs

# 构建依赖（缓存层）
RUN cargo build --release
RUN rm src/main.rs

# 复制源代码
COPY src ./src

# 构建应用
RUN cargo build --release

# 运行时镜像
FROM debian:bookworm-slim

# 安装必要的运行时依赖
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从构建镜像复制二进制文件
COPY --from=builder /app/target/release/llm-gateway-rust /app/

# 创建非 root 用户
RUN useradd -r -s /bin/false appuser
USER appuser

# 暴露端口
EXPOSE 8080

# 设置环境变量
ENV RUST_LOG=llm_gateway_rust=info

# 启动应用
CMD ["./llm-gateway-rust"]