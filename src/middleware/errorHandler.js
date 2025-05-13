/**
 * 全局错误处理中间件
 */
module.exports = async (ctx, next) => {
  try {
    await next();
    
    // 处理404错误 - 如果没有匹配的路由
    if (ctx.status === 404 && !ctx.body) {
      // 区分API请求和页面请求
      const isApiRequest = ctx.path.startsWith('/api/') || ctx.path.startsWith('/dns/');
      
      if (isApiRequest) {
        // API请求返回JSON响应
        ctx.status = 404;
        ctx.body = {
          success: false,
          message: '未找到请求的资源',
          path: ctx.path
        };
      } else {
        // 页面请求渲染404页面
        await ctx.render('pages/404', {
          title: '404 - 页面未找到',
          currentPage: 'error',
          stylesheets: '',
          scripts: '',
          requestPath: ctx.path
        });
        ctx.status = 404;
      }
    }
  } catch (err) {
    // 记录错误日志
    console.error('服务器错误:', err);

    // 设置状态码
    ctx.status = err.status || 500;
    
    // 区分API请求和页面请求
    const isApiRequest = ctx.path.startsWith('/api/') || ctx.path.startsWith('/dns/');
    
    if (isApiRequest) {
      // API请求返回JSON响应
      ctx.body = {
        success: false,
        message: err.message || '服务器内部错误',
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
      };
    } else {
      // 页面请求渲染错误页面
      try {
        await ctx.render('pages/error', {
          title: `${ctx.status} - 服务器错误`,
          currentPage: 'error',
          stylesheets: '',
          scripts: '',
          statusCode: ctx.status,
          errorMessage: err.message || '服务器内部错误',
          showDetails: process.env.NODE_ENV === 'development',
          stack: err.stack
        });
      } catch (renderErr) {
        // 如果渲染错误页面失败，回退到简单的错误显示
        ctx.type = 'text/html';
        ctx.body = `<h1>${ctx.status} - 服务器错误</h1><p>${err.message || '服务器内部错误'}</p>`;
      }
    }
    
    // 触发应用级错误事件
    ctx.app.emit('error', err, ctx);
  }
}; 