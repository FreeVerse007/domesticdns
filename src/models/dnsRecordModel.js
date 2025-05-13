/**
 * DNS记录模型
 */

// 简单的内存存储，实际应用中可能需要使用数据库
const records = new Map();

class DNSRecordModel {
  /**
   * 添加DNS记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型 (A, AAAA, CNAME, MX, TXT...)
   * @param {string} value - 记录值
   * @param {number} ttl - 生存时间(秒)
   * @param {number} priority - 优先级 (仅MX记录需要)
   * @returns {Object} - 新增记录
   */
  addRecord(domain, type, value, ttl = 300, priority = 10) {
    if (!domain || !type || !value) {
      throw new Error('域名、类型和值不能为空');
    }
    
    const normalizedDomain = domain.toLowerCase();
    const normalizedType = type.toUpperCase();
    
    // 检查记录类型是否有效
    if (!['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].includes(normalizedType)) {
      throw new Error(`不支持的记录类型: ${normalizedType}`);
    }
    
    const key = `${normalizedDomain}:${normalizedType}`;
    const record = {
      domain: normalizedDomain,
      type: normalizedType,
      value,
      ttl,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // 对MX记录添加优先级
    if (normalizedType === 'MX') {
      record.priority = priority;
    }
    
    if (!records.has(key)) {
      records.set(key, []);
    }
    
    records.get(key).push(record);
    return record;
  }
  
  /**
   * 获取域名的所有记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型 (可选)
   * @returns {Array} - 记录列表
   */
  getRecords(domain, type) {
    if (!domain) {
      throw new Error('域名不能为空');
    }
    
    const normalizedDomain = domain.toLowerCase();
    const results = [];
    
    if (type) {
      const normalizedType = type.toUpperCase();
      const key = `${normalizedDomain}:${normalizedType}`;
      const domainRecords = records.get(key) || [];
      results.push(...domainRecords);
    } else {
      // 获取所有类型的记录
      for (const [key, value] of records.entries()) {
        if (key.startsWith(`${normalizedDomain}:`)) {
          results.push(...value);
        }
      }
    }
    
    return results;
  }
  
  /**
   * 更新DNS记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型
   * @param {string} oldValue - 旧值
   * @param {string} newValue - 新值
   * @param {number} ttl - 新的TTL (可选)
   * @param {number} priority - 新的优先级 (可选，仅MX记录)
   * @returns {boolean} - 更新是否成功
   */
  updateRecord(domain, type, oldValue, newValue, ttl, priority) {
    if (!domain || !type || !oldValue || !newValue) {
      throw new Error('域名、类型、旧值和新值不能为空');
    }
    
    const normalizedDomain = domain.toLowerCase();
    const normalizedType = type.toUpperCase();
    const key = `${normalizedDomain}:${normalizedType}`;
    
    const domainRecords = records.get(key);
    if (!domainRecords) {
      return false;
    }
    
    let updated = false;
    for (const record of domainRecords) {
      if (record.value === oldValue) {
        record.value = newValue;
        record.updatedAt = Date.now();
        
        if (ttl !== undefined) {
          record.ttl = ttl;
        }
        
        if (normalizedType === 'MX' && priority !== undefined) {
          record.priority = priority;
        }
        
        updated = true;
      }
    }
    
    return updated;
  }
  
  /**
   * 删除DNS记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型 (可选)
   * @param {string} value - 记录值 (可选)
   * @returns {number} - 删除的记录数量
   */
  deleteRecord(domain, type, value) {
    if (!domain) {
      throw new Error('域名不能为空');
    }
    
    const normalizedDomain = domain.toLowerCase();
    let deletedCount = 0;
    
    if (type) {
      const normalizedType = type.toUpperCase();
      const key = `${normalizedDomain}:${normalizedType}`;
      
      if (value) {
        // 删除特定值的记录
        const domainRecords = records.get(key);
        if (domainRecords) {
          const initialLength = domainRecords.length;
          const filteredRecords = domainRecords.filter(record => record.value !== value);
          deletedCount = initialLength - filteredRecords.length;
          
          if (filteredRecords.length === 0) {
            records.delete(key);
          } else {
            records.set(key, filteredRecords);
          }
        }
      } else {
        // 删除所有指定类型的记录
        if (records.has(key)) {
          deletedCount = records.get(key).length;
          records.delete(key);
        }
      }
    } else {
      // 删除域名下所有记录
      for (const [key, value] of records.entries()) {
        if (key.startsWith(`${normalizedDomain}:`)) {
          deletedCount += value.length;
          records.delete(key);
        }
      }
    }
    
    return deletedCount;
  }
  
  /**
   * 导入DNS记录
   * @param {Array} recordsArray - 记录数组
   * @returns {number} - 导入的记录数量
   */
  importRecords(recordsArray) {
    if (!Array.isArray(recordsArray)) {
      throw new Error('记录必须是数组格式');
    }
    
    let importCount = 0;
    for (const record of recordsArray) {
      try {
        this.addRecord(
          record.domain,
          record.type,
          record.value,
          record.ttl,
          record.priority
        );
        importCount++;
      } catch (error) {
        console.error(`导入记录失败: ${error.message}`, record);
      }
    }
    
    return importCount;
  }
  
  /**
   * 导出所有DNS记录
   * @returns {Array} - 所有记录数组
   */
  exportRecords() {
    const allRecords = [];
    for (const recordArray of records.values()) {
      allRecords.push(...recordArray);
    }
    return allRecords;
  }
}

module.exports = new DNSRecordModel(); 