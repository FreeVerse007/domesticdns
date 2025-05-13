/**
 * Chart Lite - 一个极简的图表库，为DNS测试页面提供离线支持
 */
class ChartLite {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    
    // 确保canvas元素存在
    if (!canvas || !canvas.getContext) {
      console.error('Canvas不可用');
      return;
    }

    try {
      this.ctx = canvas.getContext('2d');
      this.data = config.data || { datasets: [] };
      this.options = config.options || {};
      this.isDestroyed = false;
      
      // 设置canvas大小，确保正确显示
      this.setupCanvas();
      
      // 绘制图表
      this.draw();
      
      // 输出日志，帮助调试
      console.log('图表创建完成，数据:', this.data);
    } catch (e) {
      console.error('初始化图表时出错:', e);
    }
  }
  
  // 设置Canvas大小
  setupCanvas() {
    if (!this.canvas) return;
    
    // 确保Canvas有固定的大小，避免响应式问题
    if (!this.canvas.width || this.canvas.width < 100) {
      this.canvas.width = 600;
    }
    
    if (!this.canvas.height || this.canvas.height < 100) {
      this.canvas.height = 300;
    }
    
    // 使用固定尺寸而非响应式尺寸，避免渲染问题
    this.canvas.style.width = '100%';
    this.canvas.style.height = this.canvas.height + 'px';
    this.canvas.style.maxWidth = '100%';
    
    console.log(`Canvas尺寸设置为: ${this.canvas.width}x${this.canvas.height}`);
  }

  // 绘制图表
  draw() {
    // 如果已销毁则不执行绘制
    if (this.isDestroyed) return;

    try {
      const { ctx, canvas, data } = this;
      
      // 检查必要对象是否存在
      if (!ctx || !canvas) {
        console.error('Canvas上下文不可用');
        return;
      }
      
      // 使用实际像素尺寸
      const width = canvas.width;
      const height = canvas.height;
      
      // 清空画布
      ctx.clearRect(0, 0, width, height);
      
      // 如果没有数据，显示空状态
      if (!data || !data.datasets || !data.datasets.length) {
        this.drawEmptyState(width, height);
        return;
      }
      
      // 找出数据中的最大值，用于确定比例
      const dataset = data.datasets[0];
      const values = Array.isArray(dataset.data) ? dataset.data : [];
      
      // 确保所有数据都是数字
      for (let i = 0; i < values.length; i++) {
        if (typeof values[i] !== 'number') {
          values[i] = 0;
        }
      }
      
      // 输出数据，帮助调试
      console.log('绘制图表数据:', values);
      
      // 检查是否有有效数据
      if (values.length === 0) {
        this.drawEmptyState(width, height);
        return;
      }
      
      // 最大值，至少为1，防止除以0
      let max = Math.max(...values.filter(v => typeof v === 'number'), 1);
      
      // 至少为10，保证当数值很小时图表也有一定高度
      max = Math.max(max, 10);
      
      // 绘制背景和轴线
      this.drawBackground(width, height, max);
      
      // 计算柱状图的尺寸和位置
      const barCount = values.length;
      const padding = 40; // 图表边距
      const innerWidth = width - (padding * 2); // 内部宽度
      const barSpacing = Math.max(5, Math.floor(innerWidth * 0.01)); // 减小柱子之间的间距
      const barWidth = Math.max(20, Math.floor((innerWidth - (barSpacing * (barCount - 1))) / barCount));
      const maxBarHeight = height - (padding * 2);
      
      // 设置柱状图样式
      ctx.fillStyle = dataset.backgroundColor || 'rgba(52, 152, 219, 0.7)';
      ctx.strokeStyle = dataset.borderColor || 'rgba(52, 152, 219, 1)';
      ctx.lineWidth = dataset.borderWidth || 1;
      
      // 绘制每个柱子
      for (let i = 0; i < barCount; i++) {
        const value = values[i];
        if (typeof value !== 'number') continue;
        
        // 计算柱子高度，至少为1像素（如果值大于0）
        const barHeight = value > 0 ? Math.max(1, (value * maxBarHeight / max)) : 0;
        const x = padding + i * (barWidth + barSpacing);
        const y = height - padding - barHeight;
        
        // 绘制柱子
        ctx.beginPath();
        ctx.rect(x, y, barWidth, barHeight);
        ctx.fill();
        ctx.stroke();
        
        // 绘制标签
        if (data.labels && data.labels[i]) {
          ctx.fillStyle = '#333';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(data.labels[i], x + barWidth / 2, height - 15);
        }
        
        // 绘制数值 - 确保始终显示
        ctx.fillStyle = '#333';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        
        // 将数值显示在柱子上方（或者如果没有柱子，直接显示在底部上方）
        const textY = value > 0 ? Math.max(y - 8, 15) : height - padding - 8;
        ctx.fillText(value.toString(), x + barWidth / 2, textY);
      }
      
      // 添加图表标题
      if (dataset.label) {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(dataset.label, width / 2, 25);
      }
    } catch (e) {
      console.error('绘制图表时出错:', e);
    }
  }
  
  // 绘制背景和轴线
  drawBackground(width, height, maxValue) {
    try {
      const { ctx } = this;
      
      if (!ctx) return;
      
      const padding = 40; // 图表边距
      
      // 绘制坐标轴
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      
      // X轴
      ctx.beginPath();
      ctx.moveTo(padding, height - padding);
      ctx.lineTo(width - padding, height - padding);
      ctx.stroke();
      
      // Y轴
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, height - padding);
      ctx.stroke();
      
      // 绘制网格线和数值刻度
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 0.5;
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      
      // 水平网格线（4条）
      const gridStep = (height - (padding * 2)) / 4;
      for (let i = 0; i <= 4; i++) {
        const y = height - padding - (gridStep * i);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        
        // 添加Y轴刻度值
        const value = Math.round((maxValue * i) / 4);
        ctx.fillText(value.toString(), padding - 5, y + 4);
      }
    } catch (e) {
      console.error('绘制背景时出错:', e);
    }
  }
  
  // 绘制空状态
  drawEmptyState(width, height) {
    try {
      const { ctx } = this;
      
      if (!ctx) return;
      
      ctx.fillStyle = '#999';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', width / 2, height / 2);
    } catch (e) {
      console.error('绘制空状态时出错:', e);
    }
  }
  
  // 更新数据并重绘
  update() {
    if (this.isDestroyed) return;
    
    try {
      console.log('更新图表，数据:', this.data);
      if (this.data && this.data.datasets && this.data.datasets.length > 0) {
        const dataset = this.data.datasets[0];
        console.log('数据值:', dataset.data);
        
        // 确保所有数据都是数字
        if (Array.isArray(dataset.data)) {
          for (let i = 0; i < dataset.data.length; i++) {
            if (typeof dataset.data[i] !== 'number') {
              dataset.data[i] = 0;
            }
          }
        }
      }
      
      // 重新绘制
      this.draw();
    } catch (e) {
      console.error('更新图表时出错:', e);
    }
  }
  
  // 销毁图表
  destroy() {
    try {
      if (this.isDestroyed) return;
      
      const { ctx, canvas } = this;
      
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      
      // 标记为已销毁
      this.isDestroyed = true;
      
      // 清空所有引用
      this.canvas = null;
      this.ctx = null;
      this.data = null;
      this.options = null;
      this.config = null;
      
      console.log('图表已成功销毁');
    } catch (e) {
      console.error('销毁图表时出错:', e);
    }
  }
}

// 全局Chart对象，兼容Chart.js API
window.Chart = ChartLite; 