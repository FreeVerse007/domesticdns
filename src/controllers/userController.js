/**
 * 用户控制器
 * 处理用户登录、注销和身份验证
 */
const BaseController = require('./baseController');
const jwt = require('jsonwebtoken');
const config = require('../config.json');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class UserController extends BaseController {
  /**
   * 用户登录
   * @param {Object} ctx - Koa上下文
   */
  async login(ctx) {
    try {
      const { username, password } = ctx.request.body;
      
      if (!username || !password) {
        return this.fail(ctx, '用户名和密码不能为空', 400);
      }
      
      // 获取用户数据
      const users = await this.getUsers();
      const user = users.find(u => u.username === username);
      
      // 验证用户是否存在
      if (!user) {
        return this.fail(ctx, '用户名或密码错误', 401);
      }
      
      // 验证密码
      const hashedPassword = this.hashPassword(password, user.salt);
      if (hashedPassword !== user.password) {
        return this.fail(ctx, '用户名或密码错误', 401);
      }
      
      // 生成JWT令牌
      const token = jwt.sign(
        { 
          id: user.id,
          username: user.username,
          role: user.role
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
      
      // 设置cookie
      ctx.cookies.set('auth_token', token, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
        sameSite: 'strict'
      });
      
      // 记录登录时间
      await this.updateLastLogin(user.id);
      
      // 返回用户信息和令牌
      this.success(ctx, {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email
        },
        token
      }, '登录成功');
    } catch (error) {
      this.handleError(ctx, error, '登录失败');
    }
  }
  
  /**
   * 用户注销
   * @param {Object} ctx - Koa上下文
   */
  async logout(ctx) {
    try {
      // 清除cookie
      ctx.cookies.set('auth_token', null);
      this.success(ctx, null, '注销成功');
    } catch (error) {
      this.handleError(ctx, error, '注销失败');
    }
  }
  
  /**
   * 获取当前登录用户信息
   * @param {Object} ctx - Koa上下文
   */
  async getCurrentUser(ctx) {
    try {
      if (!ctx.state.user) {
        return this.fail(ctx, '未登录', 401);
      }
      
      const users = await this.getUsers();
      const user = users.find(u => u.id === ctx.state.user.id);
      
      if (!user) {
        return this.fail(ctx, '用户不存在', 404);
      }
      
      this.success(ctx, {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email
      });
    } catch (error) {
      this.handleError(ctx, error, '获取用户信息失败');
    }
  }
  
  /**
   * 修改用户密码
   * @param {Object} ctx - Koa上下文
   */
  async changePassword(ctx) {
    try {
      if (!ctx.state.user) {
        return this.fail(ctx, '未登录', 401);
      }
      
      const { currentPassword, newPassword, confirmPassword } = ctx.request.body;
      
      // 验证输入
      if (!currentPassword || !newPassword || !confirmPassword) {
        return this.fail(ctx, '所有密码字段都不能为空', 400);
      }
      
      if (newPassword !== confirmPassword) {
        return this.fail(ctx, '新密码与确认密码不匹配', 400);
      }
      
      if (newPassword.length < 6) {
        return this.fail(ctx, '新密码长度不能少于6个字符', 400);
      }
      
      // 获取用户数据
      const users = await this.getUsers();
      const userIndex = users.findIndex(u => u.id === ctx.state.user.id);
      
      if (userIndex === -1) {
        return this.fail(ctx, '用户不存在', 404);
      }
      
      const user = users[userIndex];
      
      // 验证当前密码
      const hashedCurrentPassword = this.hashPassword(currentPassword, user.salt);
      if (hashedCurrentPassword !== user.password) {
        return this.fail(ctx, '当前密码不正确', 400);
      }
      
      // 生成新的盐值和密码哈希
      const newSalt = crypto.randomBytes(16).toString('hex');
      const hashedNewPassword = this.hashPassword(newPassword, newSalt);
      
      // 更新用户密码
      users[userIndex].password = hashedNewPassword;
      users[userIndex].salt = newSalt;
      users[userIndex].updatedAt = new Date().toISOString();
      
      // 保存更新后的用户数据
      const usersPath = path.join(__dirname, '../data/users.json');
      await fs.writeFile(usersPath, JSON.stringify(users, null, 2), 'utf8');
      
      this.success(ctx, null, '密码修改成功');
    } catch (error) {
      this.handleError(ctx, error, '修改密码失败');
    }
  }
  
  /**
   * 获取所有用户
   * @private
   * @returns {Promise<Array>} 用户列表
   */
  async getUsers() {
    const usersPath = path.join(__dirname, '../data/users.json');
    
    try {
      const data = await fs.readFile(usersPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // 如果文件不存在，创建默认管理员用户
      if (error.code === 'ENOENT') {
        const defaultUsers = [
          {
            id: 1,
            username: 'admin',
            password: this.hashPassword('admin123', 'default_salt'),
            salt: 'default_salt',
            email: config.general.adminEmail || 'admin@example.com',
            role: 'admin',
            lastLogin: null,
            createdAt: new Date().toISOString()
          }
        ];
        
        // 确保目录存在
        const dataDir = path.join(__dirname, '../data');
        try {
          await fs.mkdir(dataDir, { recursive: true });
        } catch (mkdirError) {
          if (mkdirError.code !== 'EEXIST') {
            throw mkdirError;
          }
        }
        
        // 写入默认用户
        await fs.writeFile(usersPath, JSON.stringify(defaultUsers, null, 2), 'utf8');
        return defaultUsers;
      }
      
      throw error;
    }
  }
  
  /**
   * 更新用户最后登录时间
   * @private
   * @param {number} userId - 用户ID
   */
  async updateLastLogin(userId) {
    const usersPath = path.join(__dirname, '../data/users.json');
    const users = await this.getUsers();
    
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex].lastLogin = new Date().toISOString();
      await fs.writeFile(usersPath, JSON.stringify(users, null, 2), 'utf8');
    }
  }
  
  /**
   * 密码哈希
   * @private
   * @param {string} password - 明文密码
   * @param {string} salt - 盐值
   * @returns {string} 哈希后的密码
   */
  hashPassword(password, salt) {
    return crypto
      .createHash('sha256')
      .update(password + salt)
      .digest('hex');
  }
}

module.exports = new UserController(); 