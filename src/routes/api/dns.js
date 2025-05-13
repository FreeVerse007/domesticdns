/**
 * DNS API路由
 * 提供DNS查询相关的API接口
 */
const Router = require('koa-router');
const dns = require('dns').promises;
const { requireAuth } = require('../../middleware/authMiddleware');
const router = new Router({ prefix: '/api/dns' });

// DNS查询API - 添加JWT验证
router.get('/lookup', requireAuth, async (ctx) => {
  const { domain } = ctx.query;
  
  if (!domain) {
    ctx.status = 400;
    ctx.body = {
      status: 'error',
      message: '请提供domain参数'
    };
    return;
  }
  
  try {
    const result = await dns.lookup(domain);
    ctx.body = {
      status: 'success',
      domain,
      ip: result.address,
      family: `IPv${result.family}`
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      status: 'error',
      message: error.message
    };
  }
});

// 解析域名的所有IPv4和IPv6地址 - 添加JWT验证
router.get('/resolve', requireAuth, async (ctx) => {
  const { domain } = ctx.query;
  
  if (!domain) {
    ctx.status = 400;
    ctx.body = {
      status: 'error',
      message: '请提供domain参数'
    };
    return;
  }
  
  try {
    const [ipv4Addresses, ipv6Addresses] = await Promise.all([
      dns.resolve4(domain).catch(() => []),
      dns.resolve6(domain).catch(() => [])
    ]);
    
    ctx.body = {
      status: 'success',
      domain,
      ipv4: ipv4Addresses,
      ipv6: ipv6Addresses
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      status: 'error',
      message: error.message
    };
  }
});

module.exports = router; 