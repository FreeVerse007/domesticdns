/**
 * DNS日志控制器
 * 处理DNS日志查询和管理
 */
const BaseController = require('./baseController');
const dnsLogModel = require('../models/dnsLogModel');

class DNSLogController extends BaseController {
  /**
   * 获取DNS日志列表
   * @param {Object} ctx - Koa上下文
   */
  async getLogs(ctx) {
    try {
      const { 
        domain, 
        type, 
        clientIp, 
        startTime, 
        endTime, 
        status,
        limit = 100, 
        skip = 0 
      } = ctx.query;
      
      // 如果有任何筛选条件，使用filterLogs方法
      if (domain || type || clientIp || startTime || endTime || status !== undefined) {
        const filters = {};
        
        if (domain) filters.domain = domain;
        if (type) filters.type = type;
        if (clientIp) filters.clientIp = clientIp;
        if (startTime) filters.startTime = startTime;
        if (endTime) filters.endTime = endTime;
        if (status !== undefined) filters.status = status === 'true';
        
        const logs = dnsLogModel.filterLogs(
          filters,
          parseInt(limit, 10),
          parseInt(skip, 10)
        );
        
        // 获取筛选后的总记录数
        const filteredLogs = dnsLogModel.filterLogs(filters, Number.MAX_SAFE_INTEGER, 0);
        const total = filteredLogs.length;
        
        this.success(ctx, {
          logs,
          total,
          filters,
          limit: parseInt(limit, 10),
          skip: parseInt(skip, 10)
        });
      } else {
        // 如果没有筛选条件，使用普通的getLogs方法
      const logs = dnsLogModel.getLogs(
        parseInt(limit, 10),
        parseInt(skip, 10)
      );
      
      const total = dnsLogModel.getLogsCount();
      
      this.success(ctx, {
        logs,
        total,
        limit: parseInt(limit, 10),
        skip: parseInt(skip, 10)
      });
      }
    } catch (error) {
      this.fail(ctx, error.message, 400, error);
    }
  }
  
  /**
   * 根据条件筛选DNS日志
   * @param {Object} ctx - Koa上下文
   */
  async filterLogs(ctx) {
    try {
      const { 
        domain, 
        type, 
        clientIp, 
        startTime, 
        endTime, 
        status,
        limit = 100, 
        skip = 0 
      } = ctx.query;
      
      const filters = {};
      
      if (domain) filters.domain = domain;
      if (type) filters.type = type;
      if (clientIp) filters.clientIp = clientIp;
      if (startTime) filters.startTime = startTime;
      if (endTime) filters.endTime = endTime;
      if (status !== undefined) filters.status = status === 'true';
      
      const logs = dnsLogModel.filterLogs(
        filters,
        parseInt(limit, 10),
        parseInt(skip, 10)
      );
      
      this.success(ctx, {
        logs,
        filters,
        limit: parseInt(limit, 10),
        skip: parseInt(skip, 10)
      });
    } catch (error) {
      this.fail(ctx, error.message, 400, error);
    }
  }
  
  /**
   * 获取日志详情
   * @param {Object} ctx - Koa上下文
   */
  async getLogDetail(ctx) {
    try {
      const { id } = ctx.params;
      
      if (!id) {
        return this.fail(ctx, '日志ID为必填项', 400);
      }
      
      const log = dnsLogModel.getLogById(id);
      
      if (!log) {
        return this.fail(ctx, '未找到指定日志记录', 404);
      }
      
      this.success(ctx, log);
    } catch (error) {
      this.fail(ctx, error.message, 400, error);
    }
  }
  
  /**
   * 清空所有DNS日志
   * @param {Object} ctx - Koa上下文
   */
  async clearLogs(ctx) {
    try {
      dnsLogModel.clearLogs();
      this.success(ctx, null, '日志已清空');
    } catch (error) {
      this.fail(ctx, error.message, 400, error);
    }
  }
  
  /**
   * 获取DNS日志统计信息
   * @param {Object} ctx - Koa上下文
   */
  async getStats(ctx) {
    try {
      console.log('开始获取DNS日志统计信息');
      const logs = dnsLogModel.getLogs(1000, 0);
      console.log(`获取到 ${logs.length} 条日志记录`);
      
      // 基本统计
      const total = logs.length;
      const successCount = logs.filter(log => log.success).length;
      const failCount = total - successCount;
      
      // 按类型统计
      const typeStats = {};
      logs.forEach(log => {
        const type = log.type || 'unknown';
        if (!typeStats[type]) {
          typeStats[type] = { total: 0, success: 0, fail: 0 };
        }
        typeStats[type].total++;
        if (log.success) {
          typeStats[type].success++;
        } else {
          typeStats[type].fail++;
        }
      });
      
      // 按协议统计
      const protocolStats = {};
      logs.forEach(log => {
        const protocol = log.protocol || 'API';
        if (!protocolStats[protocol]) {
          protocolStats[protocol] = 0;
        }
        protocolStats[protocol]++;
      });
      
      // 按响应时间统计
      const responseTimes = logs
        .filter(log => log.responseTime)
        .map(log => log.responseTime);
      
      const avgResponseTime = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;
      
      // 常见域名统计
      const domainCounts = {};
      logs.forEach(log => {
        if (!log.domain) return;
        if (!domainCounts[log.domain]) {
          domainCounts[log.domain] = 0;
        }
        domainCounts[log.domain]++;
      });
      
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => ({ domain, count }));
      
      // 确保即使没有日志记录，也返回有效的结构
      const stats = {
        total,
        successCount,
        failCount,
        successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
        avgResponseTime,
        typeStats: Object.keys(typeStats).length > 0 ? typeStats : { 'unknown': { total: 0, success: 0, fail: 0 } },
        protocolStats: Object.keys(protocolStats).length > 0 ? protocolStats : { 'API': 0 },
        topDomains: topDomains.length > 0 ? topDomains : [{ domain: '暂无数据', count: 0 }]
      };
      
      console.log('统计结果:', stats);
      this.success(ctx, stats);
    } catch (error) {
      console.error('获取DNS日志统计信息失败:', error);
      this.fail(ctx, error.message, 400, error);
    }
  }
}

module.exports = new DNSLogController(); 