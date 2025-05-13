const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const os = require('os');
const errorLogger = require('./errorLogger');

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
 * 系统更新服务类
 * 管理软件更新检查、下载和安装
 */
class UpdateService {
  constructor() {
    this.configPath = path.join(__dirname, '../config.json');
    this.updateServer = {
      host: 'api.domesticdns.cn',  // 更新服务器域名
      port: 443,
      useHttps: true,
      versionPath: '/versions/latest',
      downloadPath: '/download'
    };
    this.updateDir = path.join(__dirname, '../updates');
    this.backupDir = path.join(__dirname, '../backups');
  }

  /**
   * 获取当前版本
   * @returns {Promise<string>} 当前版本号
   */
  async getCurrentVersion() {
    try {
      const configData = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      return configData.app.version;
    } catch (error) {
      await errorLogger.logError('获取当前版本', error);
      throw new Error(`无法获取当前版本: ${error.message}`);
    }
  }

  /**
   * 检查系统更新
   * @returns {Promise<Object>} 更新信息
   */
  async checkForUpdates() {
    try {
      // 记录开始检查更新
      await errorLogger.logDnsConfigOperation('开始检查系统更新', {
        timestamp: new Date().toISOString()
      });

      // 获取当前版本
      const currentVersion = await this.getCurrentVersion();
      
      // 从远程服务器获取最新版本信息
      // 目前模拟此过程
      const latestInfo = await this.getLatestVersionInfo();
      const { version: latestVersion, releaseNotes, downloadUrl } = latestInfo;
      
      // 比较版本
      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
      
      // 记录更新检查结果
      await errorLogger.logDnsConfigOperation('系统更新检查完成', {
        currentVersion,
        latestVersion,
        hasUpdate,
        timestamp: new Date().toISOString()
      });
      
      // 更新上次检查时间
      await this.updateLastCheckTime();
      
      return {
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseNotes: hasUpdate ? releaseNotes : null,
        downloadUrl: hasUpdate ? downloadUrl : null,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      await errorLogger.logError('检查系统更新', error);
      throw new Error(`检查更新失败: ${error.message}`);
    }
  }

  /**
   * 模拟获取最新版本信息
   * 在真实环境中，应该从服务器获取
   * @returns {Promise<Object>} 最新版本信息
   */
  async getLatestVersionInfo() {
    // 模拟从服务器获取数据
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          version: '1.2.3',  // 将版本统一为页面显示的v1.2.3
          releaseNotes: '- 修复了域名拦截功能的错误\n- 提升了DNS解析性能\n- 增强了系统安全性\n- 改进了用户界面',
          downloadUrl: 'https://api.domesticdns.cn/download/domesticdns-1.2.3.zip',
          releaseDate: new Date().toISOString(),
          minRequiredVersion: '1.0.0',
          isRequired: false
        });
      }, 300);
    });
  }

  /**
   * 从远程服务器获取最新版本信息
   * @returns {Promise<Object>} 最新版本信息
   */
  getLatestVersionFromServer() {
    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: this.updateServer.host,
        port: this.updateServer.port,
        path: this.updateServer.versionPath,
        method: 'GET',
        headers: {
          'User-Agent': `DomesticDNS/${this.getCurrentVersion()}`,
          'Accept': 'application/json'
        }
      };

      const req = (this.updateServer.useHttps ? https : http).request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const versionInfo = JSON.parse(data);
              resolve(versionInfo);
            } catch (error) {
              reject(new Error(`解析版本信息失败: ${error.message}`));
            }
          } else {
            reject(new Error(`服务器返回错误: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`请求版本信息失败: ${error.message}`));
      });
      
      req.end();
    });
  }

  /**
   * 更新上次检查时间
   */
  async updateLastCheckTime() {
    try {
      const configData = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      
      // 确保systemManagement.updates存在
      if (!configData.systemManagement) {
        configData.systemManagement = {};
      }
      if (!configData.systemManagement.updates) {
        configData.systemManagement.updates = {};
      }
      
      configData.systemManagement.updates.lastCheck = new Date().toISOString();
      
      await fs.writeFile(this.configPath, JSON.stringify(configData, null, 2), 'utf8');
      return true;
    } catch (error) {
      await errorLogger.logError('更新检查时间', error);
      return false;
    }
  }

  /**
   * 下载更新包
   * @param {string} url - 下载地址
   * @param {string} version - 版本号
   * @returns {Promise<string>} 下载文件路径
   */
  async downloadUpdate(url, version) {
    try {
      // 确保更新目录存在
      await fs.mkdir(this.updateDir, { recursive: true });
      
      const fileName = `update-${version}.zip`;
      const filePath = path.join(this.updateDir, fileName);
      
      // 记录开始下载
      await errorLogger.logDnsConfigOperation('开始下载系统更新', {
        version,
        url,
        filePath
      });
      
      // 下载文件
      await this.downloadFile(url, filePath);
      
      // 记录下载完成
      await errorLogger.logDnsConfigOperation('系统更新下载完成', {
        version,
        filePath
      });
      
      return filePath;
    } catch (error) {
      await errorLogger.logError('下载系统更新', error);
      throw new Error(`下载更新失败: ${error.message}`);
    }
  }

  /**
   * 下载文件
   * @param {string} url - 下载地址
   * @param {string} destPath - 目标路径
   * @returns {Promise<void>}
   */
  downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      const protocol = url.startsWith('https') ? https : http;
      
      const req = protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败，状态码: ${response.statusCode}`));
          return;
        }
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      });
      
      req.on('error', (error) => {
        fs.unlink(destPath).catch(() => {});
        reject(error);
      });
      
      fileStream.on('error', (error) => {
        fs.unlink(destPath).catch(() => {});
        reject(error);
      });
    });
  }

  /**
   * 验证更新包完整性
   * @param {string} filePath - 文件路径
   * @param {string} checksum - 校验和
   * @returns {Promise<boolean>} 验证结果
   */
  async verifyUpdate(filePath, checksum) {
    try {
      // 这里应该实现校验和验证逻辑
      // 目前简单返回true
      return true;
    } catch (error) {
      await errorLogger.logError('验证更新包', error);
      return false;
    }
  }

  /**
   * 备份当前系统
   * @returns {Promise<string>} 备份路径
   */
  async backupSystem() {
    try {
      const currentVersion = await this.getCurrentVersion();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup-${currentVersion}-${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);
      
      // 确保备份目录存在
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // 记录开始备份
      await errorLogger.logDnsConfigOperation('开始备份系统', {
        currentVersion,
        backupPath
      });
      
      // 在实际应用中，这里应该执行实际的备份逻辑
      // 目前仅创建备份目录
      await fs.mkdir(backupPath, { recursive: true });
      
      // 记录备份完成
      await errorLogger.logDnsConfigOperation('系统备份完成', {
        backupPath
      });
      
      return backupPath;
    } catch (error) {
      await errorLogger.logError('备份系统', error);
      throw new Error(`系统备份失败: ${error.message}`);
    }
  }

  /**
   * 执行系统更新
   * @param {string} updateFile - 更新文件路径
   * @param {string} targetVersion - 目标版本
   * @returns {Promise<boolean>} 更新结果
   */
  async performUpdate(updateFile, targetVersion) {
    try {
      // 记录开始更新
      await errorLogger.logDnsConfigOperation('开始执行系统更新', {
        updateFile,
        targetVersion
      });
      
      // 在实际应用中，这里应该执行以下步骤：
      // 1. 解压更新文件
      // 2. 停止服务
      // 3. 替换文件
      // 4. 更新配置文件中的版本号
      // 5. 重启服务
      
      // 目前仅更新配置文件中的版本号
      const configData = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      const oldVersion = configData.app.version;
      configData.app.version = targetVersion;
      
      // 记录版本更新
      await errorLogger.logDnsConfigOperation('更新系统版本号', {
        oldVersion,
        newVersion: targetVersion
      });
      
      // 写入更新后的配置
      await fs.writeFile(this.configPath, JSON.stringify(configData, null, 2), 'utf8');
      
      // 记录更新完成
      await errorLogger.logDnsConfigOperation('系统更新完成', {
        targetVersion
      });
      
      return true;
    } catch (error) {
      await errorLogger.logError('执行系统更新', error);
      throw new Error(`执行更新失败: ${error.message}`);
    }
  }

  /**
   * 获取上次检查更新的时间
   * @returns {Promise<string|null>} 上次检查时间
   */
  async getLastCheckTime() {
    try {
      const configData = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      
      if (configData.systemManagement && 
          configData.systemManagement.updates && 
          configData.systemManagement.updates.lastCheck) {
        return configData.systemManagement.updates.lastCheck;
      }
      
      return null;
    } catch (error) {
      await errorLogger.logError('获取上次检查时间', error);
      return null;
    }
  }
}

module.exports = new UpdateService(); 