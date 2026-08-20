// pages/settings/settings.js
const theme = require('../../utils/theme.js');
Page({
  data: {
    daily: true,
    dailyTime: '21:30',
    milestone: true,
    isLogin: false
  },

  onShow() {
    theme.apply(this, false);
  },


  onLoad() {
    const cfg = wx.getStorageSync('settings') || {};
    this.setData({
      daily: cfg.daily !== false,
      dailyTime: cfg.dailyTime || '21:30',
      milestone: cfg.milestone !== false,
      isLogin: getApp().globalData.isLogin
    });
  },

  goExamSetup() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding?edit=1' });
  },

  persist() {
    wx.setStorageSync('settings', {
      daily: this.data.daily,
      dailyTime: this.data.dailyTime,
      milestone: this.data.milestone
    });
  },

  toggleDaily(e) {
    this.setData({ daily: e.detail.value });
    this.persist();
  },

  toggleMilestone(e) {
    this.setData({ milestone: e.detail.value });
    this.persist();
  },

  pickTime() {
    wx.showActionSheet({
      itemList: ['20:00', '21:00', '21:30', '22:00', '22:30'],
      success: (res) => {
        const t = ['20:00', '21:00', '21:30', '22:00', '22:30'][res.tapIndex];
        this.setData({ dailyTime: t });
        this.persist();
      }
    });
  },

  subscribe() {
    wx.requestSubscribeMessage({
      tmplIds: ['__REPLACE_WITH_REAL_TEMPLATE_ID__'],
      success: () => {
        wx.showToast({ title: '已授权', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '请到设置开启', icon: 'none' });
      }
    });
  },

  goData() {
    wx.navigateTo({ url: '/pages/data-export/data-export?mode=view' });
  },

  exportData() {
    wx.navigateTo({ url: '/pages/data-export/data-export?mode=export' });
  },

  deleteAccount() {
    wx.showModal({
      title: '确认删除账号？',
      content: '删除将在 7 天后生效。在此期间登录可撤销删除。删除后所有数据将无法恢复。',
      confirmColor: '#C92A2A',
      success: (res) => {
        if (!res.confirm) return;
        wx.cloud.callFunction({
          name: 'user_profile',
          data: { action: 'delete' }
        }).then(() => {
          wx.showToast({ title: '已提交 7 天后生效', icon: 'none', duration: 2000 });
        });
      }
    });
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  openH5(e) {
    const key = e.currentTarget.dataset.key;
    const titles = { terms: '用户协议', privacy: '隐私政策', minor: '未成年人保护说明' };
    wx.showModal({
      title: titles[key],
      content: '协议正文将在上线前由法务定稿。此处为占位。',
      showCancel: false
    });
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  logout() {
    wx.showModal({
      title: '确认退出登录？',
      success: (res) => {
        if (!res.confirm) return;
        const app = getApp();
        app.globalData.openid = null;
        app.globalData.isLogin = false;
        app.persist();
        wx.removeStorageSync('app_state');
        this.setData({ isLogin: false });
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  }
});
