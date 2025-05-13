const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const serve = require('koa-static');
const logger = require('koa-logger');
const path = require('path');
const ejs = require('koa-ejs');
const fs = require('fs').promises;
const config = require('./config.json');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

// 创建数据目录
async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
    console.log('数据目录已创建或已存在:', dataDir);
  } catch (error) {
    console.error('创建数据目录失败:', error);
  }
}

// 确保数据目录存在
ensureDataDirectory();

// 创建Koa应用
const app = new Koa();

// 配置EJS模板引擎
ejs(app, {
  root: path.join(__dirname, 'views'),
  layout: 'layouts/main',
  viewExt: 'ejs',
  cache: process.env.NODE_ENV === 'production',
  debug: false,
  // 可以在所有模板中使用的变量
  locals: {
    siteName: config.app.siteName
  },
  // EJS模板中使用的占位符
  delimiter: '%'
});

// 全局错误处理
app.use(errorHandler);

// 中间件
app.use(bodyParser());
app.use(logger());
app.use(serve(path.join(__dirname, 'public')));

// 将ctx对象传递给模板
app.use(async (ctx, next) => {
  // 添加ctx对象到state，使其在模板中可用
  ctx.state.ctx = ctx;
  await next();
});

// 路由
app.use(routes.routes()).use(routes.allowedMethods());

// 错误处理
app.on('error', (err, ctx) => {
  console.error('服务器错误', err, ctx);
});

// 启动Web服务器
const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, () => {
  console.log(`Web服务器运行在 http://${HOST}:${PORT}`);
});

// 启动DNS服务器
try {
  console.log('正在启动DNS服务器...');
  require('./server');
  console.log('DNS服务器已启动');
} catch (error) {
  console.error('启动DNS服务器失败:', error.message);
}

module.exports = app; 