// pages/wallpaper/wallpaper.js
const dateUtil = require('../../utils/date.js');

// 模板配置:30 套渐变背景,按日期循环
const TEMPLATES = [
  ['#FF8C42', '#D4572A', '#6B2D0F'],
  ['#FFD89B', '#FF8C42', '#D4572A'],
  ['#FFC857', '#FF8C42'],
  ['#2C3E50', '#FF8C42'],
  ['#1A1A2E', '#16213E', '#0F3460'],
  ['#F8B195', '#F67280', '#C06C84'],
  ['#355C7D', '#6C5B7B', '#C06C84'],
  ['#A8E6CF', '#88D8B0'],
  ['#FFB6B9', '#FAE3D9'],
  ['#FFEAA7', '#FAB1A0'],
  ['#FFC857', '#D4572A'],
  ['#4ECDC4', '#556270'],
  ['#FFE4C1', '#FFB07A'],
  ['#B8B5FF', '#7868E6'],
  ['#FCDDB0', '#FF9B82'],
  ['#FFDEB4', '#FFB385'],
  ['#FFF0F5', '#FFB6C1', '#FF69B4'],
  ['#E0F7FA', '#80DEEA', '#26C6DA'],
  ['#F3E5F5', '#CE93D8', '#9C27B0'],
  ['#FFFDE7', '#FFF59D', '#FBC02D'],
  ['#EFEBE9', '#BCAAA4', '#795548'],
  ['#FBE9E7', '#FFAB91', '#FF7043'],
  ['#E8F5E8', '#A5D6A7', '#66BB6A'],
  ['#E3F2FD', '#90CAF9', '#42A5F5'],
  ['#FFF8E1', '#FFD54F', '#FF8F00'],
  ['#FCE4EC', '#F8BBD0', '#E91E63'],
  ['#F1F8E9', '#C5E1A5', '#7CB342'],
  ['#FBE9E7', '#FFCCBC', '#FF5722'],
  ['#EDE7F6', '#B39DDB', '#673AB7'],
  ['#FFF3E0', '#FFCC80', '#FB8C00']
];

const QUOTES = [
  '愿你成为想成为的人',
  '所有努力都会被回应',
  '不慌不忙 稳稳到达',
  '把每一天 过成认真的样子',
  '熬过去 就是黎明',
  '相信坚持的力量',
  '一切都会刚刚好',
  '你已经走得很远了',
  '坚持的人 最美',
  '今天的努力 是明天的底气'
];

Page({
  data: {
    statusBarHeight: 20,
    loading: false,
    loadingText: '生成中...',
    regenLeft: 3,
    quote: '',
    templateIndex: 0
  },

  onLoad(options) {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}

    const today = dateUtil.todayStr();
    const cached = wx.getStorageSync('wp_' + today) || {};
    const regenLeft = cached.regenLeft !== undefined ? cached.regenLeft : 3;
    const templateIndex = cached.templateIndex !== undefined ? cached.templateIndex : this.pickDailyTemplate();
    const quote = options.quote ? decodeURIComponent(options.quote) : (cached.quote || QUOTES[templateIndex % QUOTES.length]);

    this.setData({ regenLeft, templateIndex, quote });
    this.saveCache();

    setTimeout(() => this.draw(), 80);

    if (options.auto === 'save') {
      setTimeout(() => this.save(), 800);
    }
  },

  pickDailyTemplate() {
    return Math.floor((Date.now() / 86400000) % TEMPLATES.length);
  },

  saveCache() {
    wx.setStorageSync('wp_' + dateUtil.todayStr(), {
      regenLeft: this.data.regenLeft,
      templateIndex: this.data.templateIndex,
      quote: this.data.quote
    });
  },

  draw() {
    const query = wx.createSelectorQuery();
    query.select('#wpCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const w = res[0].width;
        const h = res[0].height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        // 背景渐变
        const colors = TEMPLATES[this.data.templateIndex];
        const gradient = ctx.createLinearGradient(0, 0, w, h);
        colors.forEach((c, i) => {
          gradient.addColorStop(i / (colors.length - 1 || 1), c);
        });
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        // 装饰圆
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(w * 0.8, h * 0.15, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w * 0.2, h * 0.85, 120, 0, Math.PI * 2);
        ctx.fill();

        // 文字层 — 倒计时数字
        const days = getApp().globalData.daysRemaining || 218;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = 'bold 26px -apple-system';
        ctx.textAlign = 'left';
        ctx.fillText('距 ' + getApp().globalData.examYear + ' 年高考', 36, 80);

        ctx.font = 'bold 120px -apple-system';
        ctx.fillText(String(days), 32, 220);
        ctx.font = '32px -apple-system';
        const numWidth = ctx.measureText(String(days)).width;
        ctx.fillText('天', 32 + numWidth + 12, 220);

        // 梦想院校
        const school = getApp().globalData.dreamSchool || '理想大学';
        ctx.font = '500 28px -apple-system';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(school, 36, 270);

        // 激励语
        ctx.font = '500 26px -apple-system';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'right';
        ctx.fillText(this.data.quote, w - 36, h - 100);

        // 水印
        ctx.font = '22px -apple-system';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'right';
        ctx.fillText('— 高三同行', w - 36, h - 50);

        // 昵称（如有）
        const nick = getApp().globalData.nickname;
        if (nick) {
          ctx.font = '22px -apple-system';
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.textAlign = 'left';
          ctx.fillText('给 ' + nick, 36, h - 50);
        }

        this.canvas = canvas;
      });
  },

  regenerate() {
    if (this.data.regenLeft <= 0) {
      wx.showToast({ title: '今日已用完 明日再来', icon: 'none' });
      return;
    }
    this.setData({ loading: true, loadingText: '正在为你重新挑选...' });
    setTimeout(() => {
      const next = (this.data.templateIndex + Math.floor(Math.random() * 5) + 1) % TEMPLATES.length;
      const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      this.setData({
        templateIndex: next,
        quote,
        regenLeft: this.data.regenLeft - 1,
        loading: false
      });
      this.saveCache();
      this.draw();
    }, 800);
  },

  save() {
    if (!this.canvas) {
      wx.showToast({ title: '画板尚未就绪', icon: 'none' });
      return;
    }
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.showToast({ title: '已保存至相册', icon: 'success' });
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
              wx.showModal({
                title: '需要相册权限',
                content: '请允许小程序保存图片到你的相册',
                confirmText: '去设置',
                success: r => { if (r.confirm) wx.openSetting(); }
              });
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          }
        });
      }
    });
  },

  share() {
    wx.showToast({ title: '点右上角分享给好友', icon: 'none' });
  },

  back() {
    nav.back('/pages/home/home');
  },

  onShareAppMessage() {
    return {
      title: `今天距高考还有 ${getApp().globalData.daysRemaining} 天`,
      path: '/pages/home/home'
    };
  }
});
