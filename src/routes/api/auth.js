/**
 * 身份验证API路由
 */
const Router = require('koa-router');
const userController = require('../../controllers/userController');
const { requireAuth } = require('../../middleware/authMiddleware');

const router = new Router({
  prefix: '/auth'
});

// 登录
router.post('/login', userController.login.bind(userController));

// 注销
router.post('/logout', userController.logout.bind(userController));

// 获取当前用户信息
router.get('/current-user', requireAuth, userController.getCurrentUser.bind(userController));

// 修改密码
router.post('/change-password', requireAuth, userController.changePassword.bind(userController));

module.exports = router; 