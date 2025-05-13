# DomesticDNS

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Framework: Koa2](https://img.shields.io/badge/Framework-Koa2-blue.svg)
![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-orange.svg)

##项目概览
DomesticDNS是一个基于Koa2框架构建的DNS解析器服务，提供了全面的DNS功能和Web管理界面。这是一个功能丰富的DNS服务器，支持多种DNS协议，包括标准DNS、DNS over TLS (DoT)、DNS over HTTPS (DoH)和DNS over QUIC (DoQ)。

##核心技术栈
后端框架: Koa2 (Node.js)
模板引擎: EJS
DNS处理: dns2、native-dns、node-dns等库
认证: JWT (JSON Web Token)
容器化: Docker支持

## 目录

- [快速开始](#快速开始)
- [Docker部署](#docker部署)
- [登录信息](#登录信息)
- [功能特性](#功能特性)
- [项目结构](#项目结构)
- [API接口](#api接口)
- [配置说明](#配置说明)
- [离线图标支持](#离线图标支持)
- [API文档](#api文档)
- [路由结构](#domesticdns-路由结构)
- [许可证](#许可证)

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式运行

```bash
npm run dev
```

### 生产模式运行

```bash
npm start
```

## Docker部署

使用Docker可以快速部署DomesticDNS，无需关心环境依赖问题。

### 构建Docker镜像

```bash
# 进入源码目录(将目录名称修改为小写)
cd domesticdns

# 构建前删除依赖包，不删除可能导致构建失败
rm -rf node_modules/

# 构建镜像
docker build -t domesticdns .
```

### 启动Docker容器

```bash
# 启动docker容器，暴露Web端口(3211)和DNS端口(53/UDP)
docker run -p 3211:3211 -p 53:53/udp --name domesticdns --restart=always domesticdns
```

### 常用Docker命令

```bash
# 查看容器状态
docker ps -a | grep domesticdns

# 停止容器
docker stop domesticdns

# 启动容器
docker start domesticdns

# 查看容器日志
docker logs -f domesticdns
```

## 登录信息

- **用户名**: `admin`
- **密码**: `admin123`

## 功能特性

### DNS解析服务
- ✅ 支持多种记录类型 (A、AAAA、MX、TXT、NS等)
- ✅ 支持标准DNS查询和安全DNS协议 (DoT、DoH、DoQ)
- ✅ 多级DNS解析回退机制
- ✅ DNS缓存管理
- ✅ DNSSEC验证支持

### DNS安全功能
- 🔒 域名拦截 - 阻止恶意/广告域名解析
- 🔒 IP白名单 - 限制使用DNS服务的客户端
- 🔒 速率限制 - 防止DNS查询攻击
- 🔒 加密DNS传输 - 保护用户隐私

### 本地DNS解析
- 🔧 自定义DNS记录管理
- 🔧 自定义域名解析规则
- 🔧 批量导入导出功能
  
### 系统管理
- 📊 完整的日志系统 - 查询记录和操作日志
- 📊 性能监控 - 解析速度和服务器资源使用监控
- 📊 配置管理 - Web界面配置所有DNS参数
- 👤 用户管理 - 支持多用户和权限控制

### API接口
- 🔌 RESTful API - 全面的系统管理API
- 🔌 DNS查询API - 域名查询和反向IP查询
- 🔑 JWT认证 - 所有API接口受到安全保护
  
### 用户友好界面
- 📱 响应式Web界面 - 桌面和移动设备适配
- 🧪 DNS测试工具 - 性能和可用性测试
- 📈 实时数据展示 - 查询统计和系统状态
- 🔄 离线访问支持 - 完全内置的图标和样式

## 项目结构

```
domesticdns/
├── src/                # 源代码目录
│   ├── app.js          # Web应用入口文件
│   ├── server.js       # DNS服务器启动文件
│   ├── config.json     # 全局配置文件
│   ├── controllers/    # 控制器
│   ├── middleware/     # 中间件
│   ├── data/           # 数据存储
│   ├── utils/          # 工具类
│   ├── logs/           # 日志文件目录
│   ├── models/         # 数据模型
│   ├── public/         # 静态资源
│   ├── routes/         # 路由
│   ├── services/       # 服务
│   └── views/          # 视图模板
├── scripts/            # 工具脚本
├── package.json        # 项目依赖
└── package-lock.json   # 依赖锁定文件
```

<details>
<summary>查看详细项目结构</summary>

```
domesticdns/
├── src/                # 源代码目录
│   ├── app.js          # Web应用入口文件
│   ├── server.js       # DNS服务器启动文件
│   ├── config.json     # 全局配置文件
│   ├── controllers/    # 控制器
│   │   ├── baseController.js       # 基础控制器
│   │   ├── dnsController.js        # DNS控制器
│   │   ├── dnsLogController.js     # 日志控制器
│   │   ├── userController.js       # 用户控制器
│   │   ├── systemController.js     # 系统控制器
│   │   └── customDomainsController.js # 自定义域名控制器
│   ├── middleware/     # 中间件
│   │   ├── errorHandler.js         # 错误处理中间件
│   │   └── authMiddleware.js       # JWT认证中间件
│   ├── data/           # 数据存储
│   │   ├── users.json              # 用户数据
│   │   ├── customdomains.json      # 自定义域名数据
│   │   └── blockeddomains.json     # 拦截域名数据
│   ├── utils/          # 工具类
│   │   ├── errorLogger.js          # 错误日志记录
│   │   └── updateService.js        # 更新服务
│   ├── logs/           # 日志文件目录
│   ├── models/         # 数据模型
│   │   ├── dnsLogModel.js          # DNS日志模型
│   │   └── dnsRecordModel.js       # DNS记录模型
│   ├── public/         # 静态资源
│   │   └── css/        # 样式文件
│   │       ├── fonts/              # 字体文件
│   │       ├── fontawesome/        # 字体图标
│   │       ├── global.css          # 全局样式
│   │       └── icons.css           # SVG图标
│   ├── routes/         # 路由
│   │   ├── index.js                # 主路由 (包含DNS路由)
│   │   └── api/                    # API路由
│   │       ├── index.js            # API主路由
│   │       ├── dns.js              # DNS API路由
│   │       └── auth.js             # 认证API路由
│   ├── services/       # 服务
│   │   └── dnsService.js           # DNS服务
│   └── views/          # 视图模板
│       ├── layouts/                # 布局模板
│       ├── pages/                  # 页面模板
│       └── partials/               # 部分视图
├── scripts/            # 工具脚本
│   └── build-icons.js  # 图标生成脚本
├── package.json        # 项目依赖
└── package-lock.json   # 依赖锁定文件
```
</details>

## API接口

### API认证

所有API接口都受到JWT认证保护，需要在请求中提供有效的令牌。

<details>
<summary>获取认证令牌</summary>

#### 登录获取令牌

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

#### 成功响应:

```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "email": "admin@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 使用令牌

有两种方式可以在API请求中使用JWT令牌:

1. **在Authorization头中使用Bearer令牌**:

```http
GET /api/dns/lookup?domain=example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

2. **使用Cookie**:

登录成功后，服务器会自动设置名为`auth_token`的HTTP-only Cookie，浏览器会在后续请求中自动发送此Cookie。

#### 注销

```http
POST /api/auth/logout
```
</details>

### 接口分类

<details>
<summary>认证API</summary>

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户注销
- `GET /api/auth/current-user` - 获取当前用户信息
- `POST /api/auth/change-password` - 修改密码
</details>

<details>
<summary>DNS记录管理</summary>

- `POST /dns/records` - 添加DNS记录
- `GET /dns/records` - 获取DNS记录 
- `PUT /dns/records` - 更新DNS记录
- `DELETE /dns/records` - 删除DNS记录
</details>

<details>
<summary>DNS查询</summary>

- `GET /dns/lookup?domain=example.com&type=A` - 查询域名
- `GET /dns/reverse?ip=8.8.8.8` - 反向查询IP
</details>

<details>
<summary>批量操作</summary>

- `POST /dns/import` - 导入DNS记录
- `GET /dns/export` - 导出DNS记录
</details>

<details>
<summary>系统管理API</summary>

- `GET /api/system/status` - 获取系统状态
- `GET /api/system/history` - 获取系统历史记录
- `POST /api/system/service` - 控制DNS服务
- `POST /api/system/config` - 保存配置
- `GET /api/system/version` - 获取当前版本
- `GET /api/system/updates` - 检查更新
- `POST /api/system/update` - 执行更新
</details>

<details>
<summary>DNS安全API</summary>

- `GET /api/dns-security/status` - 获取DNS安全协议状态
- `POST /api/dns-security/test-connection` - 测试连接
- `POST /api/dns-security/update-server` - 更新DNS服务器
</details>

## 配置说明

项目配置位于 `src/config.json`，包括:

- ⚙️ Web服务器配置 (端口和地址)
- ⚙️ DNS服务器配置 (端口和地址)
- ⚙️ 缓存设置
- ⚙️ 上游DNS服务器
- ⚙️ 自定义DNS记录
- ⚙️ 应用程序信息
- ⚙️ JWT配置 (密钥和过期时间)

## 离线图标支持

本项目支持完全离线使用，通过以下两种方式提供图标：

1. **内联SVG图标** (推荐)
   - 使用 `icons.css` 提供基于SVG的图标
   - 无需额外字体文件，完全内联在CSS中
   - 使用方式: `<span class="icon icon-home"></span>`

2. **字体图标备选方案**
   - 使用 `fontawesome/fontawesome.css` 和本地字体文件
   - 字体文件位于 `public/css/fonts/fa-solid-900.woff2`
   - 使用方式: `<i class="fas fa-home"></i>`

<details>
<summary>自定义图标</summary>

如需添加新图标，可以：

1. 在 `src/public/css/icons.css` 中添加新的SVG图标定义
2. 使用 `scripts/build-icons.js` 更新字体图标子集：
   ```bash
   # 安装字体子集化工具
   npm install fontawesome-subset
   
   # 更新图标子集
   node scripts/build-icons.js
   ```
</details>

## API文档

访问 `/api-docs` 查看完整API文档。

## DomesticDNS 路由结构

<details>
<summary>主要路由文件结构</summary>

- `src/routes/index.js` - 主路由文件，处理页面渲染和一些API端点
- `src/routes/api/index.js` - API路由主入口，汇总所有API端点
- `src/routes/api/auth.js` - 用户认证相关的API
- `src/routes/api/dns.js` - DNS查询相关的API
</details>

<details>
<summary>页面路由</summary>

1. `/login` - 登录页面
2. `/` - 首页
3. `/dns-test` - DNS负载测试页面
4. `/logs` - DNS请求记录页面 (需要认证)
5. `/dns-management` - DNS解析管理页面 (需要认证)
6. `/system-management` - 系统管理页面 (需要认证)
7. `/change-password` - 修改密码页面 (需要认证)
8. `/api-docs` - API文档页面
9. `/dns-security` - DNS安全协议设置页面 (需要认证)
</details>

<details>
<summary>DNS相关路由</summary>

- `/dns/records` - DNS记录管理 (GET/POST/PUT/DELETE)
- `/dns/import` - 批量导入DNS记录
- `/dns/export` - 批量导出DNS记录
- `/dns/lookup` - DNS查询
- `/dns/reverse` - 反向DNS查询
- `/dns/logs` - DNS日志相关操作
</details>

<details>
<summary>完整API路由列表</summary>

### 1. 认证API (`/api/auth`)
- `/api/auth/login` - 用户登录
- `/api/auth/logout` - 用户注销
- `/api/auth/current-user` - 获取当前用户信息
- `/api/auth/change-password` - 修改密码

### 2. DNS API
- `/api/dns/lookup` - DNS查询
- `/api/dns/test` - DNS测试
- `/api/dns/benchmark` - DNS基准测试
- `/api/dns/custom-domains` - 自定义域名管理
- `/api/dns/cache/*` - DNS缓存管理

### 3. 日志API
- `/api/logs` - 获取日志
- `/api/logs/stats` - 获取日志统计
- `/api/logs/:id` - 获取指定日志详情

### 4. 系统管理API
- `/api/system/status` - 获取系统状态
- `/api/system/history` - 获取系统历史记录
- `/api/system/service` - 控制DNS服务
- `/api/system/config` - 保存配置
- `/api/system/version` - 获取当前版本
- `/api/system/updates` - 检查更新
- `/api/system/update` - 执行更新

### 5. DNS安全API
- `/api/dns-security/status` - 获取DNS安全协议状态
- `/api/dns-security/test-connection` - 测试连接
- `/api/dns-security/update-server` - 更新DNS服务器
</details>

## 许可证

MIT 