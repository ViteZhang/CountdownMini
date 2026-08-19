// pages/letter-box/letter-box.js
const api = require('../../utils/api.js');

Page({
  data: {
    loading: true,
    list: []
  },

  onShow() { this.load(); },

  async load() {
    try {
      const data = await api.letterList();
      const list = (data && data.list) || [];
      this.setData({
        loading: false,
        list: list.map(it => ({
          ...it,
          dateText: this.fmt(it.generated_at),
          preview: (it.content || '').slice(0, 80)
        }))
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  fmt(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth() + 1 < 10 ? '0' : ''}${d.getMonth() + 1}-${d.getDate() < 10 ? '0' : ''}${d.getDate()}`;
  },

  open(e) {
    wx.navigateTo({ url: '/pages/letter/letter?id=' + e.currentTarget.dataset.id });
  },

  generate() {
    wx.navigateTo({ url: '/pages/letter/letter?action=generate' });
  }
});
