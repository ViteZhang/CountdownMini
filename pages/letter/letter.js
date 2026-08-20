// pages/letter/letter.js
const api = require('../../utils/api.js');

Page({
  data: {
    statusBarHeight: 20,
    stage: 'envelope',  // envelope -> loading -> reading
    loadingText: '星语正在为你写信...',
    content: '',
    contentShown: '',
    streaming: false,
    regenLeft: 1,
    nickname: '',
    stars: [],
    letterId: ''
  },

  onLoad(options) {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}

    const stars = [];
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        d: Math.random() * 2
      });
    }
    this.setData({ stars, nickname: getApp().globalData.nickname || '亲爱的我' });

    if (options.action === 'generate') {
      this.generate();
    } else if (options.id && options.vault) {
      // 封存信：正文只能由服务端在到期后下发
      this.loadFromVault(options.id);
    } else if (options.id) {
      this.loadById(options.id);
    }
  },

  openEnvelope() {
    if (this.data.content) {
      this.enterReading();
    } else {
      this.generate();
    }
  },

  async generate() {
    this.setData({ stage: 'loading', loadingText: '星语正在为你写信...' });
    try {
      const data = await api.letterGenerate(false);
      if (data && data.content) {
        this.setData({
          content: data.content,
          letterId: data.id || '',
          regenLeft: data.regen_left !== undefined ? data.regen_left : 1
        });
        this.enterReading();
      } else {
        wx.showToast({ title: '生成失败 请重试', icon: 'none' });
        this.setData({ stage: 'envelope' });
      }
    } catch (e) {
      wx.showToast({ title: '网络异常', icon: 'none' });
      this.setData({ stage: 'envelope' });
    }
  },

  async regenerate() {
    if (this.data.regenLeft <= 0) {
      wx.showToast({ title: '本周已用完 下周再来', icon: 'none' });
      return;
    }
    this.setData({ stage: 'loading', loadingText: '星语正在重新落笔...', content: '', contentShown: '' });
    try {
      const data = await api.letterGenerate(true);
      if (data && data.content) {
        this.setData({
          content: data.content,
          letterId: data.id || '',
          regenLeft: data.regen_left !== undefined ? data.regen_left : 0
        });
        this.enterReading();
      }
    } catch (e) {
      wx.showToast({ title: '生成失败', icon: 'none' });
      this.setData({ stage: 'envelope' });
    }
  },

  enterReading() {
    this.setData({ stage: 'reading', streaming: true, contentShown: '' });
    this.streamPrint();
  },

  streamPrint() {
    const full = this.data.content;
    let i = 0;
    const step = () => {
      i += 2;
      this.setData({ contentShown: full.slice(0, i) });
      if (i < full.length) {
        setTimeout(step, 35);
      } else {
        this.setData({ streaming: false });
      }
    };
    step();
  },

  /** 从信件保险箱开启。未到期时服务端会拒绝，这里如实告诉用户还要等多久。 */
  async loadFromVault(id) {
    this.setData({ stage: 'loading', loadingText: '正在拆封...' });
    try {
      const res = await api.call('letter_vault', { action: 'open', id });
      const content = res && res.content;
      if (content) {
        this.setData({ content, letterId: id });
        this.enterReading();
        return;
      }
      const msg = (res && res.msg) === 'still_sealed'
        ? '还没到开启的日子'
        : '没能打开这封信';
      wx.showToast({ title: msg, icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (e) {
      wx.showToast({ title: '网络异常', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  async loadById(id) {
    this.setData({ stage: 'loading', loadingText: '正在拆封...' });
    try {
      const data = await api.call('letter_generate', { action: 'detail', id });
      if (data && data.content) {
        this.setData({ content: data.content, letterId: id });
        this.enterReading();
      }
    } catch (e) {
      this.setData({ stage: 'envelope' });
    }
  },

  saveCard() {
    wx.showToast({ title: '卡片生成 V1.1 上线', icon: 'none' });
  },

  back() {
    wx.navigateBack();
  }
});
