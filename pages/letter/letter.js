// pages/letter/letter.js
// 读信页。信只有一个来源：letter_vault。
// 封存信的正文永远由服务端在到期后下发，客户端不缓存、不预取。
const api = require('../../utils/api.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    statusBarHeight: 20,
    stage: 'loading',  // loading -> reading
    loadingText: '正在拆封...',
    content: '',
    contentShown: '',
    streaming: false,
    sign: '',
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

    if (options.id) {
      this.loadFromVault(options.id);
    } else {
      // 没有信可读就别停在空页面上
      this.bounce('没有指定要读哪封信');
    }
  },

  /** 从信件保险箱开启。未到期时服务端会拒绝，这里如实告诉用户还要等多久。 */
  async loadFromVault(id) {
    this.setData({ stage: 'loading', loadingText: '正在拆封...' });
    try {
      const res = await api.call('letter_vault', { action: 'open', id });
      const content = res && res.content;
      if (content) {
        this.setData({
          content,
          letterId: id,
          // 自己写的信落款是过去的自己；旧的 AI 代写信保持原来的署名
          sign: res.kind === 'ai' ? '—— 星语' : '—— 过去的你'
        });
        this.enterReading();
        return;
      }
      this.bounce((res && res.msg) === 'still_sealed' ? '还没到开启的日子' : '没能打开这封信');
    } catch (e) {
      this.bounce('网络异常');
    }
  },

  bounce(msg) {
    wx.showToast({ title: msg, icon: 'none' });
    setTimeout(() => nav.back('/pages/letter-box/letter-box'), 1200);
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

  saveCard() {
    wx.showToast({ title: '卡片生成 V1.1 上线', icon: 'none' });
  },

  back() {
    nav.back('/pages/letter-box/letter-box');
  }
});
