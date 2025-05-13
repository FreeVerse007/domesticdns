/**
 * DNS服务器启动脚本
 */
const dnsService = require('./services/dnsService');
const config = require('./config.json');
const dnsConfig = config.dns; // 从config.json中获取dns配置
const dnsRecordModel = require('./models/dnsRecordModel');
const dnsLogModel = require('./models/dnsLogModel');
const errorLogger = require('./utils/errorLogger');

// 记录服务器启动
errorLogger.logDnsConfigOperation('DNS服务器启动开始', {
  config: {
    port: dnsConfig.server.port,
    host: dnsConfig.server.host,
    tcp: dnsConfig.server.tcp,
    udp: dnsConfig.server.udp
  }
});

// 导入预设的自定义记录
const { customRecords } = dnsConfig;
if (customRecords && Object.keys(customRecords).length > 0) {
  console.log('正在加载自定义DNS记录...');
  
  for (const [domain, value] of Object.entries(customRecords)) {
    try {
      dnsRecordModel.addRecord(domain, 'A', value);
      console.log(`已加载自定义记录: ${domain} -> ${value}`);
    } catch (error) {
      console.error(`加载自定义记录失败: ${domain}`, error.message);
      errorLogger.logError('加载自定义记录', error, { domain, value });
    }
  }
}

// 打印DNS服务支持的协议信息
const supportedProtocols = dnsService.getSupportedProtocols();
console.log('===== DNS服务器初始化 =====');
console.log('DNS服务支持的协议:');
Object.entries(supportedProtocols).forEach(([protocol, supported]) => {
  console.log(`  - ${protocol}: ${supported ? '已启用' : '未启用'}`);
});
console.log(`默认使用协议: ${dnsConfig.defaultProtocol || 'standard'}`);
console.log(`协议回退顺序: ${dnsConfig.fallbackOrder.join(' -> ') || 'standard'}`);
console.log('=============================');

// 创建DNS服务器
let dnsServer;
try {
  errorLogger.logDnsConfigOperation('创建DNS服务器实例', {
    udp: dnsConfig.server.udp,
    tcp: dnsConfig.server.tcp
  });
  
  dnsServer = dnsService.createServer({
  udp: dnsConfig.server.udp,
  tcp: dnsConfig.server.tcp
});
  
  errorLogger.logDnsConfigOperation('DNS服务器实例创建成功', {});
} catch (error) {
  errorLogger.logError('创建DNS服务器实例', error);
  console.error('创建DNS服务器实例失败:', error);
  process.exit(1);
}

// 启动服务器
try {
  errorLogger.logDnsConfigOperation('启动DNS服务器', {
    udp: {
      port: dnsConfig.server.port,
      address: dnsConfig.server.host
    },
    tcp: {
      port: dnsConfig.server.port,
      address: dnsConfig.server.host
    }
  });
  
dnsServer.listen({
  udp: {
    port: dnsConfig.server.port,
    address: dnsConfig.server.host
  },
  tcp: {
    port: dnsConfig.server.port,
    address: dnsConfig.server.host
  }
});
  
  errorLogger.logDnsConfigOperation('DNS服务器启动成功', {
    host: dnsConfig.server.host,
    port: dnsConfig.server.port,
    protocols: {
      tcp: dnsConfig.server.tcp,
      udp: dnsConfig.server.udp
    }
  });

console.log(`DNS服务器已启动: ${dnsConfig.server.host}:${dnsConfig.server.port}`);
} catch (error) {
  errorLogger.logError('启动DNS服务器', error);
  console.error('启动DNS服务器失败:', error);
  process.exit(1);
}

// 错误处理
dnsServer.on('error', (error) => {
  console.error('DNS服务器错误:', error);
  
  // 记录错误日志
  errorLogger.logError('DNS服务器运行时错误', error);
  
  dnsLogModel.addLog({
    type: 'ERROR',
    source: 'dns-server',
    success: false,
    error: error.message
  });
});

// 请求处理日志
dnsServer.on('request', (request, response, protocol, rinfo) => {
  if (request.questions.length > 0) {
    const question = request.questions[0];
    const clientIp = rinfo ? rinfo.address : '127.0.0.1';
    
    console.log(`DNS ${protocol.toUpperCase()} 查询: ${question.name} (${question.type}) 来自 ${clientIp}`);
  }
});

// 监听服务器关闭事件
dnsServer.on('close', () => {
  errorLogger.logDnsConfigOperation('DNS服务器已关闭', {
    time: new Date().toISOString()
  });
  console.log('DNS服务器已关闭');
});

// 测试各个安全DNS协议连接
async function testSecureDNSConnections() {
  console.log('正在测试安全DNS协议连接...');
  
  // 测试DNS over TLS (DoT)
  if (supportedProtocols.dot) {
    try {
      console.log('测试DNS over TLS连接...');
      for (const server of dnsConfig.dot.servers) {
        const result = await dnsService.testDoTConnection(server.host, server.port, server.servername);
        console.log(`DoT服务器 ${server.host}:${server.port} 测试结果:`, 
          result.valid ? '有效' : '无效', 
          result.fingerprint ? `指纹: ${result.fingerprint}` : '');
      }
    } catch (error) {
      console.error('DoT连接测试失败:', error.message);
      errorLogger.logError('DoT连接测试', error);
    }
  }
  
  // 测试DNS over HTTPS (DoH)
  if (supportedProtocols.doh) {
    try {
      console.log('测试DNS over HTTPS连接...');
      for (const server of dnsConfig.doh.servers) {
        const result = await dnsService.testDoHConnection(server.host, server.path);
        console.log(`DoH服务器 ${server.host}${server.path} 测试结果:`, 
          result.success ? `成功 (${result.responseTime}ms)` : `失败: ${result.error}`);
      }
    } catch (error) {
      console.error('DoH连接测试失败:', error.message);
      errorLogger.logError('DoH连接测试', error);
    }
  }
  
  // 测试DNS over QUIC (DoQ)
  if (supportedProtocols.doq) {
    try {
      console.log('测试DNS over QUIC连接...');
      for (const server of dnsConfig.doq.servers) {
        const result = await dnsService.testDoQConnection(server.host, server.port);
        console.log(`DoQ服务器 ${server.host}:${server.port} 测试结果:`, 
          result.available ? '可用' : `不可用: ${result.message}`);
      }
    } catch (error) {
      console.error('DoQ连接测试失败:', error.message);
      errorLogger.logError('DoQ连接测试', error);
    }
  }
  
  console.log('安全DNS协议连接测试完成');
}

// 在服务启动后测试安全DNS连接
setTimeout(testSecureDNSConnections, 1000);

// 处理进程信号
process.on('SIGINT', () => {
  console.log('正在关闭DNS服务器...');
  errorLogger.logDnsConfigOperation('接收到SIGINT信号，正在关闭DNS服务器', {});
  dnsServer.close();
  process.exit();
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  errorLogger.logError('未捕获的异常', error);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  errorLogger.logError('未处理的Promise拒绝', reason instanceof Error ? reason : new Error(String(reason)));
});

module.exports = dnsServer; 