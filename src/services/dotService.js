/**
 * DNS over TLS (DoT) 服务模块
 * 提供通过TLS加密的DNS查询服务
 */
const tls = require('tls');
const dns = require('dns');
const { Packet } = require('dns2');
const dnsLogModel = require('../models/dnsLogModel');
const dns2 = require('dns2');

class DnsOverTlsService {
  /**
   * 创建DoT客户端
   * @param {Object} options - 配置选项
   * @returns {Object} - DoT客户端
   */
  createClient(options = {}) {
    const {
      host = '1.1.1.1',
      port = 853,
      servername = 'cloudflare-dns.com',
      timeout = 5000
    } = options;

    return {
      host,
      port,
      servername,
      timeout
    };
  }

  /**
   * 执行DNS over TLS查询
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
      const timeoutId = setTimeout(() => {
        socket.destroy();
        
        // 记录超时日志
        dnsLogModel.addLog({
          domain,
          type: type.toUpperCase(),
          clientIp,
          source: 'dot',
          success: false,
          error: '查询超时',
          responseTime: Date.now() - startTime
        });
        
        reject(new Error('DNS over TLS查询超时'));
      }, client.timeout);
      
      // 创建TLS套接字
      const socket = tls.connect({
        host: client.host,
        port: client.port,
        servername: client.servername,
        rejectUnauthorized: true
      }, () => {
        // TLS连接成功建立
        
        // 创建一个新的Packet实例
        const packet = new Packet();
        
        // 设置头部参数
        packet.header.id = Math.floor(Math.random() * 65535);
        packet.header.rd = 1;
        
        // 添加问题
        packet.questions.push({
          name: domain,
          type: type,
          class: 'IN'
        });
        
        // 获取查询包的二进制数据
        let dnsQueryBuffer;
        try {
          // 手动创建DNS查询缓冲区，不依赖dns2.Writer
          // 创建DNS包头 (12字节)
          const header = Buffer.alloc(12);
          
          // 随机ID (2字节)
          header.writeUInt16BE(packet.header.id, 0);
          
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
          dnsQueryBuffer = Buffer.concat([header, domainBuffer, typeBuffer]);
        } catch (error) {
          console.error('DNS查询编码失败:', error);
          socket.destroy();
          clearTimeout(timeoutId);
          return reject(new Error(`DNS查询编码失败: ${error.message}`));
        }
        
        // 按照RFC标准添加2字节长度前缀
        const lengthBuffer = Buffer.alloc(2);
        lengthBuffer.writeUInt16BE(dnsQueryBuffer.length, 0);
        
        // 发送DNS查询
        socket.write(Buffer.concat([lengthBuffer, dnsQueryBuffer]));
      });
      
      let data = Buffer.alloc(0);
      let remainingBytes = 0;
      let expectedLength = -1;
      
      socket.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
        
        // 如果还没有解析长度，至少需要2个字节
        if (expectedLength === -1 && data.length >= 2) {
          expectedLength = data.readUInt16BE(0);
          remainingBytes = expectedLength;
          data = data.slice(2); // 移除长度前缀
        }
        
        if (expectedLength !== -1 && data.length >= remainingBytes) {
          // 我们收到了足够的数据
          clearTimeout(timeoutId);
          socket.end();
          
          try {
            // 使用正确的dns2 API解码响应
            const responsePacket = Packet.parse(data.slice(0, remainingBytes));
            
            // 记录成功日志
            dnsLogModel.addLog({
              domain,
              type: type.toUpperCase(),
              clientIp,
              source: 'dot',
              success: true,
              results: responsePacket.answers,
              responseTime: Date.now() - startTime
            });
            
            resolve(responsePacket.answers);
          } catch (error) {
            // 尝试手动解析响应
            try {
              // 手动解析DNS响应包
              const manualParsed = this._manualParsePacket(data.slice(0, remainingBytes), domain);
              
              // 记录成功日志
              dnsLogModel.addLog({
                domain,
                type: type.toUpperCase(),
                clientIp,
                source: 'dot-manual',
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
                source: 'dot',
                success: false,
                error: `解析响应失败: ${error.message}, 手动解析: ${parseError.message}`,
                responseTime: Date.now() - startTime
              });
              
              reject(new Error(`解析DNS over TLS响应失败: ${error.message}`));
            }
          }
        }
      });
      
      socket.on('error', (error) => {
        clearTimeout(timeoutId);
        
        // 记录连接错误日志
        dnsLogModel.addLog({
          domain,
          type: type.toUpperCase(),
          clientIp,
          source: 'dot',
          success: false,
          error: `连接错误: ${error.message}`,
          responseTime: Date.now() - startTime
        });
        
        reject(new Error(`DNS over TLS连接错误: ${error.message}`));
      });
      
      socket.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
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
   * 获取服务器指纹信息
   * @param {String} host - 服务器地址
   * @param {Number} port - 服务器端口
   * @returns {Promise<Object>} - 服务器证书信息
   */
  async getServerFingerprint(host, port = 853) {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host,
        port,
        rejectUnauthorized: false
      }, () => {
        const cert = socket.getPeerCertificate(true);
        socket.end();
        resolve({
          fingerprint: cert.fingerprint,
          valid: socket.authorized,
          issuer: cert.issuer,
          subject: cert.subject,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to
        });
      });
      
      socket.on('error', (error) => {
        reject(new Error(`获取服务器指纹失败: ${error.message}`));
      });
    });
  }
}

module.exports = new DnsOverTlsService(); 