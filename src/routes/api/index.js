/**
 * API路由入口文件
 * 所有API路由将在此汇总
 */
const Router = require('koa-router');
const dnsController = require('../../controllers/dnsController');
const dnsLogController = require('../../controllers/dnsLogController');
const systemController = require('../../controllers/systemController');
const customDomainsController = require('../../controllers/customDomainsController');
const authRouter = require('./auth');
const systemRouter = require('./system');
const dnsSecurityRouter = require('./dns-security');
const logsRouter = require('./logs');
const dnsService = require('../../services/dnsService');
const config = require('../../config.json');
const fs = require('fs').promises;
const path = require('path');
const errorLogger = require('../../utils/errorLogger');
const os = require('os');
const { requireAuth } = require('../../middleware/authMiddleware');

const router = new Router({
  prefix: '/api'
});

// 添加auth路由
router.use(authRouter.routes(), authRouter.allowedMethods());

// 添加system路由
router.use(systemRouter.routes(), systemRouter.allowedMethods());

// 添加dns-security路由
router.use(dnsSecurityRouter.routes(), dnsSecurityRouter.allowedMethods());

// 添加logs路由
router.use(logsRouter.routes(), logsRouter.allowedMethods());

// 欢迎信息
router.get('/', async (ctx) => {
  ctx.body = {
    status: 'success',
    message: 'DomesticDNS API服务',
    version: '1.2.3',
    endpoints: [
      '/api/dns/lookup',
      '/api/dns/test',
      '/api/dns/benchmark',
      '/api/logs',
      '/api/logs/stats',
      '/api/logs/:id',
      '/api/system/status',
      '/api/system/history',
      '/api/system/service',
      '/api/system/config',
      '/api/system/version',
      '/api/system/updates',
      '/api/system/updates/last-check',
      '/api/system/update',
      '/api/dns/custom-domains',
      '/api/status',
      '/api/dns-security/status',
      '/api/dns-security/test-connection',
      '/api/dns-security/update-server',
      '/api/dns-security/toggle-protocol',
      '/api/dns-security/update-default-protocol',
      '/api/dns-security/update-fallback-order',
      '/api/dns/update-blocked-domains',
      '/api/dns/update-upstream',
      '/api/dns/update-server-config',
      '/api/dns/update-allowed-ips',
      '/api/dns/update-rate-limit',
      '/api/dns/update-dnssec',
      '/api/dns/update-logging',
      '/api/dns/config-logs',
      '/api/dns/cache/status',
      '/api/dns/cache/clear',
      '/api/dns/cache/remove',
      '/api/dns/cache/configure',
      '/api/system/update-general-settings',
      '/api/system/server-info',
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/current-user'
    ]
  };
});

// DNS API路由 - 添加JWT验证
router.get('/dns/lookup', requireAuth, dnsController.lookup.bind(dnsController));
router.get('/dns/test', requireAuth, dnsController.test.bind(dnsController));
router.post('/dns/benchmark', requireAuth, dnsController.benchmark.bind(dnsController));

// 日志API路由 - 已移至logs.js
// router.get('/logs', requireAuth, dnsLogController.getLogs);
// router.get('/logs/stats', requireAuth, dnsLogController.getStats);
// router.get('/logs/:id', requireAuth, dnsLogController.getLogDetail);
// router.delete('/logs', requireAuth, dnsLogController.clearLogs);

// 自定义域名管理API - 添加JWT验证
router.get('/dns/custom-domains', requireAuth, customDomainsController.getCustomDomains);
router.post('/dns/custom-domains', requireAuth, customDomainsController.addDomain);
router.put('/dns/custom-domains', requireAuth, customDomainsController.updateDomain);
router.delete('/dns/custom-domains', requireAuth, customDomainsController.deleteDomain);
router.post('/dns/custom-domains/import', requireAuth, customDomainsController.importDomains);

// 服务状态API
router.get('/status', async (ctx) => {
  ctx.body = {
    status: 'running',
    version: '1.2.3',
    timestamp: new Date().toISOString()
  };
});

// 启用/禁用特定DNS协议
router.post('/dns-security/toggle-protocol', requireAuth, async (ctx) => {
  const { protocol, enable } = ctx.request.body;
  
  if (!protocol || typeof enable !== 'boolean') {
    ctx.body = {
      success: false,
      message: '请提供有效的协议和启用状态'
    };
    return;
  }
  
  try {
    // 确保协议有效
    if (!['standard', 'custom', 'dot', 'doh', 'doq'].includes(protocol)) {
      ctx.body = {
        success: false,
        message: '无效的协议类型'
      };
      return;
    }
    
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 更新DNS配置部分
    if (configData.dns[protocol]) {
      configData.dns[protocol].enable = enable;
      
      // 写入文件
      await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
      
      // 重新初始化DNS服务
      dnsService.supportedProtocols[protocol] = enable;
      
      ctx.body = {
        success: true,
        message: `${protocol.toUpperCase()} 协议已${enable ? '启用' : '禁用'}`
      };
    } else {
      ctx.body = {
        success: false,
        message: `无效的协议类型`
      };
    }
  } catch (error) {
    ctx.body = {
      success: false,
      message: `操作失败: ${error.message}`
    };
  }
});

// 更新默认DNS协议
router.post('/dns-security/update-default-protocol', requireAuth, async (ctx) => {
  const { defaultProtocol } = ctx.request.body;
  
  if (!defaultProtocol) {
    ctx.body = {
      success: false,
      message: '请提供有效的默认协议'
    };
    return;
  }
  
  try {
    // 确保协议有效
    if (!['standard', 'custom', 'dot', 'doh', 'doq'].includes(defaultProtocol)) {
      ctx.body = {
        success: false,
        message: '无效的协议类型'
      };
      return;
    }
    
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 保存原始值以便记录变更
    const oldDefaultProtocol = configData.dns.defaultProtocol || 'standard';
    
    // 更新默认协议
    configData.dns.defaultProtocol = defaultProtocol;
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 更新DNS服务中的默认协议
    dnsService.defaultProtocol = defaultProtocol;
    
    // 记录配置更新
    await errorLogger.logDnsConfigOperation('更新默认DNS协议', {
      from: oldDefaultProtocol,
      to: defaultProtocol,
      clientIp: ctx.request.ip
    });
    
    ctx.body = {
      success: true,
      message: `默认DNS协议已更新为 ${defaultProtocol}`
    };
  } catch (error) {
    await errorLogger.logError('更新默认DNS协议', error, {
      requestBody: ctx.request.body
    });
    
    ctx.body = {
      success: false,
      message: `更新默认DNS协议失败: ${error.message}`
    };
  }
});

// 更新DNS回退顺序
router.post('/dns-security/update-fallback-order', requireAuth, async (ctx) => {
  const { fallbackOrder } = ctx.request.body;
  
  if (!Array.isArray(fallbackOrder) || fallbackOrder.length === 0) {
    ctx.body = {
      success: false,
      message: '请提供有效的回退顺序数组'
    };
    return;
  }
  
  try {
    // 确保所有协议有效
    const validProtocols = ['standard', 'custom', 'dot', 'doh', 'doq'];
    const invalidProtocols = fallbackOrder.filter(protocol => !validProtocols.includes(protocol));
    
    if (invalidProtocols.length > 0) {
      ctx.body = {
        success: false,
        message: `无效的协议类型: ${invalidProtocols.join(', ')}`
      };
      return;
    }
    
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 保存原始值以便记录变更
    const oldFallbackOrder = configData.dns.fallbackOrder || ['standard'];
    
    // 更新回退顺序
    configData.dns.fallbackOrder = fallbackOrder;
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 更新DNS服务中的回退顺序
    dnsService.fallbackOrder = fallbackOrder;
    
    // 记录配置更新
    await errorLogger.logDnsConfigOperation('更新DNS回退顺序', {
      from: oldFallbackOrder,
      to: fallbackOrder,
      clientIp: ctx.request.ip
    });
    
    ctx.body = {
      success: true,
      message: `DNS回退顺序已更新`
    };
  } catch (error) {
    await errorLogger.logError('更新DNS回退顺序', error, {
      requestBody: ctx.request.body
    });
    
    ctx.body = {
      success: false,
      message: `更新DNS回退顺序失败: ${error.message}`
    };
  }
});

// 更新拦截域名列表
router.post('/dns/update-blocked-domains', requireAuth, async (ctx) => {
  const { blockedDomains } = ctx.request.body;
  
  if (!Array.isArray(blockedDomains)) {
    ctx.body = {
      success: false,
      message: '拦截域名必须是数组格式'
    };
    return;
  }
  
  // 记录开始更新拦截域名
  await errorLogger.logDnsConfigOperation('开始更新拦截域名列表', {
    count: blockedDomains.length,
    clientIp: ctx.request.ip
  });
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS安全配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 更新拦截域名列表
    if (!configData.dns.security) {
      configData.dns.security = {};
    }
    
    const oldBlockedDomains = configData.dns.security.blockedDomains || [];
    configData.dns.security.blockedDomains = blockedDomains;
    
    // 记录配置更新前后的变化
    await errorLogger.logDnsConfigOperation('拦截域名列表内容更新', {
      oldCount: oldBlockedDomains.length,
      newCount: blockedDomains.length,
      added: blockedDomains.filter(domain => !oldBlockedDomains.includes(domain)),
      removed: oldBlockedDomains.filter(domain => !blockedDomains.includes(domain))
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 记录配置文件已更新
    await errorLogger.logDnsConfigOperation('拦截域名配置文件写入成功', {
      configPath
    });
    
    // 重新加载DNS服务的拦截域名列表
    const reloadResult = dnsService.reloadBlockedDomains();
    
    // 记录重载结果
    await errorLogger.logDnsConfigOperation('DNS服务重新加载拦截域名列表', {
      success: reloadResult,
      count: blockedDomains.length
    });
    
    // 不再尝试重启DNS服务，而是直接返回成功
      ctx.body = {
        success: true,
      message: '拦截域名列表已更新并即时生效',
        count: blockedDomains.length
      };
  } catch (error) {
    await errorLogger.logError('更新拦截域名列表', error, {
      requestBody: ctx.request.body
    });
    
    ctx.body = {
      success: false,
      message: `更新拦截域名失败: ${error.message}`
    };
  }
});

// 更新上游DNS服务器
router.post('/dns/update-upstream', requireAuth, async (ctx) => {
  const { upstreamServers } = ctx.request.body;
  
  if (!Array.isArray(upstreamServers)) {
    ctx.body = {
      success: false,
      message: '上游DNS服务器必须是数组格式'
    };
    return;
  }
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 更新上游DNS服务器
    configData.dns.upstream = upstreamServers;
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 更新dnsService实例中的配置，使更改立即生效
    try {
      // 使用新的reloadUpstreamServers方法重新加载上游DNS服务器配置
      if (dnsService.reloadUpstreamServers) {
        const reloadResult = dnsService.reloadUpstreamServers();
        console.log('重新加载上游DNS服务器配置结果:', reloadResult ? '成功' : '失败');
    
    ctx.body = {
      success: true,
          message: '上游DNS服务器已更新并立即生效',
      count: upstreamServers.length
    };
      } else {
        // 如果方法不存在，则使用旧方式
        const dnsService = require('../../services/dnsService');
        
        // 确保dnsConfig存在
        if (!dnsService.dnsConfig) {
          dnsService.dnsConfig = {};
        }
        
        // 更新上游DNS服务器
        dnsService.dnsConfig.upstream = upstreamServers;
        
        ctx.body = {
          success: true,
          message: '上游DNS服务器已更新并立即生效',
          count: upstreamServers.length
        };
      }
    } catch (error) {
      console.error('更新dnsService内存配置失败:', error);
      ctx.body = {
        success: true,
        message: '上游DNS服务器已保存到配置文件，但需要重启服务才能生效',
        error: error.message,
        count: upstreamServers.length
      };
    }
  } catch (error) {
    ctx.body = {
      success: false,
      message: `更新上游DNS服务器失败: ${error.message}`
    };
  }
});

// 获取DNS配置操作日志
router.get('/dns/config-logs', requireAuth, async (ctx) => {
  try {
    // 获取查询参数
    const file = ctx.query.file; // 特定日志文件名
    
    // 获取日志目录
    const logDir = path.join(__dirname, '../../logs');
    
    // 如果指定了file参数且不是'current'，则读取特定文件
    if (file && file !== 'current') {
      // 安全检查：确保file参数是一个有效的日志文件名
      const validLogFilePattern = /^dns_config(_\d{4}-\d{2}-\d{2})?\.log$/;
      if (!validLogFilePattern.test(file)) {
        ctx.body = {
          success: false,
          message: '无效的日志文件名'
        };
        return;
      }
      
      // 读取指定的日志文件
      const logFilePath = path.join(logDir, file);
      try {
        // 检查文件是否存在
        await fs.access(logFilePath);
        
        // 读取文件内容
        const content = await fs.readFile(logFilePath, 'utf8');
        const logEntries = content
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => {
            try {
              return JSON.parse(line);
            } catch (error) {
              return { error: 'Invalid log entry', raw: line };
            }
          });
        
        ctx.body = {
          success: true,
          logs: logEntries
        };
      } catch (error) {
        ctx.body = {
          success: false,
          message: `读取日志文件失败: ${error.message}`
        };
      }
      return;
    }
    
    // 默认行为：获取最近的日志和可用的日志文件列表
    const logs = await errorLogger.getRecentDnsConfigLogs();
    
    // 获取可用的日志文件列表
    let logFiles = [];
    try {
      const files = await fs.readdir(logDir);
      // 筛选DNS配置日志文件
      const configLogPattern = /^dns_config(_\d{4}-\d{2}-\d{2})?\.log$/;
      logFiles = files
        .filter(file => configLogPattern.test(file))
        .sort((a, b) => {
          // 提取日期，格式为YYYY-MM-DD
          const dateA = a.match(/_(\d{4}-\d{2}-\d{2})\.log$/);
          const dateB = b.match(/_(\d{4}-\d{2}-\d{2})\.log$/);
          
          // 如果是旧格式的日志文件（不带日期），放到列表最后
          if (!dateA) return 1;
          if (!dateB) return -1;
          
          // 按日期降序排序
          return dateB[1].localeCompare(dateA[1]);
        });
    } catch (error) {
      console.error('读取日志目录失败:', error);
    }
    
    // 获取当前使用的日志文件名
    const currentLogFile = path.basename(errorLogger.dnsConfigLogFile);
    
    ctx.body = {
      success: true,
      logs,
      logFiles,
      currentLogFile
    };
  } catch (error) {
    ctx.body = {
      success: false,
      message: `获取DNS配置日志失败: ${error.message}`
    };
  }
});

// 更新DNS服务器配置（端口和协议）
router.post('/dns/update-server-config', requireAuth, async (ctx) => {
  const { port, protocol, recursion } = ctx.request.body;
  
  if (!port || !protocol) {
    ctx.body = {
      success: false,
      message: '缺少必要的DNS服务器配置信息'
    };
    return;
  }
  
  // 记录配置更新开始
  await errorLogger.logDnsConfigOperation('更新DNS服务器配置开始', {
    port,
    protocol,
    recursion,
    requestId: Date.now().toString(),
    clientIp: ctx.request.ip
  });
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 确保server配置存在
    if (!configData.dns.server) {
      configData.dns.server = {};
    }
    
    // 更新端口
    configData.dns.server.port = parseInt(port);
    
    // 更新协议
    switch (protocol) {
      case 'both':
        configData.dns.server.tcp = true;
        configData.dns.server.udp = true;
        break;
      case 'tcp':
        configData.dns.server.tcp = true;
        configData.dns.server.udp = false;
        break;
      case 'udp':
        configData.dns.server.tcp = false;
        configData.dns.server.udp = true;
        break;
    }
    
    // 更新递归查询设置
    if (typeof recursion === 'boolean') {
      configData.dns.server.recursion = recursion;
    }
    
    // 记录配置更新细节
    await errorLogger.logDnsConfigOperation('准备写入DNS服务器配置', {
      configPath,
      serverConfig: configData.dns.server
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 记录配置文件写入成功
    await errorLogger.logDnsConfigOperation('DNS服务器配置文件写入成功', {
      configPath
    });
    
    // 直接更新dnsService实例的配置 - 这样不需要重启服务也能生效
    try {
      // 使用新的reloadDnsServerConfig方法重新加载DNS服务器配置
      if (dnsService.reloadDnsServerConfig) {
        const reloadResult = dnsService.reloadDnsServerConfig();
        console.log('重新加载DNS服务器配置结果:', reloadResult ? '成功' : '失败');
      } else {
        // 如果方法不存在，则使用旧方式更新
        const dnsService = require('../../services/dnsService');
        
        // 更新配置内存中的副本
        if (!dnsService.dnsConfig) {
          dnsService.dnsConfig = {};
        }
        if (!dnsService.dnsConfig.server) {
          dnsService.dnsConfig.server = {};
        }
        
        dnsService.dnsConfig.server.port = parseInt(port);
        
        // 更新协议设置
        switch (protocol) {
          case 'both':
            dnsService.dnsConfig.server.tcp = true;
            dnsService.dnsConfig.server.udp = true;
            break;
          case 'tcp':
            dnsService.dnsConfig.server.tcp = true;
            dnsService.dnsConfig.server.udp = false;
            break;
          case 'udp':
            dnsService.dnsConfig.server.tcp = false;
            dnsService.dnsConfig.server.udp = true;
            break;
        }
        
        // 更新递归查询设置
        if (typeof recursion === 'boolean') {
          dnsService.dnsConfig.server.recursion = recursion;
        }
      }
      
      ctx.body = {
        success: true,
        message: 'DNS服务器配置已更新并立即生效'
      };
    } catch (error) {
      // 记录内存配置更新失败
      await errorLogger.logError('DNS服务配置内存更新失败', error, {
        step: 'memory_update'
      });
      
      // 如果内存更新失败，则告知需要重启服务
      ctx.body = {
        success: true,
        message: 'DNS服务器配置已保存到文件，但需要重启服务才能完全生效',
        error: error.message
      };
      
      // 重启DNS服务器
        try {
        // 记录准备重启
        await errorLogger.logDnsConfigOperation('准备重启DNS服务器', {
          reason: '应用新的DNS服务器配置'
        });
          
        // 重新加载服务
          const dnsServer = require('../../server');
          
          // 记录开始关闭DNS服务器
          await errorLogger.logDnsConfigOperation('开始关闭DNS服务器', {});
          
          // 关闭当前服务器
          await new Promise((resolve, reject) => {
            // 设置关闭超时
            const closeTimeout = setTimeout(() => {
              errorLogger.logDnsConfigOperation('DNS服务器关闭超时', {});
              resolve(); // 超时后继续执行
            }, 5000);
            
            dnsServer.close((err) => {
              clearTimeout(closeTimeout);
              if (err) {
                errorLogger.logError('DNS服务器关闭', err);
                reject(err);
              } else {
                errorLogger.logDnsConfigOperation('DNS服务器已关闭，准备重启', {});
                resolve();
              }
            });
          });
          
          // 记录开始清除缓存
          await errorLogger.logDnsConfigOperation('清除Node.js模块缓存', {
            modules: ['config.json', 'server']
          });
          
          // 重新加载配置并创建新的服务器
          delete require.cache[require.resolve('../../config.json')];
          delete require.cache[require.resolve('../../server')];
          
          // 记录开始重新加载服务器
          await errorLogger.logDnsConfigOperation('开始重新加载DNS服务器', {});
          
          // 重新启动服务器
          const newServer = require('../../server');
          
          // 记录服务器重启成功
          await errorLogger.logDnsConfigOperation('DNS服务器重启成功', {});
          
          console.log('DNS服务器已成功重启');
      } catch (restartError) {
        await errorLogger.logError('重启DNS服务器失败', restartError);
      ctx.body = {
        success: true,
          message: 'DNS服务器配置已保存到文件，但重启DNS服务器失败',
          error: restartError.message
      };
      }
    }
  } catch (error) {
    await errorLogger.logError('更新DNS服务器配置', error, {
      requestBody: ctx.request.body
    });
    ctx.body = {
      success: false,
      message: `更新DNS服务器配置失败: ${error.message}`
    };
  }
});

// 更新允许的IP地址
router.post('/dns/update-allowed-ips', requireAuth, async (ctx) => {
  const { allowedIPs } = ctx.request.body;
  
  if (!Array.isArray(allowedIPs)) {
    ctx.body = {
      success: false,
      message: '允许的IP地址必须是数组格式'
    };
    return;
  }
  
  // 记录开始更新允许的IP地址
  await errorLogger.logDnsConfigOperation('开始更新允许的IP地址列表', {
    count: allowedIPs.length,
    clientIp: ctx.request.ip
  });
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS安全配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 更新允许的IP地址列表
    if (!configData.dns.security) {
      configData.dns.security = {};
    }
    
    const oldAllowedIPs = configData.dns.security.allowedIPs || [];
    configData.dns.security.allowedIPs = allowedIPs;
    
    // 记录配置更新前后的变化
    await errorLogger.logDnsConfigOperation('允许的IP地址列表内容更新', {
      oldCount: oldAllowedIPs.length,
      newCount: allowedIPs.length,
      added: allowedIPs.filter(ip => !oldAllowedIPs.includes(ip)),
      removed: oldAllowedIPs.filter(ip => !allowedIPs.includes(ip))
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 记录配置文件已更新
    await errorLogger.logDnsConfigOperation('允许的IP地址配置文件写入成功', {
      configPath
    });
    
    // 重新加载DNS服务中的允许IP列表
    const reloadResult = dnsService.reloadAllowedIPs();
    
    // 记录重载结果
    await errorLogger.logDnsConfigOperation('DNS服务重新加载允许的IP地址列表', {
      success: reloadResult,
      count: allowedIPs.length
    });
    
    // 不再尝试重启DNS服务，而是直接返回成功
      ctx.body = {
        success: true,
      message: '允许的IP地址列表已更新并即时生效',
        count: allowedIPs.length
      };
  } catch (error) {
    await errorLogger.logError('更新允许的IP地址列表', error, {
      requestBody: ctx.request.body
    });
    
    ctx.body = {
      success: false,
      message: `更新允许的IP地址失败: ${error.message}`
    };
  }
});

// 更新速率限制设置
router.post('/dns/update-rate-limit', requireAuth, async (ctx) => {
  const { enableRateLimit, rateLimitThreshold } = ctx.request.body;
  
  if (typeof enableRateLimit !== 'boolean' || (typeof rateLimitThreshold !== 'number' && rateLimitThreshold !== null)) {
    ctx.body = {
      success: false,
      message: '缺少必要的速率限制配置信息或格式不正确'
    };
    return;
  }
  
  // 记录开始更新速率限制设置
  await errorLogger.logDnsConfigOperation('开始更新速率限制设置', {
    enableRateLimit,
    rateLimitThreshold,
    clientIp: ctx.request.ip
  });
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS安全配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 更新速率限制设置
    if (!configData.dns.security) {
      configData.dns.security = {};
    }
    
    // 保存原始值以便记录变更
    const oldEnableRateLimit = configData.dns.security.rateLimit ? configData.dns.security.rateLimit.enable : false;
    const oldRateLimitThreshold = configData.dns.security.rateLimit ? configData.dns.security.rateLimit.threshold : 0;
    
    // 确保rateLimit对象存在
    if (!configData.dns.security.rateLimit) {
      configData.dns.security.rateLimit = {};
    }
    
    // 确保更新的值被处理为数字，即使是默认值1000
    const newThreshold = parseInt(rateLimitThreshold);
    
    // 更新设置
    configData.dns.security.rateLimit.enable = enableRateLimit;
    configData.dns.security.rateLimit.threshold = newThreshold;
    
    // 记录配置更新前后的变化
    await errorLogger.logDnsConfigOperation('速率限制设置内容更新', {
      changes: {
        enableRateLimit: {
          from: oldEnableRateLimit,
          to: enableRateLimit
        },
        rateLimitThreshold: {
          from: oldRateLimitThreshold,
          to: newThreshold
        }
      }
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 记录配置文件已更新
    await errorLogger.logDnsConfigOperation('速率限制设置配置文件写入成功', {
      configPath,
      enableRateLimit,
      threshold: newThreshold
    });
    
    // 重新加载DNS服务中的速率限制设置
    const reloadResult = dnsService.reloadRateLimit();
    
    // 记录重载结果
    await errorLogger.logDnsConfigOperation('DNS服务重新加载速率限制设置', {
      success: reloadResult,
      enableRateLimit,
      rateLimitThreshold: newThreshold
    });
    
    // 返回成功
      ctx.body = {
        success: true,
      message: '速率限制设置已更新并即时生效',
        enableRateLimit,
        rateLimitThreshold: newThreshold
      };
  } catch (error) {
    await errorLogger.logError('更新速率限制设置', error, {
      requestBody: ctx.request.body
    });
    
    ctx.body = {
      success: false,
      message: `更新速率限制设置失败: ${error.message}`
    };
  }
});

// 更新DNSSEC设置
router.post('/dns/update-dnssec', requireAuth, async (ctx) => {
  const { enableDNSSEC } = ctx.request.body;
  
  if (typeof enableDNSSEC !== 'boolean') {
    ctx.body = {
      success: false,
      message: '缺少必要的DNSSEC设置信息或格式不正确'
    };
    return;
  }
  
  // 记录开始更新DNSSEC设置
  await errorLogger.logDnsConfigOperation('开始更新DNSSEC设置', {
    enableDNSSEC,
    clientIp: ctx.request.ip
  });
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS安全配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 更新DNSSEC设置
    if (!configData.dns.security) {
      configData.dns.security = {};
    }
    
    // 保存原始值以便记录变更
    const oldEnableDNSSEC = configData.dns.security.dnssec ? configData.dns.security.dnssec.enable : false;
    
    // 确保dnssec对象存在
    if (!configData.dns.security.dnssec) {
      configData.dns.security.dnssec = {};
    }
    
    // 更新设置
    configData.dns.security.dnssec.enable = enableDNSSEC;
    
    // 记录配置更新前后的变化
    await errorLogger.logDnsConfigOperation('DNSSEC设置内容更新', {
      changes: {
        enableDNSSEC: {
          from: oldEnableDNSSEC,
          to: enableDNSSEC
        }
      }
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 记录配置文件已更新
    await errorLogger.logDnsConfigOperation('DNSSEC设置配置文件写入成功', {
      configPath,
      enableDNSSEC
    });
    
    // 重新加载DNS服务中的DNSSEC设置
    const reloadResult = dnsService.reloadDNSSEC ? dnsService.reloadDNSSEC() : true;
    
    // 记录重载结果
    await errorLogger.logDnsConfigOperation('DNS服务重新加载DNSSEC设置', {
      success: reloadResult,
      enableDNSSEC
    });
    
    // 返回成功
      ctx.body = {
        success: true,
      message: 'DNSSEC设置已更新并即时生效',
        enableDNSSEC
      };
  } catch (error) {
    await errorLogger.logError('更新DNSSEC设置', error, {
      requestBody: ctx.request.body
    });
    
    ctx.body = {
      success: false,
      message: `更新DNSSEC设置失败: ${error.message}`
    };
  }
});

// 更新日志设置
router.post('/dns/update-logging', requireAuth, async (ctx) => {
  const { logLevel, logQueries, logResponses, logRotation, logRetention, debug } = ctx.request.body;
  
  if (!logLevel || typeof logQueries !== 'boolean' || typeof logResponses !== 'boolean' || !logRotation || !logRetention) {
    ctx.body = {
      success: false,
      message: '缺少必要的日志配置信息或格式不正确'
    };
    return;
  }
  
  // 记录开始更新日志设置
  await errorLogger.logDnsConfigOperation('开始更新日志设置', {
    logLevel,
    logQueries,
    logResponses,
    logRotation,
    logRetention,
    debug,
    clientIp: ctx.request.ip
  });
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 更新日志设置
    if (!configData.dns.logging) {
      configData.dns.logging = {};
    }
    
    // 保存原始值以便记录变更
    const oldSettings = { ...configData.dns.logging };
    const oldDebug = configData.dns.debug;
    
    // 更新设置
    configData.dns.logging.level = logLevel;
    configData.dns.logging.logQueries = logQueries;
    configData.dns.logging.logResponses = logResponses;
    configData.dns.logging.rotation = logRotation;
    configData.dns.logging.retention = parseInt(logRetention);
    
    // 更新调试模式设置
    if (typeof debug === 'boolean') {
      configData.dns.debug = debug;
    }
    
    // 记录配置更新前后的变化
    await errorLogger.logDnsConfigOperation('日志设置内容更新', {
      changes: {
        level: {
          from: oldSettings.level || 'info',
          to: logLevel
        },
        logQueries: {
          from: oldSettings.logQueries,
          to: logQueries
        },
        logResponses: {
          from: oldSettings.logResponses,
          to: logResponses
        },
        rotation: {
          from: oldSettings.rotation || 'daily',
          to: logRotation
        },
        retention: {
          from: oldSettings.retention || 30,
          to: parseInt(logRetention)
        },
        debug: {
          from: oldDebug,
          to: debug
        }
      }
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 记录配置文件已更新
    await errorLogger.logDnsConfigOperation('日志设置配置文件写入成功', {
      configPath,
      settings: configData.dns.logging,
      debug: configData.dns.debug
    });
    
    // 直接更新内存中的配置，不需要重启
    const reloadResult = dnsService.reloadLogging ? dnsService.reloadLogging() : false;
    
    // 记录重载结果
    await errorLogger.logDnsConfigOperation('DNS服务重新加载日志设置', {
      success: reloadResult,
      settings: configData.dns.logging,
      debug: configData.dns.debug
    });
      
      ctx.body = {
        success: true,
      message: '日志设置已更新并即时生效',
      settings: configData.dns.logging,
      debug: configData.dns.debug
      };
  } catch (error) {
    await errorLogger.logError('更新日志设置', error, {
      requestBody: ctx.request.body
    });
    
      ctx.body = {
      success: false,
      message: `更新日志设置失败: ${error.message}`
    };
  }
});

// 单独更新调试模式设置
router.post('/dns/update-debug', requireAuth, async (ctx) => {
  const { debug } = ctx.request.body;
  
  if (typeof debug !== 'boolean') {
    ctx.body = {
      success: false,
      message: '调试模式参数必须是布尔值'
    };
    return;
  }
  
  // 记录开始更新调试模式设置
  await errorLogger.logDnsConfigOperation('开始更新调试模式设置', {
    debug,
    clientIp: ctx.request.ip
  });
  
  try {
    // 更新config.json
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保DNS配置存在
    if (!configData.dns) {
      configData.dns = {};
    }
    
    // 保存原始值以便记录变更
    const oldDebug = configData.dns.debug;
    
    // 更新调试模式设置
    configData.dns.debug = debug;
    
    // 记录配置更新前后的变化
    await errorLogger.logDnsConfigOperation('调试模式设置更新', {
      changes: {
        debug: {
          from: oldDebug,
          to: debug
        }
      }
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 记录配置文件已更新
    await errorLogger.logDnsConfigOperation('调试模式设置配置文件写入成功', {
      configPath,
      debug: configData.dns.debug
    });
    
    // 直接更新内存中的配置，不需要重启
    const reloadResult = dnsService.reloadLogging ? dnsService.reloadLogging() : false;
    
    // 记录重载结果
    await errorLogger.logDnsConfigOperation('DNS服务重新加载调试模式设置', {
      success: reloadResult,
      debug: configData.dns.debug
    });
    
    ctx.body = {
      success: true,
      message: '调试模式设置已更新并即时生效',
      debug: configData.dns.debug
    };
  } catch (error) {
    await errorLogger.logError('更新调试模式设置', error, {
      requestBody: ctx.request.body
    });
    
    ctx.body = {
      success: false,
      message: `更新调试模式设置失败: ${error.message}`
    };
  }
});

// 更新常规设置
router.post('/system/update-general-settings', requireAuth, async (ctx) => {
  const { serverName, adminEmail, webPort, language } = ctx.request.body;
  
  try {
    // 验证数据
    if (!serverName || !adminEmail || !webPort) {
      ctx.body = {
        success: false,
        message: '缺少必要的设置信息'
      };
      return;
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail)) {
      ctx.body = {
        success: false,
        message: '管理员邮箱格式不正确'
      };
      return;
    }
    
    // 验证端口范围
    const portNum = parseInt(webPort);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      ctx.body = {
        success: false,
        message: 'Web端口必须是1-65535之间的有效数字'
      };
      return;
    }
    
    // 读取配置文件
    const configPath = path.join(__dirname, '../../config.json');
    const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // 确保server设置存在
    if (!configData.server) {
      configData.server = {};
    }
    
    // 更新Web服务器端口 - 保存到server.port
    configData.server.port = portNum;
    
    // 如果没有general字段，则创建
    if (!configData.general) {
      configData.general = {};
    }
    
    // 更新常规设置
    configData.general.serverName = serverName;
    configData.general.adminEmail = adminEmail;
    configData.general.language = language || 'zh-CN';
    
    // 记录操作日志
    await errorLogger.logDnsConfigOperation('更新常规设置', {
      serverName,
      adminEmail,
      webPort: portNum,
      language
    });
    
    // 写入文件
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    // 更新dnsService实例中的常规设置，使更改立即生效
    try {
      // 使用新的reloadGeneralConfig方法重新加载常规设置
      if (dnsService.reloadGeneralConfig) {
        const reloadResult = dnsService.reloadGeneralConfig();
        console.log('重新加载常规设置结果:', reloadResult ? '成功' : '失败');
      } else {
        // 如果方法不存在，则使用旧方式
        if (!dnsService.generalConfig) {
          dnsService.generalConfig = {};
        }
        
        // 更新常规设置
        dnsService.generalConfig = { ...configData.general };
        
        console.log('已更新dnsService中的常规设置');
      }
    } catch (error) {
      console.error('更新dnsService常规设置失败:', error);
    }
    
    ctx.body = {
      success: true,
      message: '常规设置已更新',
      data: {
        serverName,
        adminEmail,
        webPort: portNum,
        language
      }
    };
  } catch (error) {
    // 记录错误日志
    await errorLogger.logError('更新常规设置', error);
    
    ctx.body = {
      success: false,
      message: `更新常规设置失败: ${error.message}`
    };
  }
});

// 获取服务器信息API
router.get('/system/server-info', requireAuth, async (ctx) => {
  try {
    // 从配置文件中读取服务器信息
    ctx.body = {
      success: true,
      port: config.server.port,
      host: config.server.host,
      version: config.app ? config.app.version : '1.2.3'
    };
  } catch (error) {
    ctx.body = {
      success: false,
      message: `获取服务器信息失败: ${error.message}`
    };
  }
});

// 新增：获取系统设置API
router.get('/system/settings', requireAuth, async (ctx) => {
  try {
    // 从文件系统中直接读取最新的配置
    const configPath = path.join(__dirname, '../../config.json');
    const latestConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    ctx.body = {
      success: true,
      data: {
        general: latestConfig.general || {},
        server: latestConfig.server || {},
        dns: {
          server: latestConfig.dns.server,
          upstream: latestConfig.dns.upstream,
          security: latestConfig.dns.security,
          logging: latestConfig.dns.logging,
          cache: latestConfig.dns.cache,
          debug: latestConfig.dns.debug
        }
      }
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: `获取系统设置失败: ${error.message}`
    };
  }
});

// 导入其他API路由模块
const dnsApiRouter = require('./dns');

// 使用API路由
router.use(dnsApiRouter.routes(), dnsApiRouter.allowedMethods());

module.exports = router; 