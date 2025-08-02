FROM mcr.microsoft.com/devcontainers/javascript-node:1-18-bookworm

# 安装额外的工具
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        postgresql-client \
        redis-tools \
        curl \
        wget \
        git \
        zsh \
    && apt-get autoremove -y && apt-get clean -y

# 安装全局 npm 包
RUN npm install -g \
    @prisma/cli \
    typescript \
    ts-node \
    nodemon

# 配置 zsh (可选)
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" || true

# 设置工作目录
WORKDIR /workspaces/llm-gateway

# 复制 package 文件并安装依赖
COPY package*.json ./
RUN npm ci

# 确保 node 用户拥有工作目录权限
RUN chown -R node:node /workspaces

USER node