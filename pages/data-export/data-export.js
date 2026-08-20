// pages/data-export/data-export.js
const theme = require('../../utils/theme.js');
const GRADE_LABEL = { G3: '高三', G2: '高二', G1: '高一', REPEAT: '复读' };

Page({
  data: {
    mode: 'view',
    loading: true,
    data: { profile: {}, stats: {} }
  },

  onShow() {
    theme.apply(this, false);
  },


  onLoad(options) {
    this.setData({ mode: options.mode || 'view' });
    this.load();
  },

  async load() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'user_profile',
          data: { action: 'export' },
          success: r => resolve(r.result || {}),
          fail: reject
        });
      });
      const profile = (res.data && res.data.profile) || {};
      profile.provinceName = profile.province ? profile.province.name : '未设置';
      profile.gradeLabel = GRADE_LABEL[profile.grade] || '高三';
      this.setData({
        loading: false,
        data: { profile, stats: (res.data && res.data.stats) || {} }
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  exportJson() {
    const json = JSON.stringify(this.data.data, null, 2);
    wx.setClipboardData({
      data: json,
      success: () => wx.showToast({ title: '已复制 JSON', icon: 'success' })
    });
  }
});
