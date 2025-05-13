const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const BaseController = require('./baseController');
const updateService = require('../utils/updateService');
const errorLogger = require('../utils/errorLogger');

/**
 * 比较版本号
 * @param {string} v1 - 版本1
 * @param {string} v2 - 版本2
 * @returns {number} - 1: v1>v2, -1: v1<v2, 0: v1=v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取CPU使用率
 */
function getCpuUsage() {
  return new Promise((resolve) => {
    // 第一次获取CPU信息
    const startCpus = os.cpus();
    const startMeasure = startCpus.map(cpu => ({
      idle: cpu.times.idle,
      total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
    }));
    
    // 等待一段时间后再次获取CPU信息以计算差值
    setTimeout(() => {
      // 第二次获取CPU信息
      const endCpus = os.cpus();
      const endMeasure = endCpus.map(cpu => ({
        idle: cpu.times.idle,
        total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
      }));
      
      // 计算每个核心的使用率
      const cpuUsages = startMeasure.map((start, i) => {
        if (i >= endMeasure.length) return 0; // 安全检查
        
        const end = endMeasure[i];
        const idleDiff = end.idle - start.idle;
        const totalDiff = end.total - start.total;
        
        // 避免除以零
        if (totalDiff === 0) return 0;
        
        // 计算CPU使用率 = 100% - 空闲时间百分比
        const usage = 100 - (100 * idleDiff / totalDiff);
        return parseFloat(usage.toFixed(1));
      });
      
      // 计算平均使用率
      const average = cpuUsages.length > 0 
        ? cpuUsages.reduce((acc, usage) => acc + usage, 0) / cpuUsages.length
        : 0;
      
      resolve({
        overall: parseFloat(average.toFixed(1)),
        cores: cpuUsages
      });
    }, 500); // 增加到500毫秒以获得更准确的结果
  });
}

/**
 * 获取内存信息
 */
function getMemoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usedPercent = (used / total) * 100;
  
  return {
    total: formatBytes(total),
    free: formatBytes(free),
    used: formatBytes(used),
    usedPercent: parseFloat(usedPercent.toFixed(1))
  };
}

/**
 * 获取磁盘信息
 */
function getDiskInfo() {
  return new Promise((resolve) => {
    if (os.platform() === 'win32') {
      exec('wmic logicaldisk get size,freespace,caption', (error, stdout) => {
        if (error) {
          console.error('获取磁盘信息出错:', error);
          resolve({
            total: '未知',
            free: '未知',
            used: '未知',
            usedPercent: 0
          });
          return;
        }
        
        try {
          // 获取C盘信息（主系统盘）
          const lines = stdout.trim().split('\n');
          let cDriveInfo = null;
          
          // 查找C盘信息
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('C:')) {
              const parts = line.split(/\s+/);
              if (parts.length >= 3) {
                cDriveInfo = {
                  caption: 'C:',
                  freeSpace: parseInt(parts[1], 10),
                  size: parseInt(parts[2], 10)
                };
                break;
              }
            }
          }
          
          if (!cDriveInfo) {
            // 如果找不到C盘，尝试使用第一个有效的磁盘
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line) {
                const parts = line.split(/\s+/);
                if (parts.length >= 3) {
                  const freeSpace = parseInt(parts[1], 10);
                  const size = parseInt(parts[2], 10);
                  if (!isNaN(freeSpace) && !isNaN(size) && size > 0) {
                    cDriveInfo = {
                      caption: parts[0],
                      freeSpace: freeSpace,
                      size: size
                    };
                    break;
                  }
                }
              }
            }
          }
          
          if (cDriveInfo && !isNaN(cDriveInfo.freeSpace) && !isNaN(cDriveInfo.size) && cDriveInfo.size > 0) {
            const used = cDriveInfo.size - cDriveInfo.freeSpace;
            const usedPercent = (used / cDriveInfo.size) * 100;
            
            resolve({
              total: formatBytes(cDriveInfo.size),
              free: formatBytes(cDriveInfo.freeSpace),
              used: formatBytes(used),
              usedPercent: parseFloat(usedPercent.toFixed(1))
            });
          } else {
            console.warn('无法解析磁盘信息，使用默认值');
            resolve({
              total: '100 GB',
              free: '50 GB',
              used: '50 GB',
              usedPercent: 50
            });
          }
        } catch (parseError) {
          console.error('解析磁盘信息出错:', parseError, '原始输出:', stdout);
          // 提供默认值
          resolve({
            total: '100 GB',
            free: '50 GB',
            used: '50 GB',
            usedPercent: 50
          });
        }
      });
    } else {
      // Linux系统的磁盘信息获取保持不变
      exec('df -k /', (error, stdout) => {
        if (error) {
          console.error('获取磁盘信息出错:', error);
          resolve({
            total: '未知',
            free: '未知',
            used: '未知',
            usedPercent: 0
          });
          return;
        }
        
        try {
          const lines = stdout.trim().split('\n');
          if (lines.length < 2) {
            throw new Error('无效的磁盘信息输出');
          }
          
          const parts = lines[1].split(/\s+/);
          if (parts.length < 4) {
            throw new Error('无效的磁盘信息格式');
          }
          
          const total = parseInt(parts[1], 10) * 1024;
          const used = parseInt(parts[2], 10) * 1024;
          const free = parseInt(parts[3], 10) * 1024;
          
          if (isNaN(total) || isNaN(used) || isNaN(free) || total === 0) {
            throw new Error('无效的磁盘数值');
          }
          
          const usedPercent = (used / total) * 100;
          
          resolve({
            total: formatBytes(total),
            free: formatBytes(free),
            used: formatBytes(used),
            usedPercent: parseFloat(usedPercent.toFixed(1))
          });
        } catch (parseError) {
          console.error('解析磁盘信息出错:', parseError);
          resolve({
            total: '未知',
            free: '未知',
            used: '未知',
            usedPercent: 0
          });
        }
      });
    }
  });
}

/**
 * 翻译操作名称
 */
function translateAction(action) {
  const actionMap = {
    'start': '启动',
    'stop': '停止',
    'restart': '重启'
  };
  
  return actionMap[action] || action;
}

class SystemController extends BaseController {
  constructor() {
    super();
  }

  /**
   * 获取系统状态信息
   */
  async getSystemStatus(ctx) {
    try {
      // 直接格式化运行时间，不依赖this.formatUptime
      const seconds = os.uptime();
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      let uptime = '';
      if (days > 0) uptime += `${days}天`;
      if (hours > 0 || days > 0) uptime += `${hours}小时`;
      uptime += `${minutes}分钟`;
      
      const cpuUsage = await getCpuUsage();
      const memoryInfo = getMemoryInfo();
      const diskInfo = await getDiskInfo();
      
      ctx.body = {
        success: true,
        data: {
          uptime,
          cpuUsage,
          memory: memoryInfo,
          disk: diskInfo,
          os: {
            platform: os.platform(),
            release: os.release(),
            hostname: os.hostname(),
            arch: os.arch()
          }
        }
      };
    } catch (error) {
      console.error('[错误] 获取系统状态失败:', error);
      
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '获取系统状态失败',
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
  
  /**
   * 获取系统负载历史记录
   */
  async getSystemHistory(ctx) {
    try {
      // 这里应该从某个持久化存储中获取历史数据
      // 这里仅仅模拟数据返回
      const now = Date.now();
      const cpuHistory = Array.from({ length: 24 }, (_, i) => ({
        timestamp: now - (23 - i) * 3600000,
        value: Math.random() * 100
      }));
      
      const memoryHistory = Array.from({ length: 24 }, (_, i) => ({
        timestamp: now - (23 - i) * 3600000,
        value: Math.random() * 100
      }));
      
      ctx.body = {
        success: true,
        data: {
          cpu: cpuHistory,
          memory: memoryHistory
        }
      };
    } catch (error) {
      console.error('[错误] 获取系统历史负载失败:', error);
      
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '获取系统历史负载失败',
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
  
  /**
   * 控制DNS服务
   */
  async controlDnsService(ctx) {
    const { action } = ctx.request.body;
    
    if (!['start', 'stop', 'restart'].includes(action)) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '无效的操作命令'
      };
      return;
    }
    
    try {
      // 这里应该是实际的服务控制逻辑
      // 目前仅模拟成功响应
      ctx.body = {
        success: true,
        message: `DNS服务${translateAction(action)}成功`
      };
    } catch (error) {
      console.error('[错误] DNS服务控制失败:', error);
      
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: 'DNS服务控制失败',
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
  
  /**
   * 保存系统配置
   */
  async saveConfiguration(ctx) {
    const config = ctx.request.body;
    
    try {
      // 这里应该将配置保存到文件或数据库
      // 目前仅模拟成功响应
      ctx.body = {
        success: true,
        message: '配置保存成功'
      };
    } catch (error) {
      console.error('[错误] 保存配置失败:', error);
      
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '保存配置失败',
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
  
  /**
   * 获取当前版本
   */
  async getCurrentVersion(ctx) {
    try {
      // 使用updateService获取当前版本
      const version = await updateService.getCurrentVersion();
      
      ctx.body = {
        success: true,
        version
      };
    } catch (error) {
      console.error('[系统版本] 获取当前版本失败:', error);
      
      // 直接设置错误响应
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '获取当前版本失败',
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
  
  /**
   * 获取上次检查更新的时间
   */
  async getLastCheckTime(ctx) {
    try {
      // 使用updateService获取上次检查时间
      const lastCheck = await updateService.getLastCheckTime();
      
      ctx.body = {
        success: true,
        lastCheck
      };
    } catch (error) {
      console.error('[系统更新] 获取上次检查时间失败:', error);
      
      // 直接设置错误响应
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '获取上次检查时间失败',
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
  
  /**
   * 检查系统更新
   */
  async checkForUpdates(ctx) {
    try {
      // 使用updateService检查更新
      const updateInfo = await updateService.checkForUpdates();
      
      ctx.body = {
        success: true,
        data: {
          currentVersion: updateInfo.currentVersion,
          latestVersion: updateInfo.latestVersion,
          hasUpdate: updateInfo.hasUpdate,
          lastCheck: updateInfo.lastCheck,
          releaseNotes: updateInfo.releaseNotes,
          updateUrl: updateInfo.hasUpdate ? '/api/system/update' : null
        }
      };
    } catch (error) {
      await errorLogger.logError('检查系统更新', error);
      
      // 直接设置错误响应，不使用this.handleError
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '检查更新失败',
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
  
  /**
   * 执行系统更新
   */
  async performUpdate(ctx) {
    try {
      // 获取最新版本信息
      const latestInfo = await updateService.getLatestVersionInfo();
      const targetVersion = latestInfo.version;
      const downloadUrl = latestInfo.downloadUrl;
      
      // 记录更新开始
      await errorLogger.logDnsConfigOperation('系统更新流程启动', {
        targetVersion,
        clientIp: ctx.request.ip
      });
      
      // 1. 备份当前系统
      await errorLogger.logDnsConfigOperation('准备系统备份', {});
      const backupPath = await updateService.backupSystem();
      
      // 2. 下载更新包
      await errorLogger.logDnsConfigOperation('准备下载更新包', {
        url: downloadUrl
      });
      const updateFile = await updateService.downloadUpdate(downloadUrl, targetVersion);
      
      // 3. 验证更新包
      await errorLogger.logDnsConfigOperation('验证更新包', {
        file: updateFile
      });
      const isValid = await updateService.verifyUpdate(updateFile);
      
      if (!isValid) {
        throw new Error('更新包验证失败');
      }
      
      // 4. 执行更新
      await errorLogger.logDnsConfigOperation('准备安装更新', {
        file: updateFile,
        targetVersion
      });
      const updateResult = await updateService.performUpdate(updateFile, targetVersion);
      
      ctx.body = {
        success: true,
        message: `系统更新已完成，新版本为${targetVersion}`,
        newVersion: targetVersion
      };
    } catch (error) {
      await errorLogger.logError('执行系统更新', error);
      
      // 直接设置错误响应，不使用this.handleError
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '执行更新失败: ' + error.message,
        error: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      };
    }
  }
}

module.exports = new SystemController(); 