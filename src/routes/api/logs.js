/**
 * 日志API路由
 */
const Router = require('koa-router');
const dnsLogController = require('../../controllers/dnsLogController');
const { requireAuth } = require('../../middleware/authMiddleware');

const router = new Router({
  prefix: '/logs'
});

// 获取日志
router.get('/', requireAuth, dnsLogController.getLogs);

// 获取日志统计
router.get('/stats', requireAuth, dnsLogController.getStats);

// 获取指定日志详情
router.get('/:id', requireAuth, dnsLogController.getLogDetail);

// 清除日志
router.delete('/', requireAuth, dnsLogController.clearLogs);

module.exports = router; 