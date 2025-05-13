/**
 * 自定义域名控制器
 * 处理国内外域名解析分类管理
 */
const BaseController = require('./baseController');
const fs = require('fs');
const path = require('path');

class CustomDomainsController extends BaseController {
  constructor() {
    super();
    this.dataFilePath = path.join(__dirname, '../data/customdomains.json');
    
    // Bind methods to maintain 'this' context
    this.getCustomDomains = this.getCustomDomains.bind(this);
    this.addDomain = this.addDomain.bind(this);
    this.updateDomain = this.updateDomain.bind(this);
    this.deleteDomain = this.deleteDomain.bind(this);
    this.importDomains = this.importDomains.bind(this);
  }

  /**
   * 获取所有自定义域名数据
   * @param {Object} ctx - Koa上下文
   */
  async getCustomDomains(ctx) {
    try {
      const data = this.readDataFile();
      this.success(ctx, data);
    } catch (error) {
      this.fail(ctx, '获取自定义域名数据失败', 500, error);
    }
  }

  /**
   * 添加新域名
   * @param {Object} ctx - Koa上下文
   */
  async addDomain(ctx) {
    try {
      const { domain, protocol, dns, name, category } = ctx.request.body;
      
      if (!domain || !protocol || !dns || !category) {
        return this.fail(ctx, '域名、协议、DNS服务器和分类为必填项', 400);
      }
      
      const data = this.readDataFile();
      
      // 检查域名是否已存在于该分类
      if (data[category] && data[category].some(item => item.domain === domain)) {
        return this.fail(ctx, `域名 ${domain} 已存在于 ${category} 分类中`, 409);
      }
      
      // 如果该分类不存在，创建它
      if (!data[category]) {
        data[category] = [];
      }
      
      // 检查域名是否存在于其他分类
      const otherCategories = Object.keys(data).filter(cat => cat !== category);
      for (const cat of otherCategories) {
        const existingIndex = data[cat].findIndex(item => item.domain === domain);
        if (existingIndex !== -1) {
        // 从其他分类中移除
          data[cat].splice(existingIndex, 1);
          console.log(`从 ${cat} 分类中移除 ${domain} 域名`);
        }
      }
      
      // 添加到指定分类
      data[category].push({
        domain,
        protocol,
        dns,
        name
      });
      
      // 保存数据
      this.writeDataFile(data);
      
      this.success(ctx, { 
        message: `域名 ${domain} 成功添加到 ${category} 分类`, 
        domain, 
        category 
      });
    } catch (error) {
      console.error('添加域名失败:', error);
      this.fail(ctx, `添加域名失败: ${error.message}`, 500);
    }
  }

  /**
   * 更新域名
   * @param {Object} ctx - Koa上下文
   */
  async updateDomain(ctx) {
    try {
      const { domain, protocol, dns, name, category, originalCategory } = ctx.request.body;
      
      if (!domain || !protocol || !dns || !category) {
        return this.fail(ctx, '域名、协议、DNS服务器和分类为必填项', 400);
      }
      
      const data = this.readDataFile();
      
      // 确保两个分类都存在
      if (!data[originalCategory]) {
        return this.fail(ctx, `原分类 ${originalCategory} 不存在`, 404);
      }
      
      if (!data[category]) {
        data[category] = [];
      }
      
      // 查找当前域名信息
      const domainIndex = data[originalCategory].findIndex(item => item.domain === domain);
      if (domainIndex === -1) {
        return this.fail(ctx, `未找到域名: ${domain}`, 404);
      }
      
      // 如果分类改变，则从原分类中移除
      if (originalCategory !== category) {
        data[originalCategory].splice(domainIndex, 1);
        
        // 将域名添加到新分类
        data[category].push({
          domain,
          protocol,
          dns,
          name
        });
      } else {
        // 更新当前分类中的域名信息
        data[category][domainIndex] = {
          domain,
          protocol,
          dns,
          name
        };
      }
      
      // 保存数据
      this.writeDataFile(data);
      
      this.success(ctx, { 
        message: `域名 ${domain} 配置已更新`, 
        domain
      });
    } catch (error) {
      console.error('更新域名失败:', error);
      this.fail(ctx, `更新域名失败: ${error.message}`, 500);
    }
  }

  /**
   * 删除域名
   * @param {Object} ctx - Koa上下文
   */
  async deleteDomain(ctx) {
    try {
      const domain = ctx.query.domain;
      const category = ctx.query.category;
      
      if (!domain || !category) {
        return this.fail(ctx, '域名和分类参数为必填项', 400);
      }
      
      const data = this.readDataFile();
      
      // 确保分类存在
      if (!data[category]) {
        return this.fail(ctx, `分类 ${category} 不存在`, 404);
      }
      
      // 查找并删除域名
      const domainIndex = data[category].findIndex(item => item.domain === domain);
      if (domainIndex === -1) {
        return this.fail(ctx, `未找到域名: ${domain}`, 404);
      }
      
      // 删除该域名
      data[category].splice(domainIndex, 1);
      
      // 保存数据
      this.writeDataFile(data);
      
      this.success(ctx, { 
        message: `域名 ${domain} 已从 ${category} 分类中删除`, 
        domain
      });
    } catch (error) {
      console.error('删除域名失败:', error);
      this.fail(ctx, `删除域名失败: ${error.message}`, 500);
    }
  }

  /**
   * 批量导入域名
   * @param {Object} ctx - Koa上下文
   */
  async importDomains(ctx) {
    try {
      const importData = ctx.request.body;
      
      // 验证导入数据格式
      if (!importData || !importData.domestic || !importData.foreign ||
          !Array.isArray(importData.domestic) || !Array.isArray(importData.foreign)) {
        return this.fail(ctx, '导入数据格式不正确，必须包含domestic和foreign数组', 400);
      }
      
      // 预处理数据，确保每个域名都有所需的字段
      const processedData = {
        domestic: importData.domestic.map(item => ({
          domain: item.domain,
          protocol: item.protocol || 'custom',
          dns: item.dns || '',
          name: item.name || '国内'
        })).filter(item => item.domain && item.dns),
        
        foreign: importData.foreign.map(item => ({
          domain: item.domain,
          protocol: item.protocol || 'custom',
          dns: item.dns || '',
          name: item.name || '国外'
        })).filter(item => item.domain && item.dns)
      };
      
      // 计算总域名数量
      const totalCount = processedData.domestic.length + processedData.foreign.length;
      
      if (totalCount === 0) {
        return this.fail(ctx, '导入数据中没有有效的域名记录', 400);
      }
      
      // 直接写入数据文件
      this.writeDataFile(processedData);
      
      this.success(ctx, {
        message: `成功导入 ${totalCount} 个域名配置`,
        count: totalCount,
        domestic: processedData.domestic.length,
        foreign: processedData.foreign.length
      });
    } catch (error) {
      console.error('导入域名配置失败:', error);
      this.fail(ctx, `导入域名配置失败: ${error.message}`, 500);
    }
  }

  /**
   * 读取数据文件
   * @private
   * @returns {Object} 数据对象
   */
  readDataFile() {
    try {
      if (!fs.existsSync(this.dataFilePath)) {
        console.warn(`数据文件不存在: ${this.dataFilePath}, 将创建新文件`);
        // 创建初始数据结构
        const initialData = {
          domestic: [],
          foreign: []
        };
        this.writeDataFile(initialData);
        return initialData;
      }
      
      const fileContent = fs.readFileSync(this.dataFilePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error('读取数据文件失败:', error);
      throw new Error(`读取数据文件失败: ${error.message}`);
    }
  }

  /**
   * 写入数据文件
   * @private
   * @param {Object} data - 要写入的数据
   */
  writeDataFile(data) {
    try {
      // 确保data/目录存在
      const dirPath = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('写入数据文件失败:', error);
      throw new Error(`写入数据文件失败: ${error.message}`);
    }
  }
}

module.exports = new CustomDomainsController(); 