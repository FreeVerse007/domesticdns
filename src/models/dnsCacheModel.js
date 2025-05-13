/**
 * DNS缓存模型
 * 提供DNS查询结果的缓存功能
 */

// 内存缓存存储
const cache = new Map();

// 默认值
const DEFAULT_TTL = 300; // 5分钟
const DEFAULT_MAX_SIZE = 1000; // 最大缓存条目数

class DNSCacheModel {
  constructor(options = {}) {
    this.enabled = options.enable !== undefined ? options.enable : true;
    this.ttl = options.ttl || DEFAULT_TTL;
    this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0
    };
  }

  /**
   * 获取缓存键
   * @private
   * @param {string} domain - 域名
   * @param {string} type - 记录类型
   * @returns {string} - 缓存键
   */
  _getCacheKey(domain, type) {
    return `${domain.toLowerCase()}:${type.toUpperCase()}`;
  }

  /**
   * 从缓存获取记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型
   * @returns {Array|null} - 缓存的记录，如果不存在或已过期则返回null
   */
  get(domain, type) {
    if (!this.enabled) {
      return null;
    }

    const key = this._getCacheKey(domain, type);
    const item = cache.get(key);

    if (!item) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expiresAt) {
      this._removeItem(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.data;
  }

  /**
   * 设置缓存记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型
   * @param {Array} data - 要缓存的DNS记录数据
   * @param {number} ttl - 生存时间(秒)，不指定则使用默认TTL
   * @returns {boolean} - 缓存是否成功
   */
  set(domain, type, data, ttl = null) {
    if (!this.enabled || !data) {
      return false;
    }

    const key = this._getCacheKey(domain, type);
    
    // 计算记录TTL
    let recordTtl = ttl;
    
    // 如果没有指定TTL，查找记录中的TTL
    if (recordTtl === null && Array.isArray(data) && data.length > 0) {
      // 使用记录中的最小TTL
      const recordTtls = data
        .map(record => record.ttl)
        .filter(t => typeof t === 'number' && t > 0);
        
      if (recordTtls.length > 0) {
        recordTtl = Math.min(...recordTtls);
      }
    }
    
    // 如果记录没有TTL或TTL无效，使用默认TTL
    if (recordTtl === null || recordTtl <= 0) {
      recordTtl = this.ttl;
    }

    const cacheItem = {
      data: data,
      createdAt: Date.now(),
      expiresAt: Date.now() + (recordTtl * 1000),
      ttl: recordTtl
    };

    // 检查是否需要清理缓存
    if (cache.size >= this.maxSize && !cache.has(key)) {
      this._evictOldest();
    }

    cache.set(key, cacheItem);
    this.stats.size = cache.size;
    
    return true;
  }

  /**
   * 从缓存中移除一条记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型
   * @returns {boolean} - 是否成功删除
   */
  remove(domain, type) {
    const key = this._getCacheKey(domain, type);
    return this._removeItem(key);
  }

  /**
   * 移除缓存项
   * @private
   * @param {string} key - 缓存键
   * @returns {boolean} - 是否成功删除
   */
  _removeItem(key) {
    const result = cache.delete(key);
    if (result) {
      this.stats.size = cache.size;
    }
    return result;
  }

  /**
   * 清空整个缓存
   * @returns {number} - 清除的缓存项数量
   */
  clear() {
    const size = cache.size;
    cache.clear();
    this.stats.size = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;
    return size;
  }

  /**
   * 清除过期的缓存项
   * @returns {number} - 清除的缓存项数量
   */
  clearExpired() {
    const now = Date.now();
    let count = 0;

    for (const [key, item] of cache.entries()) {
      if (now > item.expiresAt) {
        cache.delete(key);
        count++;
      }
    }

    this.stats.size = cache.size;
    return count;
  }

  /**
   * 驱逐最老的缓存项
   * @private
   * @returns {boolean} - 是否成功驱逐
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, item] of cache.entries()) {
      if (item.createdAt < oldestTime) {
        oldestTime = item.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      return this._removeItem(oldestKey);
    }

    return false;
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} - 缓存统计信息
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * 配置缓存
   * @param {Object} options - 缓存配置
   * @returns {Object} - 当前配置
   */
  configure(options = {}) {
    if (options.enable !== undefined) {
      this.enabled = options.enable;
    }
    if (options.ttl) {
      this.ttl = options.ttl;
    }
    if (options.maxSize) {
      this.maxSize = options.maxSize;
      
      // 如果当前缓存大小超过新的最大值，清理最老的条目
      while (cache.size > this.maxSize) {
        this._evictOldest();
      }
    }
    
    return {
      enable: this.enabled,
      ttl: this.ttl,
      maxSize: this.maxSize
    };
  }
}

module.exports = new DNSCacheModel(); 