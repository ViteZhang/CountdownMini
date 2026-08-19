// pages/history/history.js
const api = require('../../utils/api.js');

Page({
  data: {
    loading: true,
    sessions: []
  },

  onLoad() {
    this.load();
  },

  async load() {
    try {
      const data = await api.chatHistory();
      const list = (data && data.list) || [];
      this.setData({
        loading: false,
        sessions: list.map(s => ({
          ...s,
          dateText: this.formatDate(s.date),
          timeText: this.formatTime(s.created_at),
          preview: s.preview || ''
        }))
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  formatDate(d) {
    if (!d) return '';
    const today = new Date();
    const date = new Date(d);
    const diff = Math.floor((today - date) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff < 7) return diff + ' 天前';
    return d.slice(5);
  },

  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getHours()}:${d.getMinutes() < 10 ? '0' : ''}${d.getMinutes()}`;
  },

  openSession(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/history/detail?id=' + id });
  }
});
