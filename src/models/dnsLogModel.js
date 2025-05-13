/**
 * DNS日志记录模型
 */

// 简单的内存存储，实际应用中可能需要使用数据库
const logs = [];
const MAX_LOGS = 1000; // 最大日志数量限制
const config = require('../config.json');
const fs = require('fs');
const path = require('path');

class DNSLogModel {
  /**
   * 添加DNS查询日志
   * @param {Object} logEntry - 日志条目
   * @returns {Object} - 新增的日志条目
   */
  addLog(logEntry) {
    // 每次从文件读取最新的配置，确保配置更改后立即生效
    try {
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 获取日志设置
      const dnsConfig = configData.dns || {};
      const logging = dnsConfig.logging || {};
      
      // 判断是否为查询日志
      // 查询日志: 任何不是响应的日志都视为查询日志
      const isQueryLog = logEntry.source !== 'response';
      
      // 如果是查询日志且禁用了查询日志记录，则不记录
      if (isQueryLog && logging.logQueries === false) {
        console.log(`[DNS日志] 忽略查询日志，因为logQueries=false: ${logEntry.domain || ''} (${logEntry.type || ''})`);
        return null;
      }
      
      // 如果是响应日志且禁用了响应日志记录，则不记录
      if (!isQueryLog && logging.logResponses === false) {
        console.log(`[DNS日志] 忽略响应日志，因为logResponses=false: ${logEntry.domain || ''} (${logEntry.type || ''})`);
        return null;
      }
    } catch (error) {
      // 如果出错，继续记录日志（确保日志功能不会完全失败）
      console.error('检查日志设置时出错:', error.message);
    }
    
    const log = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      timestamp: new Date(),
      ...logEntry
    };
    
    logs.unshift(log); // 将新日志添加到数组开头
    
    // 限制日志数量
    if (logs.length > MAX_LOGS) {
      logs.pop(); // 移除最旧的日志
    }
    
    return log;
  }
  
  /**
   * 获取所有日志
   * @param {number} limit - 返回的日志数量限制
   * @param {number} skip - 跳过的日志数量
   * @returns {Array} - 日志列表
   */
  getLogs(limit = 100, skip = 0) {
    return logs.slice(skip, skip + limit);
  }
  
  /**
   * 获取日志总数
   * @returns {number} - 日志总数
   */
  getLogsCount() {
    return logs.length;
  }
  
  /**
   * 根据条件筛选日志
   * @param {Object} filters - 筛选条件
   * @param {number} limit - 返回的日志数量限制
   * @param {number} skip - 跳过的日志数量
   * @returns {Array} - 筛选后的日志列表
   */
  filterLogs(filters = {}, limit = 100, skip = 0) {
    let filtered = [...logs];
    
    // 按域名筛选
    if (filters.domain) {
      const domainLower = filters.domain.toLowerCase();
      filtered = filtered.filter(log => 
        log.domain && log.domain.toLowerCase().includes(domainLower)
      );
    }
    
    // 按记录类型筛选
    if (filters.type) {
      filtered = filtered.filter(log => 
        log.type && log.type === filters.type
      );
    }
    
    // 按客户端IP筛选
    if (filters.clientIp) {
      filtered = filtered.filter(log => 
        log.clientIp && log.clientIp.includes(filters.clientIp)
      );
    }
    
    // 按时间范围筛选
    if (filters.startTime) {
      const startTime = new Date(filters.startTime);
      filtered = filtered.filter(log => 
        log.timestamp && new Date(log.timestamp) >= startTime
      );
    }
    
    if (filters.endTime) {
      const endTime = new Date(filters.endTime);
      filtered = filtered.filter(log => 
        log.timestamp && new Date(log.timestamp) <= endTime
      );
    }
    
    // 按状态筛选
    if (filters.status !== undefined) {
      filtered = filtered.filter(log => 
        log.success === filters.status
      );
    }
    
    return filtered.slice(skip, skip + limit);
  }
  
  /**
   * 清空所有日志
   */
  clearLogs() {
    logs.length = 0;
    return true;
  }
}

module.exports = new DNSLogModel(); 