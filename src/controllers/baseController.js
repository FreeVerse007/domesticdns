/**
 * 基础控制器
 * 提供常用的控制器方法
 */
class BaseController {
  /**
   * 成功响应
   * @param {Object} ctx - Koa上下文
   * @param {*} data - 响应数据
   * @param {string} message - 响应消息
   * @param {number} status - HTTP状态码
   */
  success(ctx, data = null, message = '操作成功', status = 200) {
    ctx.status = status;
    ctx.body = {
      success: true,
      message,
      data
    };
  }

  /**
   * 失败响应
   * @param {Object} ctx - Koa上下文
   * @param {string} message - 错误消息
   * @param {number} status - HTTP状态码
   * @param {*} error - 错误详情
   */
  fail(ctx, message = '操作失败', status = 400, error = null) {
    ctx.status = status;
    ctx.body = {
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? error : undefined
    };
  }

  /**
   * 处理未找到资源
   * @param {Object} ctx - Koa上下文
   * @param {string} message - 错误消息
   */
  notFound(ctx, message = '资源未找到') {
    this.fail(ctx, message, 404);
  }

  /**
   * 处理未授权
   * @param {Object} ctx - Koa上下文
   * @param {string} message - 错误消息
   */
  unauthorized(ctx, message = '未授权访问') {
    this.fail(ctx, message, 401);
  }

  /**
   * 处理错误
   * @param {Object} ctx - Koa上下文
   * @param {Error} error - 错误对象
   * @param {string} message - 错误消息
   * @param {number} status - HTTP状态码
   */
  handleError(ctx, error, message = '操作失败', status = 500) {
    console.error(`[错误] ${message}:`, error);
    
    this.fail(ctx, message, status, {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = BaseController; 