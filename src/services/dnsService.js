/**
 * DNS服务模块
 * 提供DNS查询和解析功能
 * 
 * 逻辑过程：
 * 1. 初始化流程：
 *    - 从config.json读取DNS服务配置
 *    - 初始化所有支持的DNS协议(standard, custom, DoT, DoH, DoQ)
 *    - 设置默认协议和回退顺序
 * 
 * 2. DNS解析流程：
 *    - lookup方法是主要入口，接收域名、记录类型、客户端IP等参数
 *    - 首先检查是否有匹配的自定义DNS记录
 *    - 新添加，检查是否匹配的域名池，匹配协议和DNS服务器地址（支持域名通配符）
 *    - 如果没有自定义记录，使用指定的协议(standard, custom, DoT, DoH, DoQ)进行查询
 *    - 如果指定协议查询失败，会按照配置的回退顺序尝试其他协议
 * 
 * 3. 协议处理：
 *    - standard: 使用系统默认DNS解析功能(localLookup)
 *    - custom: 使用指定的DNS服务器进行查询(directLookup)
 *    - DoT: 使用DNS over TLS协议加密查询(dotService)
 *    - DoH: 使用DNS over HTTPS协议加密查询(dohService)
 *    - DoQ: 使用DNS over QUIC协议加密查询(doqService)
 * 
 * 4. 日志记录：
 *    - 所有DNS查询活动都通过dnsLogModel进行记录
 *    - 记录查询域名、类型、来源、成功/失败状态、响应时间等信息
 * 
 * 5. 错误处理：
 *    - 查询失败时尝试回退到其他协议
 *    - 所有协议都失败时，抛出原始错误
 * 
 * DNS服务流程图：
 * ```
 * ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 * │    DNS查询请求    │───>│  查找自定义记录   │───>│ 自定义记录存在? │
 * └─────────────────┘    └─────────────────┘    └────────┬────────┘
 *                                                        │
 *                ┌───────────────────────────────────────┴────────┐
 *                │                                                │
 *                ▼                                                ▼
 * ┌─────────────────────────┐                          ┌─────────────────────┐
 * │    否，继续查询流程       │                          │  是，返回自定义记录  │
 * └──────────────┬──────────┘                          └─────────────────────┘
 *                │
 *                ▼
 * ┌─────────────────────────┐
 * │   检查指定DNS协议是否支持  │
 * └──────────────┬──────────┘
 *                │
 *                ▼
 * ┌─────────────────────────┐
 * │ 使用指定协议进行DNS查询   │──────────┐
 * └──────────────┬──────────┘          │
 *                │                     │
 *                ▼                     ▼
 * ┌─────────────────────────┐    ┌─────────────────────────┐
 * │      查询是否成功?       │    │  根据协议类型分发查询:    │
 * └──────────────┬──────────┘    │                         │
 *                │               │ ┌────────────────────┐  │
 *                │               │ │ standard: localLookup │
 * ┌──────────────┴──────────┐   │ └────────────────────┘  │
 * │                         │   │ ┌────────────────────┐  │
 * ▼                         ▼   │ │ custom: directLookup  │
 * ┌─────────────┐  ┌─────────────┐ └────────────────────┘  │
 * │  否，失败    │  │  是，成功   │ ┌────────────────────┐  │
 * └──────┬──────┘  └──────┬──────┘ │ dot: dotService.query │
 *        │               │        └────────────────────┘  │
 *        ▼               │        ┌────────────────────┐  │
 * ┌─────────────┐        │        │ doh: dohService.query │
 * │ 尝试回退协议 │        │        └────────────────────┘  │
 * └──────┬──────┘        │        ┌────────────────────┐  │
 *        │               │        │ doq: doqService.query │
 *        ▼               │        └────────────────────┘  │
 * ┌─────────────┐        │                                │
 * │回退是否成功?│        │                                │
 * └──────┬──────┘        │                                │
 *        │               │                                │
 * ┌──────┴──────┐        │                                │
 * ▼             ▼        │                                │
 * ┌─────┐   ┌─────┐      │                                │
 * │失败  │   │成功 │      │                                │
 * └──┬──┘   └──┬──┘      │                                │
 *    │         │         │                                │
 *    │         └─────────┼────────────────────────────────┘
 *    │                   │
 *    ▼                   ▼
 * ┌─────────────┐  ┌─────────────┐
 * │  抛出错误   │  │ 返回查询结果 │
 * └─────────────┘  └─────────────┘
 * ```
 * 
 * DNS服务函数调用链流程图：
 * ```
 * ┌──────────────┐
 * │ 客户端DNS请求 │
 * └───────┬──────┘
 *         │
 *         ▼
 * ┌──────────────────┐          ┌───────────────────┐
 * │    handleQuery   │ 处理请求  │  提取域名和记录类型  │
 * │  DNS服务器回调函数 │◄────────┤  创建DNS响应包     │
 * └────────┬─────────┘          └───────────────────┘
 *          │
 *          │ 调用
 *          ▼
 * ┌──────────────────┐          ┌───────────────────┐
 * │      lookup      │ 执行查询  │  检查自定义DNS记录  │
 * │   主要查询入口    │◄────────┤  选择协议并执行查询 │
 * └────────┬─────────┘          │  处理错误和回退    │
 * │解析流程          │          └───────────────────┘
 * │                 │
 * │自定义记录检查     │
 * │                 ▼
 * │        ┌──────────────────┐
 * │        │  自定义记录存在?  │
 * │        └─────────┬────────┘
 * │                  │
 * │                  │ 否
 * │                  ▼
 * │        ┌────────────────────┐        ┌─────────────────────────┐
 * │        │ _lookupWithProtocol │ 分发查询│ 根据协议类型选择查询方法 │
 * │        │   协议分发中心      │◄───────┤ 获取服务器配置         │
 * └───────►└─────────┬──────────┘        └─────────────────────────┘
 *                    │
 *                    │ 调用相应协议
 *                    ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       具体DNS查询实现                            │
 * ├─────────────┬─────────────┬────────────┬────────────┬───────────┤
 * │  localLookup │ directLookup │ dotService │ dohService │ doqService│
 * │  (standard)  │  (custom)   │  (DoT)     │   (DoH)    │  (DoQ)    │
 * └─────────────┴─────────────┴────────────┴────────────┴───────────┘
 *                    │
 *                    │ 返回结果
 *                    ▼
 * ┌─────────────────────────────────────────┐
 * │             处理查询结果                 │
 * │  格式化结果 → 记录日志 → 返回响应给客户端  │
 * └─────────────────────────────────────────┘
 * ```
 */
const dns = require('dns');
const dns2 = require('dns2');
const { Packet } = dns2;
const fs = require('fs');
const path = require('path');
const dnsLogModel = require('../models/dnsLogModel');
const dnsRecordModel = require('../models/dnsRecordModel');
const dnsCacheModel = require('../models/dnsCacheModel');
const config = require('../config.json');
const dotService = require('./dotService');
const dohService = require('./dohService');
const doqService = require('./doqService');


class DNSService {
  /**
   * 构造函数 - 初始化DNS服务
   * 
   * 逻辑过程：
   * 1. 从config.json加载DNS配置
   * 2. 初始化支持的协议映射表，根据配置决定每种协议是否启用
   *    - standard: 标准DNS解析，使用系统DNS
   *    - custom: 自定义DNS服务器解析
   *    - dot: DNS over TLS加密协议
   *    - doh: DNS over HTTPS加密协议
   *    - doq: DNS over QUIC加密协议 (需要检查底层QUIC协议支持)
   * 3. 设置默认协议与回退顺序
   * 4. 检查默认协议是否被支持，若不支持则回退到standard
   * 5. 输出初始化日志信息
   */
  constructor() {
    this.dnsConfig = config.dns;
    // 初始化常规设置
    this.generalConfig = config.general || {};
    
    // 初始化DNS协议支持标志
    this.supportedProtocols = {
      standard: this.dnsConfig.standard && this.dnsConfig.standard.enable,
      custom: this.dnsConfig.custom && this.dnsConfig.custom.enable,
      dot: this.dnsConfig.dot && this.dnsConfig.dot.enable,
      doh: this.dnsConfig.doh && this.dnsConfig.doh.enable,
      doq: this.dnsConfig.doq && this.dnsConfig.doq.enable && doqService.isQuicSupported()
    };
    
    // 设置默认协议和回退顺序
    this.defaultProtocol = this.dnsConfig.defaultProtocol || 'standard';
    this.fallbackOrder = this.dnsConfig.fallbackOrder || ['standard'];
    
    // 读取调试模式设置
    this.debug = this.dnsConfig.debug || false;
    
    // 读取日志设置
    if (this.dnsConfig.logging) {
      this.logging = {
        level: this.dnsConfig.logging.level || 'info',
        logQueries: typeof this.dnsConfig.logging.logQueries === 'boolean' ? this.dnsConfig.logging.logQueries : true,
        logResponses: typeof this.dnsConfig.logging.logResponses === 'boolean' ? this.dnsConfig.logging.logResponses : true,
        rotation: this.dnsConfig.logging.rotation || 'daily',
        retention: this.dnsConfig.logging.retention || 30
      };
    } else {
      // 默认日志设置
      this.logging = {
        level: 'info',
        logQueries: true,
        logResponses: true,
        rotation: 'daily',
        retention: 30
      };
    }
    
    // 读取安全设置
    if (this.dnsConfig.security) {
      // 读取拦截域名列表
      this.blockedDomains = this.dnsConfig.security.blockedDomains || [];
      
      // 读取允许的IP地址列表
      this.allowedIPs = this.dnsConfig.security.allowedIPs || ['0.0.0.0/0']; // 默认允许所有IP
      
      // 读取速率限制设置
      this.rateLimit = {
        enable: this.dnsConfig.security.rateLimit ? this.dnsConfig.security.rateLimit.enable : false,
        threshold: this.dnsConfig.security.rateLimit ? this.dnsConfig.security.rateLimit.threshold : 1000
      };
      
      // 读取DNSSEC设置
      this.dnssec = {
        enable: this.dnsConfig.security.dnssec ? this.dnsConfig.security.dnssec.enable : false
      };
    } else {
      // 默认安全设置
      this.blockedDomains = [];
      this.allowedIPs = ['0.0.0.0/0'];
      this.rateLimit = { enable: false, threshold: 1000 };
      this.dnssec = { enable: false };
    }
    
    // 确保默认协议受支持
    if (!this.supportedProtocols[this.defaultProtocol]) {
      console.warn(`默认协议 ${this.defaultProtocol} 不被支持，使用标准DNS代替`);
      this.defaultProtocol = 'standard';
    }
    
    // 初始化DNS缓存
    if (this.dnsConfig.cache) {
      dnsCacheModel.configure(this.dnsConfig.cache);
      
      // 如果缓存开启，每10分钟清理过期缓存
      if (this.dnsConfig.cache.enable) {
        this.cacheCleanupInterval = setInterval(() => {
          const cleared = dnsCacheModel.clearExpired();
          if (this.debug && cleared > 0) {
            console.log(`[DNS缓存] 已清理${cleared}条过期缓存`);
          }
        }, 10 * 60 * 1000); // 10分钟
      }
    }
    
    // 记录服务初始化信息
    console.log('DNS服务初始化，支持的协议:', this.supportedProtocols);
    console.log('默认协议:', this.defaultProtocol);
    console.log('回退顺序:', this.fallbackOrder);
    console.log('日志设置:', this.logging);
  }

  /**
   * 获取域名对应的服务器配置
   * 
   * @param {string} domain - 要查询的域名
   * @returns {Promise<Object|null>} - 返回匹配的服务器配置，包含 serverIP 和 protocol
   *                                  如果没有匹配项则返回 null
   */
  async getDomainServerConfig(domain) {
    const domainData = await getDomainData();
    
    /*
    if (this.debug) {
      console.log(`[域名配置] 读取到的域名配置数据:`, JSON.stringify(domainData, null, 2));
      console.log(`[域名配置] 开始匹配域名: ${domain}`);
    }
      */
    
    // 遍历所有域名配置
    for (const [pattern, config] of Object.entries(domainData)) {
      if (this.debug) {
        console.log(`[域名配置] 尝试匹配模式: ${pattern}`);
      }
      
      if (matchDomain(pattern, domain)) {
        if (this.debug) {
          console.log(`[域名配置] 找到匹配的配置:`, JSON.stringify(config));
        }
        // 返回匹配的配置
        return {
          serverIP: config.dns,
          protocol: config.protocol || 'standard' // 如果没有指定协议，默认使用standard
        };
      }
    }
    
    if (this.debug) {
      console.log(`[域名配置] 未找到匹配的配置`);
    }
    
    return null;
  }

  /**
   * 检查域名是否在拦截列表中
   * @param {string} domain - 要检查的域名
   * @returns {boolean} - 如果域名在拦截列表中返回true，否则返回false
   */
  isDomainBlocked(domain) {
    if (!this.blockedDomains || this.blockedDomains.length === 0) {
      return false;
    }
    
    // 规范化域名
    const normalizedDomain = domain.toLowerCase();
    
    // 检查完全匹配
    if (this.blockedDomains.includes(normalizedDomain)) {
      return true;
    }
    
    // 检查通配符匹配
    for (const blockedDomain of this.blockedDomains) {
      // 处理通配符格式 *.example.com
      if (blockedDomain.startsWith('*.')) {
        const suffix = blockedDomain.substring(1); // 获取 .example.com
        if (normalizedDomain.endsWith(suffix)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 重新加载拦截域名列表
   * 当拦截域名配置更新时调用此方法
   */
  reloadBlockedDomains() {
    try {
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新拦截域名列表
      this.blockedDomains = (configData.dns.security && configData.dns.security.blockedDomains) || [];
      
      if (this.debug) {
        console.log(`[DNS服务] 已重新加载拦截域名列表，共 ${this.blockedDomains.length} 个域名`);
      }
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载拦截域名列表失败:', error);
      return false;
    }
  }
  
  /**
   * 重新加载允许的IP地址列表
   * 当IP白名单配置更新时调用此方法
   */
  reloadAllowedIPs() {
    try {
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新允许的IP地址列表
      this.allowedIPs = (configData.dns.security && configData.dns.security.allowedIPs) || ['0.0.0.0/0'];
      
      if (this.debug) {
        console.log(`[DNS服务] 已重新加载允许的IP地址列表，共 ${this.allowedIPs.length} 个地址`);
      }
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载允许的IP地址列表失败:', error);
      return false;
    }
  }
  
  /**
   * 重新加载速率限制设置
   * 当速率限制配置更新时调用此方法
   */
  reloadRateLimit() {
    try {
      // 保存旧的设置用于比较
      const oldRateLimit = { ...this.rateLimit };
      
      // 打印重载前的设置
      console.log(`[DNS服务] 重载速率限制前的设置: 状态=${oldRateLimit.enable ? '启用' : '禁用'}, 阈值=${oldRateLimit.threshold}`);
      
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新速率限制设置
      if (configData.dns && configData.dns.security && configData.dns.security.rateLimit) {
        this.rateLimit = {
          enable: configData.dns.security.rateLimit.enable,
          threshold: parseInt(configData.dns.security.rateLimit.threshold) || 1000
        };
      } else {
        this.rateLimit = { enable: false, threshold: 1000 };
      }
      
      // 始终打印日志，无论是否开启debug模式
      console.log(`[DNS服务] 已重新加载速率限制设置，状态: ${this.rateLimit.enable ? '启用' : '禁用'}，阈值: ${this.rateLimit.threshold}`);
      
      // 检查是否有变化
      const hasChange = oldRateLimit.enable !== this.rateLimit.enable || 
                        oldRateLimit.threshold !== this.rateLimit.threshold;
      
      if (hasChange) {
        console.log(`[DNS服务] 速率限制设置已变更: 状态(${oldRateLimit.enable ? '启用' : '禁用'} -> ${this.rateLimit.enable ? '启用' : '禁用'}), 阈值(${oldRateLimit.threshold} -> ${this.rateLimit.threshold})`);
      } else {
        console.log(`[DNS服务] 速率限制设置无变化，但已确认重新加载`);
      }
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载速率限制设置失败:', error);
      return false;
    }
  }
  
  /**
   * 重新加载所有安全设置
   * 一次性重新加载所有安全相关配置
   */
  reloadSecuritySettings() {
    const results = {
      blockedDomains: this.reloadBlockedDomains(),
      allowedIPs: this.reloadAllowedIPs(),
      rateLimit: this.reloadRateLimit(),
      dnssec: this.reloadDNSSEC()
    };
    
    return results.blockedDomains && results.allowedIPs && results.rateLimit && results.dnssec;
  }

  /**
   * 执行DNS查询 - DNS服务的核心方法
   * 
   * 逻辑过程：
   * 1. 检查和准备:
   *    - 记录调试日志(包含域名、类型、客户端IP等)
   *    - 确定使用的协议(用户指定或默认协议)
   * 
   * 2. 自定义记录检查:
   *    - 检查是否存在匹配的自定义DNS记录
   *    - 如果找到自定义记录，直接返回结果并记录日志
   * 
   * 3. 协议解析阶段:
   *    - 检查所请求协议是否被支持
   *    - 调用_lookupWithProtocol进行实际查询
   *    - 如果查询成功，记录结果并返回
   * 
   * 4. 错误处理和回退:
   *    - 如果查询失败，尝试按照配置的回退顺序使用其他协议
   *    - 每次回退尝试都是独立的查询，有自己的日志记录
   *    - 如果所有协议都失败，抛出最初的错误
   * 
   * 5. 协议不支持处理:
   *    - 如果用户指定的协议不受支持，使用本地DNS解析(localLookup)作为后备
   *
   * @param {string} domain - 要查询的域名
   * @param {string} type - 记录类型 (A, AAAA, MX, NS, TXT...)
   * @param {string} clientIp - 客户端IP (可选)
   * @param {string} protocol - 使用的DNS协议 (standard, custom，dot, doh, doq)
   * @param {string} serverIp - 服务器IP (可选)
   * @returns {Promise<Array>} - 查询结果
   */
  async lookup(domain, type = 'A', clientIp = '127.0.0.1', protocol = null, serverIp = null) {
    // === 调试日志 - 开始 ===
    if (this.debug) {
      console.log(`[DNS查询] 开始查询: ${domain} (${type}) - 客户端IP: ${clientIp}`);
      console.log(`[DNS查询] 指定协议: ${protocol || '未指定'}, 将使用: ${protocol || this.defaultProtocol}`);
      console.log(`[DNS查询] 指定服务器: ${serverIp || '未指定'}`);
      
      // 添加DNSSEC状态日志
      if (this.dnssec.enable) {
        console.log(`[DNS查询] DNSSEC验证已启用`);
      }
    }
    // === 调试日志 - 结束 ===
    
    // 设置要使用的协议
    const useProtocol = protocol || this.defaultProtocol;
    
    // 检查域名是否在拦截列表中
    if (this.isDomainBlocked(domain)) {
      // === 调试日志 - 开始 ===
      if (this.debug) {
        console.log(`[DNS查询] 域名 ${domain} 在拦截列表中`);
      }
      // === 调试日志 - 结束 ===
      
      // 记录日志
      dnsLogModel.addLog({
        domain,
        type: type.toUpperCase(),
        clientIp,
        source: 'blocked',
        success: true,
        results: []
      });
      
      // 返回空结果或特定的拦截响应
      return [];
    }
    
    // 检查自定义记录
    const customRecords = dnsRecordModel.getRecords(domain, type);
    if (customRecords && customRecords.length > 0) {
      // === 调试日志 - 开始 ===
      if (this.debug) {
        console.log(`[DNS查询] 发现自定义记录: ${domain} (${type})`);
        console.log(`[DNS查询] 自定义记录内容:`, JSON.stringify(customRecords));
      }
      // === 调试日志 - 结束 ===
      
      // 记录日志
      dnsLogModel.addLog({
        domain,
        type: type.toUpperCase(),
        clientIp,
        source: 'custom',
        success: true,
        results: customRecords
      });
      
      return customRecords;
    }
    
    // 检查缓存
    const cachedResults = dnsCacheModel.get(domain, type);
    if (cachedResults) {
      // === 调试日志 - 开始 ===
      if (this.debug) {
        console.log(`[DNS查询] 命中缓存: ${domain} (${type})`);
        console.log(`[DNS查询] 缓存结果:`, JSON.stringify(cachedResults));
      }
      // === 调试日志 - 结束 ===
      
      // 缓存命中记录日志
      dnsLogModel.addLog({
        domain,
        type: type.toUpperCase(),
        clientIp,
        source: 'cache',
        success: true,
        results: cachedResults
      });
      
      return cachedResults;
    }
    
    // === 调试日志 - 开始 ===
    if (this.debug) {
      console.log(`[DNS查询] 无自定义记录或缓存，将使用协议: ${useProtocol}`);
      console.log(`[DNS查询] 当前支持的协议:`, JSON.stringify(this.supportedProtocols));
    }
    // === 调试日志 - 结束 ===
    
    // 尝试使用指定协议
    if (this.supportedProtocols[useProtocol]) {
      try {
        // === 调试日志 - 开始 ===
        const startTime = Date.now();
        if (this.debug) {
          console.log(`[DNS查询] 正在使用 ${useProtocol} 协议查询 ${domain}`);
        }
        // === 调试日志 - 结束 ===
        
        const result = await this._lookupWithProtocol(domain, type, clientIp, useProtocol, serverIp);
        
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.log(`[DNS查询] ${useProtocol} 协议查询成功，耗时: ${Date.now() - startTime}ms`);
          console.log(`[DNS查询] 查询结果:`, JSON.stringify(result));
        }
        // === 调试日志 - 结束 ===
        
        // 将结果保存到缓存
        dnsCacheModel.set(domain, type, result);
        
        if (this.debug) {
          console.log(`[DNS查询] 结果已缓存: ${domain} (${type})`);
        }
        
        return result;
      } catch (error) {
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.error(`[DNS查询] ${useProtocol} 协议查询失败:`, error.message);
          console.log(`[DNS查询] 将尝试回退协议: ${this.fallbackOrder.join(', ')}`);
        }
        // === 调试日志 - 结束 ===
        
        // 尝试回退到其他协议
        for (const fallbackProtocol of this.fallbackOrder) {
          if (fallbackProtocol !== useProtocol && this.supportedProtocols[fallbackProtocol]) {
            try {
              // === 调试日志 - 开始 ===
              const fallbackStartTime = Date.now();
              if (this.debug) {
                console.log(`[DNS查询] 尝试使用 ${fallbackProtocol} 协议作为回退...`);
              }
              // === 调试日志 - 结束 ===
              
              const result = await this._lookupWithProtocol(domain, type, clientIp, fallbackProtocol, serverIp);
              
              // === 调试日志 - 开始 ===
              if (this.debug) {
                console.log(`[DNS查询] ${fallbackProtocol} 协议回退查询成功，耗时: ${Date.now() - fallbackStartTime}ms`);
              }
              // === 调试日志 - 结束 ===
              
              // 将回退的结果也保存到缓存
              dnsCacheModel.set(domain, type, result);
              
              if (this.debug) {
                console.log(`[DNS查询] 回退结果已缓存: ${domain} (${type})`);
              }
              
              return result;
            } catch (fallbackError) {
              // === 调试日志 - 开始 ===
              if (this.debug) {
                console.error(`[DNS查询] ${fallbackProtocol} 协议回退查询失败:`, fallbackError.message);
              }
              // === 调试日志 - 结束 ===
            }
          }
        }
        
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.error(`[DNS查询] 所有协议都失败，查询失败: ${domain} (${type})`);
        }
        // === 调试日志 - 结束 ===
        
        // 如果所有协议都失败，抛出原始错误
        throw error;
      }
    } else {
      // === 调试日志 - 开始 ===
      if (this.debug) {
        console.log(`[DNS查询] 协议 ${useProtocol} 不受支持，使用本地DNS查询`);
      }
      // === 调试日志 - 结束 ===
      
      const result = await this.localLookup(domain, type, clientIp);
      
      // 将标准DNS结果也保存到缓存
      dnsCacheModel.set(domain, type, result);
      
      if (this.debug) {
        console.log(`[DNS查询] 标准DNS结果已缓存: ${domain} (${type})`);
      }
      
      return result;
    }
  }

  /**
   * 使用指定协议执行DNS查询 - 协议分发中心
   * 
   * 逻辑过程：
   * 1. 准备阶段:
   *    - 记录调试日志(查询域名、记录类型、协议类型)
   *    - 检查是否指定了自定义DNS服务器
   * 
   * 2. 协议分发:
   *    根据协议类型将查询分发到不同的处理方法:
   *    - dot: 使用DNS over TLS协议(dotService)
   *      • 如果指定了服务器，仅使用主机名
   *      • 否则从配置中获取DoT服务器信息(包括端口、服务器名称等)
   * 
   *    - doh: 使用DNS over HTTPS协议(dohService)
   *      • 如果指定了服务器，构建HTTPS端点
   *      • 否则从配置中获取DoH服务器信息(包括主机、路径、方法等)
   * 
   *    - doq: 使用DNS over QUIC协议(doqService)
   *      • 处理逻辑类似DoT
   * 
   *    - custom: 使用直接DNS查询(directLookup)
   *      • 如果没有指定服务器，使用默认的'8.8.8.8'
   * 
   *    - standard: 使用本地系统DNS(localLookup)
   *      • 这是默认情况
   * 
   * 3. 查询执行:
   *    - 调用对应协议服务的查询方法
   *    - 返回查询结果
   * 
   * @private
   * @param {string} domain - 要查询的域名
   * @param {string} type - 记录类型
   * @param {string} clientIp - 客户端IP
   * @param {string} protocol - 使用的DNS协议
   * @param {string} serverIp - 服务器IP
   * @returns {Promise<Array>} - 查询结果
   */
  async _lookupWithProtocol(domain, type, clientIp, protocol, serverIp) {
    // === 调试日志 - 开始 ===
    if (this.debug) {
      console.log(`[DNS协议分发] 准备使用 ${protocol} 协议查询 ${domain} (${type})`);
      if (serverIp) {
        console.log(`[DNS协议分发] 使用自定义服务器: ${serverIp}`);
      }
    }
    // === 调试日志 - 结束 ===


    // 核心选择逻辑，不要删除备注（James 2025-05-05）
    switch (protocol) {
      case 'dot':
        // 使用DNS over TLS (DoT)
        const dotServer = this._getServerForProtocol('dot');
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.log(`[DNS协议分发] DoT服务器配置:`, JSON.stringify(dotServer));
        }
        // === 调试日志 - 结束 ===
        return await dotService.query(domain, type, dotServer);
        
      case 'doh':
        // 使用DNS over HTTPS (DoH)
        const dohServer = this._getServerForProtocol('doh');
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.log(`[DNS协议分发] DoH服务器配置:`, JSON.stringify(dohServer));
        }
        // === 调试日志 - 结束 ===
        return await dohService.query(domain, type, dohServer);
        
      case 'doq':
        // 使用DNS over QUIC (DoQ)
        const doqServer = serverIp ? { host: serverIp } : this._getServerForProtocol('doq');
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.log(`[DNS协议分发] DoQ服务器配置:`, JSON.stringify(doqServer));
        }
        // === 调试日志 - 结束 ===
        return await doqService.query(domain, type, doqServer);

      case 'custom':
        // 使用自定义DNS
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.log(`[DNS协议分发] 自定义DNS服务器配置:${serverIp}`);
        }
        // === 调试日志 - 结束 ===
        // 如果没有指定服务器，使用配置
        if (!serverIp) {
          serverIp = '8.8.8.8'; // 默认使用Google DNS
          if (this.debug) {
            console.log(`[DNS协议分发] 未指定自定义DNS服务器，使用默认服务器: ${serverIp}`);
          }
        }
        return await this.directLookup(domain, type, serverIp, 5000, clientIp);
        
      case 'standard':
      default:
        // === 调试日志 - 开始 ===
        if (this.debug) {
          console.log(`[DNS协议分发] 使用标准DNS查询`);
          if (serverIp) {
            console.log(`[DNS协议分发] 使用标准DNS服务器: ${serverIp}`);
          }
        }
        // === 调试日志 - 结束 ===
        // 使用标准DNS
        return await this.localLookup(domain, type, clientIp);
    }
  }
  
  /**
   * 获取指定协议的服务器配置
   * @private
   * @param {string} protocol - DNS协议 (dot, doh, doq)
   * @returns {Object} - 服务器配置
   */
  _getServerForProtocol(protocol) {
    if (!this.dnsConfig[protocol] || !this.dnsConfig[protocol].servers || 
        this.dnsConfig[protocol].servers.length === 0) {
      // 返回默认服务器配置
      switch(protocol) {
        case 'dot':
          return {
            host: '1.1.1.1',
            port: 853,
            servername: 'cloudflare-dns.com',
            timeout: 5000
          };
        case 'doh':
          return {
            host: 'dns.google',
            path: '/dns-query',
            method: 'GET',
            protocol: 'https',
            timeout: 5000
          };
        case 'doq':
          return {
            host: '1.1.1.1',
            port: 853,
            timeout: 5000
          };
        default:
          return {};
      }
    }
    
    // 按优先级排序并返回第一个服务器
    const servers = [...this.dnsConfig[protocol].servers];
    servers.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    
    // 添加超时配置
    const server = { ...servers[0] };
    if (this.dnsConfig[protocol].timeout) {
      server.timeout = this.dnsConfig[protocol].timeout;
    }
    
    return server;
  }

  /**
   * 反向DNS查询 (IP -> 域名)
   * @param {string} ip - IP地址
   * @param {string} clientIp - 客户端IP (可选)
   * @param {string} protocol - 使用的DNS协议
   * @returns {Promise<Array>} - 查询结果
   */
  async reverse(ip, clientIp = '127.0.0.1', protocol = null) {
    const useProtocol = protocol || this.defaultProtocol;
    
    try {
      const startTime = Date.now();
      
      if (this.debug) {
        console.log(`[反向DNS] 开始反向查询: ${ip} - 使用协议: ${useProtocol}`);
      }
      
      if (useProtocol === 'standard' || !this.supportedProtocols[useProtocol]) {
        // 标准DNS反向查询
        return new Promise((resolve, reject) => {
          dns.reverse(ip, (err, hostnames) => {
            if (err) {
              if (this.debug) {
                console.error(`[反向DNS] 反向查询失败:`, err.message);
              }
              
              // 记录失败日志
              dnsLogModel.addLog({
                domain: ip,
                type: 'PTR',
                clientIp,
                source: 'system',
                success: false,
                error: err.message,
                responseTime: Date.now() - startTime
              });
              
              reject(err);
            } else {
              if (this.debug) {
                console.log(`[反向DNS] 反向查询成功, 结果:`, hostnames);
              }
              
              const results = hostnames.map(hostname => ({
                type: 'PTR',
                value: hostname,
                ttl: 300
              }));
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain: ip,
                type: 'PTR',
                clientIp,
                source: 'system',
                success: true,
                results,
                responseTime: Date.now() - startTime
              });
              
              resolve(results);
            }
          });
        });
      } else {
        // 转换IP为反向DNS格式
        const parts = ip.split('.');
        const reverseDomain = parts.reverse().join('.') + '.in-addr.arpa';
        
        if (this.debug) {
          console.log(`[反向DNS] 转换IP格式为反向查询域名: ${reverseDomain}`);
        }
        
        // 使用指定协议进行PTR查询
        return await this.lookup(reverseDomain, 'PTR', clientIp, useProtocol);
      }
    } catch (error) {
      // 尝试回退
      if (this.debug) {
        console.error(`[反向DNS] 使用${useProtocol}协议反向查询失败:`, error.message);
        console.log(`[反向DNS] 将尝试回退协议: ${this.fallbackOrder.join(', ')}`);
      }
      
      // 尝试回退到其他协议
      for (const fallbackProtocol of this.fallbackOrder) {
        if (fallbackProtocol !== useProtocol && this.supportedProtocols[fallbackProtocol]) {
          try {
            if (this.debug) {
              console.log(`[反向DNS] 尝试使用${fallbackProtocol}协议作为回退进行反向查询...`);
            }
            return await this.reverse(ip, clientIp, fallbackProtocol);
          } catch (fallbackError) {
            if (this.debug) {
              console.error(`[反向DNS] 使用${fallbackProtocol}协议回退反向查询失败:`, fallbackError.message);
            }
          }
        }
      }
      
      throw error;
    }
  }

  /**
   * 执行直接DNS查询到指定DNS服务器 - 实现custom协议
   * 
   * 逻辑过程：
   * 1. 参数检查:
   *    - 验证服务器地址是否存在，不存在则抛出错误
   *    - 记录调试日志(查询域名、记录类型、目标服务器)
   * 
   * 2. 查询准备:
   *    - 使用Node.js的dns模块作为底层实现
   *    - 通过dns.setServers设置要使用的DNS服务器
   *    - 根据记录类型(A,AAAA,MX,TXT等)选择对应的解析方法
   *    - 设置查询超时机制，防止请求长时间挂起
   * 
   * 3. 执行查询:
   *    - 调用选定的DNS解析方法
   *    - 检查查询结果和错误状态
   * 
   * 4. 错误处理:
   *    - 如果查询失败，记录错误并抛出异常
   *    - 清除超时定时器，防止内存泄漏
   * 
   * 5. 结果处理:
   *    - 根据记录类型格式化查询结果
   *    - 不同类型记录(A, AAAA, MX, TXT等)有不同的结果结构
   *    - 设置通用属性(TTL, class等)
   * 
   * 6. 日志记录:
   *    - 记录查询结果及响应时间
   *    - 返回格式化后的结果
   * 
   * @param {string} domain - 要查询的域名
   * @param {string} recordType - 记录类型
   * @param {string} server - DNS服务器
   * @param {number} timeout - 超时时间（毫秒）
   * @param {string} clientIp - 客户端IP
   * @returns {Promise<Array>} - 查询结果
   */
  async directLookup(domain, recordType, server, timeout = 5000, clientIp = '') {
    if (!server) {
      throw new Error("DNS服务器地址未指定");
    }

    if (this.debug) {
      console.log(`[直接DNS] 开始查询: ${domain} (${recordType}) 到服务器: ${server}`);
    }

    // 使用node的dns模块直接解析，更可靠
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // 设置DNS服务器
      const dnsSetServers = dns.setServers([server]);

      // 根据记录类型选择合适的解析方法
      let dnsMethod;
      switch (recordType.toUpperCase()) {
        case 'A':
          dnsMethod = dns.resolve4.bind(dns);
          break;
        case 'AAAA':
          dnsMethod = dns.resolve6.bind(dns);
          break;
        case 'MX':
          dnsMethod = dns.resolveMx.bind(dns);
          break;
        case 'TXT':
          dnsMethod = dns.resolveTxt.bind(dns);
          break;
        case 'NS':
          dnsMethod = dns.resolveNs.bind(dns);
          break;
        case 'CNAME':
          dnsMethod = dns.resolveCname.bind(dns);
          break;
        case 'PTR':
          dnsMethod = dns.resolvePtr.bind(dns);
          break;
        case 'SOA':
          dnsMethod = dns.resolveSoa.bind(dns);
          break;
        case 'SRV':
          dnsMethod = dns.resolveSrv.bind(dns);
          break;
        default:
          dnsMethod = dns.resolve.bind(dns);
      }

      // 设置超时
      const timeoutId = setTimeout(() => {
        reject(new Error(`DNS查询超时，服务器: ${server}`));
      }, timeout);

      // 执行DNS查询
      dnsMethod(domain, (err, addresses) => {
        clearTimeout(timeoutId);

        if (err) {
          if (this.debug) {
            console.error(`[直接DNS] 查询失败: ${err.message}`);
          }

          // 对于ENODATA错误，应当返回空结果而不是失败
          if (err.code === 'ENODATA') {
            if (this.debug) {
              console.log(`[直接DNS] 域名 ${domain} 没有${recordType}记录，返回空结果`);
            }
            
            // 记录查询日志（不计为错误）
            dnsLogModel.addLog({
              domain,
              type: recordType.toUpperCase(),
              clientIp,
              source: 'direct',
              server,
              success: true,
              results: [],
              responseTime: Date.now() - startTime,
              message: `No ${recordType} record available`
            });
            
            resolve([]);
            return;
          }

          // 记录失败日志
          dnsLogModel.addLog({
            domain,
            type: recordType.toUpperCase(),
            clientIp,
            source: 'direct',
            server,
            success: false,
            error: err.message,
            responseTime: Date.now() - startTime
          });

          reject(err);
        } else {
          // 根据不同记录类型格式化结果
          let results = [];
          
          if (recordType.toUpperCase() === 'A') {
            results = addresses.map(address => ({
              name: domain,
              type: 'A',
              address,
              ttl: 300,
              class: 1
            }));
          } else if (recordType.toUpperCase() === 'AAAA') {
            results = addresses.map(address => ({
              name: domain,
              type: 'AAAA',
              address,
              ttl: 300,
              class: 1
            }));
          } else if (recordType.toUpperCase() === 'MX') {
            results = addresses.map(mx => ({
              name: domain,
              type: 'MX',
              priority: mx.priority,
              exchange: mx.exchange,
              ttl: 300,
              class: 1
            }));
          } else if (recordType.toUpperCase() === 'TXT') {
            results = addresses.map(txt => ({
              name: domain,
              type: 'TXT',
              entries: txt,
              data: txt.join(''),
              ttl: 300,
              class: 1
            }));
          } else if (recordType.toUpperCase() === 'NS' || 
                     recordType.toUpperCase() === 'CNAME' || 
                     recordType.toUpperCase() === 'PTR') {
            results = addresses.map(value => ({
              name: domain,
              type: recordType.toUpperCase(),
              value,
              ttl: 300,
              class: 1
            }));
          } else {
            // 其他类型记录，尝试通用处理
            results = Array.isArray(addresses) ? addresses.map(addr => ({
              name: domain,
              type: recordType.toUpperCase(),
              data: typeof addr === 'object' ? JSON.stringify(addr) : addr.toString(),
              ttl: 300,
              class: 1
            })) : [{
              name: domain,
              type: recordType.toUpperCase(),
              data: typeof addresses === 'object' ? JSON.stringify(addresses) : addresses.toString(),
              ttl: 300,
              class: 1
            }];
          }

          if (this.debug) {
            console.log(`[直接DNS] 查询成功，返回${results.length}条记录`);
          }

          // 记录成功日志
          dnsLogModel.addLog({
            domain,
            type: recordType.toUpperCase(),
            clientIp,
            source: 'direct',
            server,
            success: true,
            results,
            responseTime: Date.now() - startTime
          });

          resolve(results);
        }
      });
    });
  }

  /**
   * 获取DNS记录类型值
   * @param {string} typeName - 记录类型名称
   * @returns {number} - 记录类型值
   */
  getDnsType(typeName) {
    // 保留现有功能
    const types = {
      'A': 1,
      'NS': 2,
      'CNAME': 5,
      'SOA': 6,
      'PTR': 12,
      'MX': 15,
      'TXT': 16,
      'AAAA': 28,
      'SRV': 33
    };
    
    // 确保typeName是字符串类型
    if (typeof typeName !== 'string') {
      return typeName || 1; // 如果typeName是数字，直接返回，否则返回默认值1
    }
    
    return types[typeName.toUpperCase()] || 1;
  }

  /**
   * 获取DNS记录类型名称
   * @param {number} typeValue - 记录类型值
   * @returns {string} - 记录类型名称
   */
  getDnsTypeName(typeValue) {
    // 保留现有功能
    const types = {
      1: 'A',
      2: 'NS',
      5: 'CNAME',
      6: 'SOA',
      12: 'PTR',
      15: 'MX',
      16: 'TXT',
      28: 'AAAA',
      33: 'SRV'
    };
    
    return types[typeValue] || 'A';
  }

  /**
   * 创建DNS服务器
   * @param {Object} options - 服务器选项
   * @returns {Object} - DNS服务器对象
   */
  createServer(options = {}) {
    // 保留现有功能
    const server = dns2.createServer({
      udp: options.udp !== undefined ? options.udp : true,
      tcp: options.tcp !== undefined ? options.tcp : true,
      handle: this.handleQuery.bind(this)
    });
    
    return server;
  }

  /**
   * 处理DNS查询请求 - DNS服务器回调函数
   * 
   * 逻辑过程：
   * 1. 请求解析:
   *    - 从请求中提取查询信息(域名、记录类型)
   *    - 创建DNS响应数据包
   * 
   * 2. 执行查询:
   *    - 获取客户端IP地址(用于日志和地理位置判断)
   *    - 使用lookup方法执行实际的DNS查询
   *    - lookup方法会根据配置选择合适的DNS协议
   * 
   * 3. 结果处理:
   *    - 将查询结果转换为DNS协议所需的格式
   *    - 根据不同记录类型(A, AAAA, MX等)设置不同的响应字段
   *    - 确保每个记录包含必要的字段(name, type, class, ttl)
   * 
   * 4. 错误处理:
   *    - 捕获查询过程中的任何错误
   *    - 记录错误信息到日志
   *    - 设置服务器故障(SERVFAIL)响应码
   * 
   * 5. 响应发送:
   *    - 将处理好的响应包发送回客户端
   * 
   * 该方法通常由DNS服务器调用，是处理客户端DNS查询的入口点。
   * 它充分利用了lookup方法来支持多种DNS协议和自定义记录。
   * 
   * @param {Object} request - 请求对象
   * @param {Function} send - 发送响应的回调
   * @param {Object} rinfo - 请求信息
   */
  async handleQuery(request, send, rinfo) {
    // 保留现有功能，但使用我们的支持DoT/DoH/DoQ的lookup方法
    const response = Packet.createResponseFromRequest(request);
    const [question] = request.questions;
    const { name, type } = question;
    let useProtocol = null;
    let serverIp =null
    
    try {
      const clientIp = rinfo ? rinfo.address : '127.0.0.1';
      
      if (this.debug) {
        console.log(`[DNS服务] 收到查询请求: ${name} (类型: ${type}, 名称: ${this.getDnsTypeName(type)})`);
      }

      // 获取域名对应的服务器配置
      if (this.debug) {
        console.log(`[DNS查询] 开始查找域名 ${name} 的服务器配置`);
      }
      const serverConfig = await this.getDomainServerConfig(name);

      if (serverConfig) {
        if (this.debug) {
          console.log(`[DNS查询] 找到域名 ${name} 的服务器配置:`, JSON.stringify(serverConfig));
          console.log(`[DNS查询] 使用协议: ${serverConfig.protocol}, DNS服务器: ${serverConfig.serverIP}`);
        }
        useProtocol = serverConfig.protocol;
        serverIp = serverConfig.serverIP;
      } else {
        if (this.debug) {
          console.log(`[DNS查询] 未找到域名 ${name} 的服务器配置，将使用默认配置`);
        }
      }
      
      const answers = await this.lookup(name, this.getDnsTypeName(type), clientIp, useProtocol, serverIp);
      
      if (this.debug) {
        console.log(`[DNS服务] 查询结果:`, JSON.stringify(answers));
      }
      
      // 修复转换问题
      response.answers = answers.map(answer => {
        // 转换为dns2库需要的格式
        const result = {
          name: answer.name || name,
          type: answer.type ? this.getDnsType(answer.type) : type,
          class: answer.class || 1,
          ttl: answer.ttl || 300
        };
        
        // 根据记录类型设置正确的字段
        const typeName = answer.type || this.getDnsTypeName(type);
        
        if (typeName === 'A' || typeName === 'AAAA') {
          result.address = answer.address || '0.0.0.0'; // 确保address字段存在
        } else if (typeName === 'MX') {
          result.exchange = answer.exchange || '';
          result.priority = answer.priority || 10;
        } else if (typeName === 'TXT') {
          result.data = answer.entries || answer.data || '';
        } else if (typeName === 'NS' || typeName === 'CNAME' || typeName === 'PTR') {
          result.data = answer.value || answer.data || '';
        } else {
          // 默认情况，确保至少有一个数据字段
          result.data = answer.data || answer.value || '';
          
          // 对于A和AAAA记录的特殊处理，确保address字段存在
          if ((type === 1 || type === 28) && !result.address) {
            result.address = answer.address || '0.0.0.0';
          }
        }
        
        if (this.debug) {
          console.log(`[DNS服务] 转换记录:`, JSON.stringify(result));
        }
        
        return result;
      });
    } catch (error) {
      if (this.debug) {
        console.error('[DNS服务] 查询处理错误:', error);
      } else {
        console.error('DNS查询处理错误:', error.message);
      }
      
      // 检查是否是ENODATA错误，这种情况应返回空结果而不是错误
      if (error.code === 'ENODATA') {
        if (this.debug) {
          console.log(`[DNS服务] 域名 ${name} 没有对应的 ${this.getDnsTypeName(type)} 记录，返回空结果`);
        }
        // 返回空结果
        response.answers = [];
      } else {
        // 其他错误设置SERVFAIL
        response.flags |= Packet.RCODE_SERVFAIL; // 服务器故障
      }
    }
    
    send(response);
  }

  /**
   * 使用系统DNS执行本地查询 - 实现standard协议
   * 
   * 逻辑过程：
   * 1. 准备阶段:
   *    - 记录调试日志(查询域名、记录类型)
   *    - 记录查询开始时间(用于计算响应时间)
   * 
   * 2. 记录类型处理:
   *    - 根据请求的记录类型选择不同的处理逻辑
   *    - 支持的记录类型包括: A, AAAA, MX, TXT, NS等
   * 
   * 3. 查询执行:
   *    - 使用Node.js内置dns模块的相应方法执行查询
   *      • A记录: dns.resolve4
   *      • AAAA记录: dns.resolve6
   *      • MX记录: dns.resolveMx
   *      • TXT记录: dns.resolveTxt
   *      • NS记录: dns.resolveNs
   *      • 等...
   * 
   * 4. 错误处理:
   *    - 如果查询失败，记录错误日志
   *    - 通过Promise的reject返回错误
   * 
   * 5. 结果处理:
   *    - 根据记录类型格式化查询结果
   *    - 每种记录类型有特定的结果格式
   *    - 设置通用属性(TTL, class等)
   * 
   * 6. 日志记录:
   *    - 记录成功查询的结果和响应时间
   *    - 返回格式化后的结果
   * 
   * 7. 错误情况:
   *    - 当请求不支持的记录类型时，返回适当的错误
   * 
   * @param {string} domain - 要查询的域名
   * @param {string} type - 记录类型
   * @param {string} clientIp - 客户端IP
   * @returns {Promise<Array>} - 查询结果
   */
  async localLookup(domain, type = 'A', clientIp = '127.0.0.1') {
    // === 调试日志 - 开始 ===
    if (this.debug) {
      console.log(`[标准DNS] 开始标准DNS查询: ${domain} (${type})`);
    }
    // === 调试日志 - 结束 ===
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // === 调试日志 - 开始 ===
      if (this.debug) {
        console.log(`[标准DNS] 使用记录类型: ${type.toUpperCase()}`);
      }
      // === 调试日志 - 结束 ===
      
      switch(type.toUpperCase()) {
        case 'A':
          // === 调试日志 - 开始 ===
          if (this.debug) {
            console.log(`[标准DNS] 执行A记录查询: ${domain}`);
          }
          // === 调试日志 - 结束 ===
          
          dns.resolve4(domain, (err, addresses) => {
            if (err) {
              // 对于ENODATA错误，应当返回空结果而不是失败
              if (err.code === 'ENODATA') {
                if (this.debug) {
                  console.log(`[标准DNS] 域名 ${domain} 没有A记录，返回空结果`);
                }
                
                // 记录查询日志（不计为错误）
                dnsLogModel.addLog({
                  domain,
                  type: 'A',
                  clientIp,
                  source: 'system',
                  success: true,
                  results: [],
                  responseTime: Date.now() - startTime,
                  message: 'No A record available'
                });
                
                resolve([]);
                return;
              }
              
              // === 调试日志 - 开始 ===
              if (this.debug) {
                console.error(`[标准DNS] A记录查询失败:`, err.message);
              }
              // === 调试日志 - 结束 ===
              
              // 记录失败日志
              dnsLogModel.addLog({
                domain,
                type: 'A',
                clientIp,
                source: 'system',
                success: false,
                error: err.message,
                responseTime: Date.now() - startTime
              });
              
              reject(err);
            } else {
              // === 调试日志 - 开始 ===
              if (this.debug) {
                console.log(`[标准DNS] A记录查询成功，结果:`, addresses);
                console.log(`[标准DNS] 查询耗时: ${Date.now() - startTime}ms`);
              }
              // === 调试日志 - 结束 ===
              
              const results = addresses.map(address => ({
                name: domain,
                type: 'A',
                address,
                ttl: 300,
                class: 1
              }));
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain,
                type: 'A',
                clientIp,
                source: 'system',
                success: true,
                results,
                responseTime: Date.now() - startTime
              });
              
              resolve(results);
            }
          });
          break;
        
        case 'AAAA':
          dns.resolve6(domain, (err, addresses) => {
            if (err) {
              // 对于ENODATA错误，应当返回空结果而不是失败
              if (err.code === 'ENODATA') {
                if (this.debug) {
                  console.log(`[标准DNS] 域名 ${domain} 没有AAAA记录，返回空结果`);
                }
                
                // 记录查询日志（不计为错误）
                dnsLogModel.addLog({
                  domain,
                  type: 'AAAA',
                  clientIp,
                  source: 'system',
                  success: true,
                  results: [],
                  responseTime: Date.now() - startTime,
                  message: 'No AAAA record available'
                });
                
                resolve([]);
                return;
              }
              
              // 记录失败日志
              dnsLogModel.addLog({
                domain,
                type: 'AAAA',
                clientIp,
                source: 'system',
                success: false,
                error: err.message,
                responseTime: Date.now() - startTime
              });
              
              reject(err);
            } else {
              const results = addresses.map(address => ({
                name: domain,
                type: 'AAAA',
                address,
                ttl: 300,
                class: 1
              }));
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain,
                type: 'AAAA',
                clientIp,
                source: 'system',
                success: true,
                results,
                responseTime: Date.now() - startTime
              });
              
              resolve(results);
            }
          });
          break;
        
        case 'MX':
          dns.resolveMx(domain, (err, addresses) => {
            if (err) {
              // 对于ENODATA错误，应当返回空结果而不是失败
              if (err.code === 'ENODATA') {
                if (this.debug) {
                  console.log(`[标准DNS] 域名 ${domain} 没有MX记录，返回空结果`);
                }
                
                dnsLogModel.addLog({
                  domain,
                  type: 'MX',
                  clientIp,
                  source: 'system',
                  success: true,
                  results: [],
                  responseTime: Date.now() - startTime,
                  message: 'No MX record available'
                });
                
                resolve([]);
                return;
              }
              
              // 记录失败日志
              dnsLogModel.addLog({
                domain,
                type: 'MX',
                clientIp,
                source: 'system',
                success: false,
                error: err.message,
                responseTime: Date.now() - startTime
              });
              
              reject(err);
            } else {
              const results = addresses.map(mx => ({
                name: domain,
                type: 'MX',
                priority: mx.priority,
                exchange: mx.exchange,
                ttl: 300,
                class: 1
              }));
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain,
                type: 'MX',
                clientIp,
                source: 'system',
                success: true,
                results,
                responseTime: Date.now() - startTime
              });
              
              resolve(results);
            }
          });
          break;
        
        case 'TXT':
          dns.resolveTxt(domain, (err, records) => {
            if (err) {
              // 对于ENODATA错误，应当返回空结果而不是失败
              if (err.code === 'ENODATA') {
                if (this.debug) {
                  console.log(`[标准DNS] 域名 ${domain} 没有TXT记录，返回空结果`);
                }
                
                dnsLogModel.addLog({
                  domain,
                  type: 'TXT',
                  clientIp,
                  source: 'system',
                  success: true,
                  results: [],
                  responseTime: Date.now() - startTime,
                  message: 'No TXT record available'
                });
                
                resolve([]);
                return;
              }
              
              // 记录失败日志
              dnsLogModel.addLog({
                domain,
                type: 'TXT',
                clientIp,
                source: 'system',
                success: false,
                error: err.message,
                responseTime: Date.now() - startTime
              });
              
              reject(err);
            } else {
              const results = records.map(txt => ({
                name: domain,
                type: 'TXT',
                entries: txt,
                data: txt.join(''),
                ttl: 300,
                class: 1
              }));
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain,
                type: 'TXT',
                clientIp,
                source: 'system',
                success: true,
                results,
                responseTime: Date.now() - startTime
              });
              
              resolve(results);
            }
          });
          break;
        
        case 'NS':
          dns.resolveNs(domain, (err, addresses) => {
            if (err) {
              // 对于ENODATA错误，应当返回空结果而不是失败
              if (err.code === 'ENODATA') {
                if (this.debug) {
                  console.log(`[标准DNS] 域名 ${domain} 没有NS记录，返回空结果`);
                }
                
                dnsLogModel.addLog({
                  domain,
                  type: 'NS',
                  clientIp,
                  source: 'system',
                  success: true,
                  results: [],
                  responseTime: Date.now() - startTime,
                  message: 'No NS record available'
                });
                
                resolve([]);
                return;
              }
              
              // 记录失败日志
              dnsLogModel.addLog({
                domain,
                type: 'NS',
                clientIp,
                source: 'system',
                success: false,
                error: err.message,
                responseTime: Date.now() - startTime
              });
              
              reject(err);
            } else {
              const results = addresses.map(ns => ({
                type: 'NS',
                value: ns,
                ttl: 300
              }));
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain,
                type: 'NS',
                clientIp,
                source: 'system',
                success: true,
                results,
                responseTime: Date.now() - startTime
              });
              
              resolve(results);
            }
          });
          break;
        
        default:
          // === 调试日志 - 开始 ===
          if (this.debug) {
            console.error(`[标准DNS] 不支持的记录类型: ${type}`);
          }
          // === 调试日志 - 结束 ===
          
          // 记录不支持的类型
          dnsLogModel.addLog({
            domain,
            type: type.toUpperCase(),
            clientIp,
            source: 'system',
            success: false,
            error: `不支持的记录类型: ${type}`,
            responseTime: Date.now() - startTime
          });
          
          reject(new Error(`不支持的记录类型: ${type}`));
      }
    });
  }

  /**
   * 获取当前DNS服务支持的协议
   * @returns {Object} - 支持的协议列表
   */
  getSupportedProtocols() {
    return { ...this.supportedProtocols };
  }

  /**
   * 测试DNS over TLS连接
   * @param {string} host - 服务器地址
   * @param {number} port - 服务器端口
   * @param {string} servername - TLS服务器名称
   * @returns {Promise<Object>} - 测试结果
   */
  async testDoTConnection(host, port = 853, servername) {
    try {
      return await dotService.getServerFingerprint(host, port);
    } catch (error) {
      return {
        host,
        port,
        servername,
        success: false,
        error: error.message
      };
      }
    }
    
  /**
   * 测试DNS over HTTPS连接
   * @param {string} host - 服务器地址
   * @param {string} path - 服务器路径
   * @returns {Promise<Object>} - 测试结果
   */
  async testDoHConnection(host, path = '/dns-query') {
    const testDomain = 'example.com';
      const startTime = Date.now();
      
    try {
      await dohService.query(testDomain, 'A', { host, path });
      return {
        host,
        path,
        success: true,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        host,
        path,
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * 测试DNS over QUIC连接
   * @param {string} host - 服务器地址
   * @param {number} port - 服务器端口
   * @returns {Promise<Object>} - 测试结果
   */
  async testDoQConnection(host, port = 853) {
    return await doqService.checkServerAvailability(host, port);
  }
  
  /**
   * 获取缓存统计信息
   * @returns {Object} - 缓存统计信息
   */
  getCacheStats() {
    return dnsCacheModel.getStats();
  }

  /**
   * 清空DNS缓存
   * @returns {number} - 清除的缓存项数量
   */
  clearCache() {
    return dnsCacheModel.clear();
  }

  /**
   * 配置DNS缓存
   * @param {Object} options - 缓存配置
   * @returns {Object} - 当前配置
   */
  configureDnsCache(options = {}) {
    return dnsCacheModel.configure(options);
  }

  /**
   * 从缓存中移除特定域名的记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型，不指定则移除所有类型
   * @returns {boolean} - 是否成功
   */
  removeDomainFromCache(domain, type) {
    if (!type) {
      // 移除所有类型的记录
      const types = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'PTR', 'SOA', 'SRV'];
      let result = false;
      for (const t of types) {
        if (dnsCacheModel.remove(domain, t)) {
          result = true;
        }
      }
      return result;
    }
    
    return dnsCacheModel.remove(domain, type);
  }

  /**
   * 重新加载DNSSEC设置
   * 当DNSSEC配置更新时调用此方法
   */
  reloadDNSSEC() {
    try {
      // 保存旧的设置用于比较
      const oldDNSSEC = { ...this.dnssec };
      
      // 打印重载前的设置
      console.log(`[DNS服务] 重载DNSSEC前的设置: 状态=${oldDNSSEC.enable ? '启用' : '禁用'}`);
      
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新DNSSEC设置
      if (configData.dns && configData.dns.security && configData.dns.security.dnssec) {
        this.dnssec = {
          enable: configData.dns.security.dnssec.enable
        };
      } else {
        this.dnssec = { enable: false };
      }
      
      // 始终打印日志，无论是否开启debug模式
      console.log(`[DNS服务] 已重新加载DNSSEC设置，状态: ${this.dnssec.enable ? '启用' : '禁用'}`);
      
      // 检查是否有变化
      const hasChange = oldDNSSEC.enable !== this.dnssec.enable;
      
      if (hasChange) {
        console.log(`[DNS服务] DNSSEC设置已变更: 状态(${oldDNSSEC.enable ? '启用' : '禁用'} -> ${this.dnssec.enable ? '启用' : '禁用'})`);
      } else {
        console.log(`[DNS服务] DNSSEC设置无变化，但已确认重新加载`);
      }
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载DNSSEC设置失败:', error);
      return false;
    }
  }

  /**
   * 获取指定协议的所有服务器配置
   * @param {string} protocol - DNS协议 (dot, doh, doq)
   * @returns {Array} - 服务器配置数组
   */
  _getServers(protocol) {
    if (!this.dnsConfig[protocol] || !this.dnsConfig[protocol].servers) {
      return [];
    }
    return [...this.dnsConfig[protocol].servers];
  }

  /**
   * 重新加载日志设置
   * 当日志配置更新时调用此方法，实现即时生效
   */
  reloadLogging() {
    try {
      // 保存旧的设置用于比较
      const oldLogging = { ...(this.logging || {}) };
      const oldDebug = this.debug;
      
      // 打印重载前的设置
      console.log(`[DNS服务] 重载日志配置前的设置: 级别=${oldLogging.level || 'info'}，调试模式=${oldDebug ? '启用' : '禁用'}`);
      console.log(`[DNS服务] 查询日志记录: ${oldLogging.logQueries !== false ? '启用' : '禁用'}, 响应日志记录: ${oldLogging.logResponses !== false ? '启用' : '禁用'}`);
      
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新调试模式设置
      if (configData.dns && typeof configData.dns.debug === 'boolean') {
        this.debug = configData.dns.debug;
      }
      
      // 更新日志设置
      if (configData.dns && configData.dns.logging) {
        // 初始化日志设置对象（如果不存在）
        if (!this.logging) {
          this.logging = {};
        }
        
        // 复制所有日志配置
        this.logging.level = configData.dns.logging.level || 'info';
        this.logging.logQueries = typeof configData.dns.logging.logQueries === 'boolean' ? configData.dns.logging.logQueries : true;
        this.logging.logResponses = typeof configData.dns.logging.logResponses === 'boolean' ? configData.dns.logging.logResponses : true;
        this.logging.rotation = configData.dns.logging.rotation || 'daily';
        this.logging.retention = configData.dns.logging.retention || 30;
      }
      
      // 始终打印日志，无论是否开启debug模式
      console.log(`[DNS服务] 已重新加载日志设置，级别: ${this.logging?.level || 'info'}，调试模式: ${this.debug ? '启用' : '禁用'}`);
      console.log(`[DNS服务] 查询日志记录: ${this.logging.logQueries !== false ? '启用' : '禁用'}, 响应日志记录: ${this.logging.logResponses !== false ? '启用' : '禁用'}`);
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载日志设置失败:', error);
      return false;
    }
  }

  /**
   * 重新加载常规设置
   * 当常规设置更新时调用此方法，实现即时生效
   */
  reloadGeneralConfig() {
    try {
      // 保存旧的设置用于比较
      const oldGeneralConfig = { ...(this.generalConfig || {}) };
      
      // 打印重载前的设置
      console.log(`[DNS服务] 重载常规配置前的设置:`, oldGeneralConfig);
      
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新常规设置
      if (configData.general) {
        this.generalConfig = { ...configData.general };
      }
      
      // 始终打印日志，无论是否开启debug模式
      console.log(`[DNS服务] 已重新加载常规设置:`, this.generalConfig);
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载常规设置失败:', error);
      return false;
    }
  }

  /**
   * 重新加载DNS服务器配置
   * 当DNS服务器配置更新时调用此方法，实现即时生效
   */
  reloadDnsServerConfig() {
    try {
      // 保存旧的设置用于比较
      const oldServerConfig = { ...(this.dnsConfig.server || {}) };
      
      // 打印重载前的设置
      console.log(`[DNS服务] 重载DNS服务器配置前的设置:`, oldServerConfig);
      
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新服务器配置
      if (configData.dns && configData.dns.server) {
        if (!this.dnsConfig) {
          this.dnsConfig = {};
        }
        this.dnsConfig.server = { ...configData.dns.server };
      }
      
      // 始终打印日志，无论是否开启debug模式
      console.log(`[DNS服务] 已重新加载DNS服务器配置:`, this.dnsConfig.server);
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载DNS服务器配置失败:', error);
      return false;
    }
  }

  /**
   * 重新加载上游DNS服务器配置
   * 当上游DNS服务器配置更新时调用此方法，实现即时生效
   */
  reloadUpstreamServers() {
    try {
      // 保存旧的设置用于比较
      const oldUpstreamServers = [...(this.dnsConfig.upstream || [])];
      
      // 打印重载前的设置
      console.log(`[DNS服务] 重载上游DNS服务器配置前的设置:`, oldUpstreamServers);
      
      // 重新加载配置
      const configPath = path.join(__dirname, '../config.json');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 更新上游DNS服务器配置
      if (configData.dns && configData.dns.upstream) {
        if (!this.dnsConfig) {
          this.dnsConfig = {};
        }
        this.dnsConfig.upstream = [...configData.dns.upstream];
      }
      
      // 始终打印日志，无论是否开启debug模式
      console.log(`[DNS服务] 已重新加载上游DNS服务器配置:`, this.dnsConfig.upstream);
      
      return true;
    } catch (error) {
      console.error('[DNS服务] 重新加载上游DNS服务器配置失败:', error);
      return false;
    }
  }
}

// 读取自定义域名数据
const getDomainData = () => {
  try {
    const filePath = path.join(__dirname, '../data/customdomains.json');
    const data = fs.readFileSync(filePath, 'utf8');
    const rawData = JSON.parse(data);
    
    // 转换数据结构
    const domainData = {};
    
    // 处理国内域名
    if (rawData.domestic && Array.isArray(rawData.domestic)) {
      rawData.domestic.forEach(item => {
        if (item.domain) {
          domainData[item.domain] = {
            dns: item.dns,
            protocol: item.protocol,
            name: item.name
          };
        }
      });
    }
    
    // 处理国外域名
    if (rawData.foreign && Array.isArray(rawData.foreign)) {
      rawData.foreign.forEach(item => {
        if (item.domain) {
          domainData[item.domain] = {
            dns: item.dns,
            protocol: item.protocol,
            name: item.name
          };
        }
      });
    }
    
    return domainData;
  } catch (error) {
    console.error('读取自定义域名数据失败:', error);
    return {};
  }
};

/**
 * 域名匹配函数 - 支持通配符匹配
 * 
 * 匹配规则：
 * 1. 精确匹配：完全相同的域名
 * 2. 通配符匹配：
 *    - *.example.com 匹配 sub.example.com
 *    - *.*.example.com 匹配 a.b.example.com
 *    - example.*.com 匹配 example.test.com
 *    - *.example.*.com 匹配 test.example.test.com
 * 
 * @param {string} pattern - 匹配模式（可以是通配符域名）
 * @param {string} domain - 要匹配的域名
 * @returns {boolean} - 是否匹配
 */
const matchDomain = (pattern, domain) => {
  // 转换为小写进行比较
  pattern = pattern.toLowerCase();
  domain = domain.toLowerCase();

  // 精确匹配
  if (pattern === domain) {
    return true;
  }

  // 将通配符模式转换为正则表达式
  const regexPattern = pattern
    .replace(/\./g, '\\.')  // 转义点号
    .replace(/\*/g, '[^.]+'); // 将 * 转换为匹配任意非点字符
  
  // 创建正则表达式，确保完全匹配
  const regex = new RegExp(`^${regexPattern}$`);
  
  // 使用正则表达式进行匹配
  return regex.test(domain);
};






module.exports = new DNSService(); 