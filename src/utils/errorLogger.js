const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * 详细错误日志记录器
 * 用于记录系统关键操作的详细日志，特别是DNS服务器配置和重启的过程
 */
class ErrorLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.errorLogFile = path.join(this.logDir, 'error.log');
    this.dnsConfigLogFile = this.getDatedLogFilePath();
    this.maxHistoryLogs = 30;
    this.ensureLogDir();
    this.lastRotationCheck = new Date();
    
    setInterval(() => this.checkLogRotation(), 3600000);
  }

  /**
   * 确保日志目录存在
   */
  async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('创建日志目录失败:', error);
    }
  }
  
  /**
   * 获取当前日期格式化的日志文件路径
   */
  getDatedLogFilePath() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    return path.join(this.logDir, `dns_config_${dateStr}.log`);
  }
  
  /**
   * 检查是否需要轮换日志
   */
  async checkLogRotation() {
    try {
      const now = new Date();
      const currentDay = now.toISOString().slice(0, 10);
      const lastDay = this.lastRotationCheck.toISOString().slice(0, 10);
      
      if (currentDay !== lastDay) {
        console.log(`[日志] 轮换DNS配置日志，创建新日志文件: ${this.getDatedLogFilePath()}`);
        this.dnsConfigLogFile = this.getDatedLogFilePath();
        this.lastRotationCheck = now;
        
        await this.cleanupOldLogs();
      }
    } catch (error) {
      console.error('检查日志轮换失败:', error);
    }
  }
  
  /**
   * 清理过期的日志文件
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      
      const configLogPattern = /^dns_config_\d{4}-\d{2}-\d{2}\.log$/;
      const configLogFiles = files
        .filter(file => configLogPattern.test(file))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          date: file.match(/\d{4}-\d{2}-\d{2}/)[0]
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
      
      if (configLogFiles.length > this.maxHistoryLogs) {
        const filesToDelete = configLogFiles.slice(this.maxHistoryLogs);
        for (const file of filesToDelete) {
          try {
            await fs.unlink(file.path);
            console.log(`[日志] 已删除过期日志文件: ${file.name}`);
          } catch (err) {
            console.error(`删除过期日志文件失败: ${file.name}`, err);
          }
        }
      }
    } catch (error) {
      console.error('清理旧日志文件失败:', error);
    }
  }

  /**
   * 记录DNS配置更新日志
   * @param {string} operation - 操作名称
   * @param {Object} details - 操作详情
   */
  async logDnsConfigOperation(operation, details = {}) {
    try {
      await this.checkLogRotation();
      
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        operation,
        ...details,
        system: {
          hostname: os.hostname(),
          platform: os.platform(),
          release: os.release(),
          uptime: os.uptime(),
          freeMem: os.freemem(),
          totalMem: os.totalmem()
        }
      };

      await this.ensureLogDir();
      
      await fs.appendFile(
        this.dnsConfigLogFile,
        JSON.stringify(logEntry) + '\n',
        'utf8'
      );
      
      console.log(`[DNS配置] ${operation}: ${JSON.stringify(details)}`);
      
      return true;
    } catch (error) {
      console.error('记录DNS配置日志失败:', error);
      return false;
    }
  }

  /**
   * 记录一般错误
   * @param {string} source - 错误来源
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   */
  async logError(source, error, context = {}) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        source,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code
        },
        context
      };

      await this.ensureLogDir();
      
      await fs.appendFile(
        this.errorLogFile,
        JSON.stringify(logEntry) + '\n',
        'utf8'
      );
      
      console.error(`[错误] ${source}: ${error.message}`);
      
      return true;
    } catch (logError) {
      console.error('记录错误日志失败:', logError);
      return false;
    }
  }

  /**
   * 读取最近的DNS配置日志
   * @param {number} lines - 要读取的行数
   * @returns {Promise<Array>} - 日志条目数组
   */
  async getRecentDnsConfigLogs(lines = 100) {
    try {
      await this.ensureLogDir();
      
      const today = new Date().toISOString().slice(0, 10);
      const configLogPattern = /^dns_config_\d{4}-\d{2}-\d{2}\.log$/;
      const logFiles = [];
      
      try {
        const files = await fs.readdir(this.logDir);
        const configLogs = files
          .filter(file => configLogPattern.test(file))
          .map(file => ({
            name: file,
            path: path.join(this.logDir, file),
            date: file.match(/\d{4}-\d{2}-\d{2}/)[0]
          }))
          .sort((a, b) => b.date.localeCompare(a.date));
        
        logFiles.push(...configLogs.map(log => log.path));
      } catch (error) {
        console.error('读取日志目录失败:', error);
      }
      
      if (logFiles.length === 0) {
        try {
          const oldLogFile = path.join(this.logDir, 'dns_config.log');
          await fs.access(oldLogFile);
          logFiles.push(oldLogFile);
        } catch (error) {
          return [];
        }
      }
      
      let allLogs = [];
      for (const logFile of logFiles) {
        try {
          const content = await fs.readFile(logFile, 'utf8');
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
          allLogs = [...allLogs, ...logEntries];
        } catch (error) {
          console.warn(`读取日志文件失败: ${logFile}`, error);
        }
      }
      
      allLogs.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return new Date(b.timestamp) - new Date(a.timestamp);
        }
        return 0;
      });
      
      return allLogs.slice(0, lines);
    } catch (error) {
      console.error('读取DNS配置日志失败:', error);
      return [];
    }
  }
}

const errorLogger = new ErrorLogger();
module.exports = errorLogger; 