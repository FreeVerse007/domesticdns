const Router = require('koa-router');
const apiRoutes = require('./api/index');
const authRoutes = require('./api/auth');
const dnsService = require('../services/dnsService');
const config = require('../config.json');
const fs = require('fs').promises;
const path = require('path');
const dnsController = require('../controllers/dnsController');
const dnsLogController = require('../controllers/dnsLogController');
const { verifyToken, requireAuth } = require('../middleware/authMiddleware');

const router = new Router();

// 应用身份验证中间件
router.use(verifyToken);

// 登录页面路由
router.get('/login', async (ctx) => {
  // 如果用户已登录，重定向到首页
  if (ctx.state.user) {
    return ctx.redirect('/');
  }
  
  await ctx.render('pages/login', {
    title: '登录',
    currentPage: 'login',
    stylesheets: '',
    scripts: '',
    layout: false
  });
});

// 首页路由
router.get('/', async (ctx) => {
  // 如果用户未登录，重定向到登录页面
  if (!ctx.state.user) {
    return ctx.redirect('/login');
  }
  
  await ctx.render('pages/index', {
    title: '首页',
    currentPage: 'home',
    stylesheets: '<style>.main-content { margin-top: 20px; }</style>',
    scripts: ''
  });
});

// DNS测试页面路由
router.get('/dns-test', async (ctx) => {
  await ctx.render('pages/dns-test', {
    title: 'DNS负载测试',
    currentPage: 'dns-test',
    stylesheets: `<style>
      .form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .progress-bar {
        height: 20px;
        background-color: #ecf0f1;
        border-radius: 10px;
        margin-bottom: 1rem;
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        background-color: #3498db;
        width: 0%;
        transition: width 0.2s;
      }
    </style>`,
    scripts: ''
  });
});

// 日志页面路由
router.get('/logs', requireAuth, async (ctx) => {
  await ctx.render('pages/logs', {
    title: 'DNS请求记录',
    currentPage: 'logs',
    stylesheets: '',
    scripts: ''
  });
});

// DNS管理页面路由
router.get('/dns-management', requireAuth, async (ctx) => {
  await ctx.render('pages/dns-management', {
    title: 'DNS解析管理',
    currentPage: 'dns-management',
    stylesheets: '',
    scripts: ''
  });
});

// 系统管理页面路由
router.get('/system-management', requireAuth, async (ctx) => {
  await ctx.render('pages/system-management', {
    title: '系统管理',
    currentPage: 'system-management',
    stylesheets: '',
    scripts: ''
  });
});

// 修改密码页面路由
router.get('/change-password', requireAuth, async (ctx) => {
  await ctx.render('pages/change-password', {
    title: '修改密码',
    currentPage: 'profile',
    stylesheets: '',
    scripts: ''
  });
});

// API文档路由
router.get('/api-docs', async (ctx) => {
  await ctx.render('pages/api-docs', {
    title: 'API文档',
    currentPage: 'api-docs',
    stylesheets: '',
    scripts: ''
  });
});

// DNS安全协议设置页面路由 (只保留页面渲染)
router.get('/dns-security', requireAuth, async (ctx) => {
  await ctx.render('pages/dns-security', { 
    title: 'DNS安全协议设置',
    currentPage: 'dns-security',
    stylesheets: '',
    scripts: '',
    supportedProtocols: dnsService.getSupportedProtocols(),
    config: config.dns,
    defaultProtocol: dnsService.defaultProtocol,
    fallbackOrder: dnsService.fallbackOrder,
    servers: {
      dot: dnsService._getServers('dot'),
      doh: dnsService._getServers('doh'),
      doq: dnsService._getServers('doq')
    }
  });
});

// DNS相关路由 - 从dns.js合并过来的路由
// DNS记录管理
router.post('/dns/records', requireAuth, dnsController.addRecord.bind(dnsController));
router.get('/dns/records', requireAuth, dnsController.getRecords.bind(dnsController));
router.put('/dns/records', requireAuth, dnsController.updateRecord.bind(dnsController));
router.delete('/dns/records', requireAuth, dnsController.deleteRecord.bind(dnsController));

// 批量导入导出
router.post('/dns/import', requireAuth, dnsController.importRecords.bind(dnsController));
router.get('/dns/export', requireAuth, dnsController.exportRecords.bind(dnsController));

// DNS查询
router.get('/dns/lookup', requireAuth, dnsController.lookup.bind(dnsController));
router.get('/dns/reverse', requireAuth, dnsController.reverseLookup.bind(dnsController));

// DNS日志
router.get('/dns/logs', requireAuth, dnsLogController.getLogs.bind(dnsLogController));
router.get('/dns/logs/filter', requireAuth, dnsLogController.filterLogs.bind(dnsLogController));
router.delete('/dns/logs', requireAuth, dnsLogController.clearLogs.bind(dnsLogController));
router.get('/dns/logs/stats', requireAuth, dnsLogController.getStats.bind(dnsLogController));

// API路由
router.use('/api', authRoutes.routes(), authRoutes.allowedMethods());
router.use(apiRoutes.routes(), apiRoutes.allowedMethods());

// DNS缓存管理路由 - 添加JWT验证
router.get('/api/dns/cache/status', requireAuth, dnsController.getCacheStatus);
router.post('/api/dns/cache/clear', requireAuth, dnsController.clearCache);
router.post('/api/dns/cache/remove', requireAuth, dnsController.removeDomainFromCache);
router.post('/api/dns/cache/configure', requireAuth, dnsController.configureCache);

module.exports = router;