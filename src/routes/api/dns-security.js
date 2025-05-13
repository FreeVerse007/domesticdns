/**
 * DNS安全协议API路由
 */
const Router = require('koa-router');
const dnsService = require('../../services/dnsService');
const fs = require('fs').promises;
const path = require('path');
const errorLogger = require('../../utils/errorLogger');
const { requireAuth } = require('../../middleware/authMiddleware');

const router = new Router({
  prefix: '/dns-security'
});

// 获取DNS安全协议状态
router.get('/status', requireAuth, async (ctx) => {
  try {
    // 从文件系统中直接读取最新的配置
    const configPath = path.join(__dirname, '../../config.json');
    const latestConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
  ctx.body = {
    success: true,
    data: {
      supportedProtocols: dnsService.getSupportedProtocols(),
        config: {
          dns: {
            // 只返回DNS安全相关的配置
            defaultProtocol: latestConfig.dns.defaultProtocol,
            fallbackOrder: latestConfig.dns.fallbackOrder,
            dot: latestConfig.dns.dot,
            doh: latestConfig.dns.doh,
            doq: latestConfig.dns.doq,
            standard: latestConfig.dns.standard,
            custom: latestConfig.dns.custom
          }
        }
    }
  };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: `获取DNS安全配置失败: ${error.message}`
    };
  }
});

// 测试特定服务器连接
router.post('/test-connection', requireAuth, async (ctx) => {
  const { protocol, host, port, path, servername } = ctx.request.body;
  let result = { success: false, message: '不支持的协议' };
  
  try {
    switch (protocol) {
      case 'dot':
        result = await dnsService.testDoTConnection(host, port, servername);
        break;
      case 'doh':
        result = await dnsService.testDoHConnection(host, path);
        break;
      case 'doq':
        result = await dnsService.testDoQConnection(host, port);
        break;
      default:
        break;
    }
    
    ctx.body = {
      success: true,
      data: result
    };
  } catch (error) {
    ctx.body = {
      success: false,
      message: `测试连接失败: ${error.message}`
    };
  }
});

// 更新DNS服务器
router.post('/update-server', requireAuth, async (ctx) => {
  const serverData = ctx.request.body;
  
  try {
    // 验证数据
    if (!serverData.protocol || !serverData.host) {
      ctx.body = {
        success: false,
        message: '缺少必要的服务器信息'
      };
      return;
    }
    
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 查找要更新的服务器
    const protocol = serverData.protocol;
    const originalHost = serverData.originalHost;
    
    if (!configData.dns[protocol] || !configData.dns[protocol].servers) {
      ctx.body = {
        success: false,
        message: `未找到${protocol}协议配置`
      };
      return;
    }
    
    // 查找并更新服务器
    const servers = configData.dns[protocol].servers;
    const serverIndex = servers.findIndex(server => server.host === originalHost);
    
    if (serverIndex === -1) {
      ctx.body = {
        success: false,
        message: `未找到主机为${originalHost}的服务器`
      };
      return;
    }
    
    // 根据协议类型准备更新数据
    const updatedServer = { ...servers[serverIndex] };
    
    // 更新通用字段
    updatedServer.host = serverData.host;
    updatedServer.priority = parseInt(serverData.priority) || updatedServer.priority;
    
    // 根据协议更新特定字段
    switch (protocol) {
      case 'dot':
        updatedServer.port = parseInt(serverData.port) || updatedServer.port;
        updatedServer.servername = serverData.servername || updatedServer.servername;
        break;
      case 'doh':
        updatedServer.path = serverData.path || updatedServer.path;
        updatedServer.method = serverData.method || updatedServer.method;
        updatedServer.protocol = serverData.httpProtocol || updatedServer.protocol;
        break;
      case 'doq':
        updatedServer.port = parseInt(serverData.port) || updatedServer.port;
        break;
    }
    
    // 更新服务器数据
    servers[serverIndex] = updatedServer;
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 更新DNS服务中的服务器配置
    if (dnsService.dnsConfig && dnsService.dnsConfig[protocol] && dnsService.dnsConfig[protocol].servers) {
      const serviceServers = dnsService.dnsConfig[protocol].servers;
      const serviceServerIndex = serviceServers.findIndex(server => server.host === originalHost);
      if (serviceServerIndex !== -1) {
        serviceServers[serviceServerIndex] = updatedServer;
      }
    }
    
    ctx.body = {
      success: true,
      message: '服务器设置已更新'
    };
  } catch (error) {
    ctx.body = {
      success: false,
      message: `更新服务器设置失败: ${error.message}`
    };
  }
});

module.exports = router; 