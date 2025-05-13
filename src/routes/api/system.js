/**
 * 系统管理API路由
 */
const Router = require('koa-router');
const systemController = require('../../controllers/systemController');
const { requireAuth } = require('../../middleware/authMiddleware');

const router = new Router({
  prefix: '/system'
});

// 系统管理API路由 - 添加JWT验证
router.get('/status', requireAuth, systemController.getSystemStatus);
router.get('/history', requireAuth, systemController.getSystemHistory);
router.post('/service', requireAuth, systemController.controlDnsService);
router.post('/config', requireAuth, systemController.saveConfiguration);
router.get('/version', requireAuth, systemController.getCurrentVersion);
router.get('/updates', requireAuth, systemController.checkForUpdates);
router.get('/updates/last-check', requireAuth, systemController.getLastCheckTime);
router.post('/update', requireAuth, systemController.performUpdate);

module.exports = router; 