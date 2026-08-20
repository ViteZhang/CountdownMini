// pages/feedback/feedback.js
const theme = require('../../utils/theme.js');
Page({
  onShow() {
    theme.apply(this, false);
  },
  data: {
    cats: ['功能建议', 'AI 对话', 'BUG 反馈', 'UI 体验', '其他'],
    cat: '功能建议',
    content: '',
    contact: '',
    submitting: false
  },
  pickCat(e) { this.setData({ cat: e.currentTarget.dataset.name }); },
  onInput(e) { this.setData({ content: e.detail.value }); },
  onContact(e) { this.setData({ contact: e.detail.value }); },
  submit() {
    if (!this.data.content || this.data.submitting) return;
    this.setData({ submitting: true });
    wx.cloud.callFunction({
      name: 'user_profile',
      data: { action: 'feedback', cat: this.data.cat, content: this.data.content, contact: this.data.contact }
    }).then(() => {
      wx.showToast({ title: '感谢你的反馈', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败 请重试', icon: 'none' });
    });
  }
});
