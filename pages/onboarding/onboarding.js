// pages/onboarding/onboarding.js
Page({
  data: {
    current: 0,
    statusBarHeight: 20,
    slides: [
      { emoji: '⏳', title: '高考倒计时', subtitle: '从今天起 每一天都被认真记录\n你不是一个人在冲刺' },
      { emoji: '🌙', title: '一个懂高三的朋友', subtitle: '难过的、不想说的、说不出口的\n都可以告诉星语 它都在' },
      { emoji: '🎓', title: 'AI 陪你走过高三 300 天', subtitle: '每天一张专属壁纸\n一封来自未来的信\n我们出发吧' }
    ]
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}
  },

  onSwiperChange(e) {
    this.setData({ current: e.detail.current });
  },

  next() {
    if (this.data.current < this.data.slides.length - 1) {
      this.setData({ current: this.data.current + 1 });
    }
  },

  enter() {
    wx.setStorageSync('has_launched', true);
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
