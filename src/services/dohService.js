/**
 * DNS over HTTPS (DoH) 服务模块
 * 提供通过HTTPS加密的DNS查询服务
 */
const https = require('https');
const http = require('http');
const { Packet } = require('dns2');
const dnsLogModel = require('../models/dnsLogModel');
const url = require('url');
const dns2 = require('dns2');

class DnsOverHttpsService {
  /**
   * 创建DoH客户端配置
   * @param {Object} options - 配置选项
   * @returns {Object} - DoH客户端配置
   */
  createClient(options = {}) {
    const {
      host = 'dns.google',
      path = '/dns-query',
      method = 'GET',
      timeout = 5000,
      protocol = 'https'
    } = options;

    return {
      host,
      path,
      method,
      timeout,
      protocol
    };
  }

  /**
   * 执行DNS over HTTPS查询
   * @param {String} domain - 要查询的域名
   * @param {String} type - 记录类型
   * @param {Object} clientOptions - 客户端配置选项
   * @returns {Promise<Array>} - 查询结果
   */
  async query(domain, type = 'A', clientOptions = {}) {
    const client = this.createClient(clientOptions);
    const startTime = Date.now();
    const clientIp = '127.0.0.1'; // 本地请求
    
    return new Promise((resolve, reject) => {
      // 使用创建一个基本的DNS查询包
      let dnsQueryBuffer;
      try {
        dnsQueryBuffer = this._createDNSQueryBuffer(domain, type);
      } catch (error) {
        console.error('DNS查询编码失败:', error);
        return reject(new Error(`DNS查询编码失败: ${error.message}`));
      }
      
      // 选择查询方法
      let queryOptions;
      let postData;
      
      if (client.method.toUpperCase() === 'POST') {
        // 使用POST方法
        queryOptions = {
          hostname: client.host,
          path: client.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/dns-message',
            'Content-Length': dnsQueryBuffer.length,
            'Accept': 'application/dns-message'
          },
          timeout: client.timeout
        };
        postData = dnsQueryBuffer;
      } else {
        // 使用GET方法
        const base64Url = dnsQueryBuffer.toString('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
        
        const queryPath = `${client.path}?dns=${base64Url}`;
        
        queryOptions = {
          hostname: client.host,
          path: queryPath,
          method: 'GET',
          headers: {
            'Accept': 'application/dns-message'
          },
          timeout: client.timeout
        };
      }
      
      // 选择HTTP协议
      const requestLibrary = client.protocol === 'https' ? https : http;
      
      const req = requestLibrary.request(queryOptions, (res) => {
        const chunks = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          // 处理HTTP状态码
          if (res.statusCode !== 200) {
            // 记录HTTP错误日志
            dnsLogModel.addLog({
              domain,
              type: type.toUpperCase(),
              clientIp,
              source: 'doh',
              success: false,
              error: `HTTP错误: ${res.statusCode} ${res.statusMessage}`,
              responseTime: Date.now() - startTime
            });
            
            return reject(new Error(`DNS over HTTPS HTTP错误: ${res.statusCode} ${res.statusMessage}`));
          }
          
          // 验证内容类型
          const contentType = res.headers['content-type'] || '';
          if (!contentType.includes('application/dns-message')) {
            // 记录内容类型错误日志
            dnsLogModel.addLog({
              domain,
              type: type.toUpperCase(),
              clientIp,
              source: 'doh',
              success: false,
              error: `无效的内容类型: ${contentType}`,
              responseTime: Date.now() - startTime
            });
            
            return reject(new Error(`DNS over HTTPS无效的内容类型: ${contentType}`));
          }
          
          const responseBuffer = Buffer.concat(chunks);
          
          try {
            // 使用正确的dns2 API解码响应
            const responsePacket = Packet.parse(responseBuffer);
            
            // 记录成功日志
            dnsLogModel.addLog({
              domain,
              type: type.toUpperCase(),
              clientIp,
              source: 'doh',
              success: true,
              results: responsePacket.answers,
              responseTime: Date.now() - startTime
            });
            
            resolve(responsePacket.answers);
          } catch (error) {
            // 尝试手动解析响应
            try {
              const manualParsed = this._manualParsePacket(responseBuffer, domain);
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain,
                type: type.toUpperCase(),
                clientIp,
                source: 'doh-manual',
                success: true,
                results: manualParsed,
                responseTime: Date.now() - startTime
              });
              
              resolve(manualParsed);
            } catch (parseError) {
              // 记录解析错误日志
              dnsLogModel.addLog({
                domain,
                type: type.toUpperCase(),
                clientIp,
                source: 'doh',
                success: false,
                error: `解析响应失败: ${error.message}, 手动解析: ${parseError.message}`,
                responseTime: Date.now() - startTime
              });
              
              reject(new Error(`解析DNS over HTTPS响应失败: ${error.message}`));
            }
          }
        });
      });
      
      req.on('error', (error) => {
        // 记录连接错误日志
        dnsLogModel.addLog({
          domain,
          type: type.toUpperCase(),
          clientIp,
          source: 'doh',
          success: false,
          error: `连接错误: ${error.message}`,
          responseTime: Date.now() - startTime
        });
        
        reject(new Error(`DNS over HTTPS连接错误: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        
        // 记录超时日志
        dnsLogModel.addLog({
          domain,
          type: type.toUpperCase(),
          clientIp,
          source: 'doh',
          success: false,
          error: '查询超时',
          responseTime: Date.now() - startTime
        });
        
        reject(new Error('DNS over HTTPS查询超时'));
      });
      
      // 如果是POST方法，发送数据
      if (postData) {
        req.write(postData);
      }
      
      req.end();
    });
  }
  
  /**
   * 创建DNS查询缓冲区
   * 手动创建DNS查询包，不依赖dns2库的Writer类
   * @param {String} domain - 要查询的域名
   * @param {String} type - 记录类型
   * @returns {Buffer} - DNS查询缓冲区
   */
  _createDNSQueryBuffer(domain, type) {
    // 创建DNS包头 (12字节)
    const header = Buffer.alloc(12);
    
    // 随机ID (2字节)
    const id = Math.floor(Math.random() * 65535);
    header.writeUInt16BE(id, 0);
    
    // 标志 (2字节) - 标准查询, 递归查询
    header.writeUInt16BE(0x0100, 2); // 0x0100 = 0000 0001 0000 0000 (RD=1)
    
    // QDCOUNT - 问题数量 (2字节) - 1个问题
    header.writeUInt16BE(1, 4);
    
    // ANCOUNT, NSCOUNT, ARCOUNT (各2字节) - 全部为0
    header.writeUInt16BE(0, 6);
    header.writeUInt16BE(0, 8);
    header.writeUInt16BE(0, 10);
    
    // 编码域名部分
    const domainParts = domain.split('.');
    let domainBuffer = Buffer.alloc(0);
    
    for (const part of domainParts) {
      const length = Buffer.from([part.length]);
      const partBuffer = Buffer.from(part);
      domainBuffer = Buffer.concat([domainBuffer, length, partBuffer]);
    }
    
    // 结束域名部分，添加0字节
    domainBuffer = Buffer.concat([domainBuffer, Buffer.from([0])]);
    
    // 添加查询类型和类 (4字节)
    const typeBuffer = Buffer.alloc(4);
    
    // 写入类型 (2字节)
    let typeCode = 1; // 默认A记录
    if (type === 'AAAA') typeCode = 28;
    else if (type === 'MX') typeCode = 15;
    else if (type === 'TXT') typeCode = 16;
    else if (type === 'NS') typeCode = 2;
    else if (type === 'CNAME') typeCode = 5;
    else if (type === 'SOA') typeCode = 6;
    else if (type === 'PTR') typeCode = 12;
    else if (type === 'SRV') typeCode = 33;
    typeBuffer.writeUInt16BE(typeCode, 0);
    
    // 写入类 (2字节) - 1表示IN类
    typeBuffer.writeUInt16BE(1, 2);
    
    // 组合所有部分
    return Buffer.concat([header, domainBuffer, typeBuffer]);
  }
  
  /**
   * 手动解析DNS响应包
   * 用于在标准库解析失败时尝试提取数据
   * @param {Buffer} buffer - 响应数据
   * @param {String} domain - 查询的域名
   * @returns {Array} - 解析结果
   */
  _manualParsePacket(buffer, domain) {
    const results = [];
    
    // 解析包头
    const header = buffer.slice(0, 12);
    const ancount = header.readUInt16BE(6); // 回答数量
    
    if (ancount === 0) {
      return results;
    }
    
    // 跳过查询部分
    let pos = 12;
    
    // 跳过域名部分
    while (pos < buffer.length && buffer[pos] !== 0) {
      // 处理域名指针
      if ((buffer[pos] & 0xc0) === 0xc0) {
        pos += 2;
        break;
      }
      
      pos += buffer[pos] + 1;
    }
    
    // 如果是常规域名编码，跳过结束符和类型/类字段
    if (pos < buffer.length && buffer[pos] === 0) {
      pos += 5;
    }
    
    // 尝试解析每个应答
    for (let i = 0; i < ancount && pos + 12 < buffer.length; i++) {
      try {
        // 跳过域名部分
        if ((buffer[pos] & 0xc0) === 0xc0) {
          pos += 2;
        } else {
          while (pos < buffer.length && buffer[pos] !== 0) {
            pos += buffer[pos] + 1;
          }
          pos += 1;
        }
        
        const type = buffer.readUInt16BE(pos);
        pos += 2;
        
        const classValue = buffer.readUInt16BE(pos);
        pos += 2;
        
        const ttl = buffer.readUInt32BE(pos);
        pos += 4;
        
        const rdlength = buffer.readUInt16BE(pos);
        pos += 2;
        
        const answer = {
          name: domain,
          ttl: ttl
        };
        
        // 根据记录类型处理数据
        if (type === 1 && rdlength === 4) { // A记录
          answer.type = 'A';
          answer.address = `${buffer[pos]}.${buffer[pos+1]}.${buffer[pos+2]}.${buffer[pos+3]}`;
          results.push(answer);
        } else if (type === 28 && rdlength === 16) { // AAAA记录
          answer.type = 'AAAA';
          
          // 构造IPv6地址
          let ipv6Parts = [];
          for (let j = 0; j < 8; j++) {
            ipv6Parts.push(buffer.readUInt16BE(pos + j * 2).toString(16));
          }
          answer.address = ipv6Parts.join(':');
          results.push(answer);
        }
        
        pos += rdlength;
      } catch (error) {
        console.error('手动解析记录失败:', error);
        break;
      }
    }
    
    return results;
  }

  /**
   * 查询解析JSON格式的DoH响应
   * 用于支持一些提供JSON响应格式的DoH服务器
   * @param {String} domain - 要查询的域名
   * @param {String} type - 记录类型
   * @param {Object} clientOptions - 客户端配置选项
   * @returns {Promise<Array>} - 查询结果
   */
  async queryJson(domain, type = 'A', clientOptions = {}) {
    const client = this.createClient(clientOptions);
    const startTime = Date.now();
    const clientIp = '127.0.0.1'; // 本地请求
    
    return new Promise((resolve, reject) => {
      // 构建查询URL
      const queryParams = new URLSearchParams({
        name: domain,
        type
      });
      
      // 对于一些支持JSON格式的服务器，如Google的/resolve端点
      const queryPath = `${client.path || '/resolve'}?${queryParams.toString()}`;
      
      const queryOptions = {
        hostname: client.host,
        path: queryPath,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        timeout: client.timeout
      };
      
      // 选择HTTP协议
      const requestLibrary = client.protocol === 'https' ? https : http;
      
      const req = requestLibrary.request(queryOptions, (res) => {
        const chunks = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          // 处理HTTP状态码
          if (res.statusCode !== 200) {
            // 记录HTTP错误日志
            dnsLogModel.addLog({
              domain,
              type: type.toUpperCase(),
              clientIp,
              source: 'doh-json',
              success: false,
              error: `HTTP错误: ${res.statusCode} ${res.statusMessage}`,
              responseTime: Date.now() - startTime
            });
            
            return reject(new Error(`DNS over HTTPS JSON HTTP错误: ${res.statusCode} ${res.statusMessage}`));
          }
          
          try {
            const responseText = Buffer.concat(chunks).toString();
            const jsonResponse = JSON.parse(responseText);
            
            // 检查响应状态
            if (jsonResponse.Status !== 0) {
              // 记录DNS错误日志
              dnsLogModel.addLog({
                domain,
                type: type.toUpperCase(),
                clientIp,
                source: 'doh-json',
                success: false,
                error: `DNS错误码: ${jsonResponse.Status}`,
                responseTime: Date.now() - startTime
              });
              
              return reject(new Error(`DNS over HTTPS JSON DNS错误码: ${jsonResponse.Status}`));
            }
            
            // 记录成功日志
            dnsLogModel.addLog({
              domain,
              type: type.toUpperCase(),
              clientIp,
              source: 'doh-json',
              success: true,
              results: jsonResponse.Answer || [],
              responseTime: Date.now() - startTime
            });
            
            // 处理JSON格式的应答
            const answers = (jsonResponse.Answer || []).map(answer => {
              // 将JSON格式转换为与Packet.decode兼容的格式
              return {
                name: answer.name,
                type: answer.type,
                class: 'IN',
                ttl: answer.TTL,
                data: answer.data
              };
            });
            
            resolve(answers);
          } catch (error) {
            // 记录解析错误日志
            dnsLogModel.addLog({
              domain,
              type: type.toUpperCase(),
              clientIp,
              source: 'doh-json',
              success: false,
              error: `解析JSON响应失败: ${error.message}`,
              responseTime: Date.now() - startTime
            });
            
            reject(new Error(`解析DNS over HTTPS JSON响应失败: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        // 记录连接错误日志
        dnsLogModel.addLog({
          domain,
          type: type.toUpperCase(),
          clientIp,
          source: 'doh-json',
          success: false,
          error: `连接错误: ${error.message}`,
          responseTime: Date.now() - startTime
        });
        
        reject(new Error(`DNS over HTTPS JSON连接错误: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        
        // 记录超时日志
        dnsLogModel.addLog({
          domain,
          type: type.toUpperCase(),
          clientIp,
          source: 'doh-json',
          success: false,
          error: '查询超时',
          responseTime: Date.now() - startTime
        });
        
        reject(new Error('DNS over HTTPS JSON查询超时'));
      });
      
      req.end();
    });
  }
}

module.exports = new DnsOverHttpsService(); 