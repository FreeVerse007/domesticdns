# 使用官方Node.js镜像作为基础镜像
FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制应用程序代码
COPY . .

# 暴露服务端口（HTTP和DNS）
EXPOSE 3211 53/udp 53/tcp

# 设置Node环境为生产环境
ENV NODE_ENV=production

# 启动应用
CMD ["npm", "start"] 