// pages/wallpaper-gallery/wallpaper-gallery.js
const api = require('../../utils/api.js');

Page({
  data: {
    loading: true,
    list: []
  },
  onShow() { this.load(); },
  async load() {
    try {
      const data = await api.call('wallpaper_today', { action: 'list' });
      const list = (data && data.list) || [];
      this.setData({ loading: false, list });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  preview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  }
});
