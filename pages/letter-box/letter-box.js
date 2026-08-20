// pages/letter-box/letter-box.js
// 信箱：自己写的封存信 + 旧的 AI 代写信，统一展示。
// 封存中的信，客户端从来没有拿到过正文 —— 列表接口压根不返回。
const api = require('../../utils/api.js');

Page({
  data: {
    theme: 'cd-dark',
    statusBarHeight: 20,
    loading: true,
    list: [],
    hasAny: false
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}
  },

  onShow() {
    this.setData({ theme: getApp().refreshTheme() });
    this.load();
  },

  async load() {
    try {
      const data = await api.letterVaultList();
      const raw = (data && data.list) || [];
      const list = raw.map(l => this.decorate(l));
      this.setData({ loading: false, list, hasAny: list.length > 0 });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '没能读取信箱', icon: 'none' });
    }
  },

  decorate(l) {
    const writtenText = l.written_at ? this.fmt(l.written_at) : '';
    if (l.kind === 'ai') {
      return Object.assign({}, l, {
        lead: '星语写给你的',
        sub: writtenText ? `写于 ${writtenText}` : '',
        // 遮盖块只是视觉，不承载任何真实内容
        mask: '',
        openable: true
      });
    }
    if (l.status === 'sealed') {
      return Object.assign({}, l, {
        lead: `封存中 · 还剩 ${l.days_left} 天`,
        sub: `${l.open_at} 开启`,
        mask: '■'.repeat(Math.min(Math.max(Math.round((l.length || 40) / 12), 6), 16)),
        openable: false
      });
    }
    if (l.status === 'ready') {
      return Object.assign({}, l, {
        lead: '可以开启了',
        sub: writtenText ? `写于 ${writtenText}` : '',
        mask: '',
        openable: true
      });
    }
    return Object.assign({}, l, {
      lead: `已开启 · ${l.opened_at ? this.fmt(l.opened_at) : ''}`,
      sub: writtenText ? `写于 ${writtenText}` : '',
      mask: '',
      openable: true
    });
  },

  fmt(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  },

  open(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(l => l.id === id);
    if (!item) return;
    if (!item.openable) {
      wx.showToast({ title: `还要等 ${item.days_left} 天`, icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/letter/letter?id=${id}&vault=1` });
  },

  write() {
    wx.navigateTo({ url: '/pages/letter-write/letter-write' });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(l => l.id === id);
    const sealed = item && item.status === 'sealed';
    wx.showModal({
      title: '删掉这封信？',
      content: sealed
        ? '这封信还没开启过。删掉之后它就永远消失了，你自己也再读不到。'
        : '删掉之后找不回来。',
      confirmText: '删掉',
      cancelText: '算了',
      confirmColor: '#C97064',
      success: async res => {
        if (!res.confirm) return;
        try {
          await api.letterDelete(id);
          this.load();
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    return { title: '写一封信给未来的自己', path: '/pages/home/home' };
  }
});
