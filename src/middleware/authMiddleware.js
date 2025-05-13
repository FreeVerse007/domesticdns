/**
 * 身份验证中间件
 * 用于验证JWT令牌和保护需要登录的路由
 */
const jwt = require('jsonwebtoken');
const config = require('../config.json');

/**
 * 验证JWT令牌
 * @param {Object} ctx - Koa上下文
 * @param {Function} next - 下一个中间件
 * @returns {Promise<void>}
 */
exports.verifyToken = async (ctx, next) => {
  // 从cookie或Authorization头中获取令牌
  let token = ctx.cookies.get('auth_token');
  
  if (!token && ctx.headers.authorization) {
    const parts = ctx.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }
  
  if (token) {
    try {
      // 验证令牌
      const decoded = jwt.verify(token, config.jwt.secret);
      ctx.state.user = decoded;
    } catch (error) {
      // 令牌无效或已过期，清除cookie
      ctx.cookies.set('auth_token', null);
    }
  }
  
  await next();
};

/**
 * 需要登录
 * @param {Object} ctx - Koa上下文
 * @param {Function} next - 下一个中间件
 * @returns {Promise<void>}
 */
exports.requireAuth = async (ctx, next) => {
  if (!ctx.state.user) {
    // 区分API请求和页面请求
    const isApiRequest = ctx.path.startsWith('/api/');
    
    if (isApiRequest) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '未授权访问，请先登录'
      };
    } else {
      // 将当前URL保存到查询参数中，以便登录后重定向回来
      const returnUrl = encodeURIComponent(ctx.url);
      ctx.redirect(`/login?returnUrl=${returnUrl}`);
    }
    return;
  }
  
  await next();
};

/**
 * 需要管理员权限
 * @param {Object} ctx - Koa上下文
 * @param {Function} next - 下一个中间件
 * @returns {Promise<void>}
 */
exports.requireAdmin = async (ctx, next) => {
  if (!ctx.state.user || ctx.state.user.role !== 'admin') {
    // 区分API请求和页面请求
    const isApiRequest = ctx.path.startsWith('/api/');
    
    if (isApiRequest) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '权限不足，需要管理员权限'
      };
    } else {
      ctx.status = 403;
      await ctx.render('pages/error', {
        title: '403 - 权限不足',
        currentPage: 'error',
        stylesheets: '',
        scripts: '',
        statusCode: 403,
        errorMessage: '权限不足，需要管理员权限',
        showDetails: false
      });
    }
    return;
  }
  
  await next();
}; 