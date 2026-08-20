const theme = require('../../utils/theme.js');
Page({
  onShow() {
    theme.apply(this, false);
  },
  callHotline() {
    wx.makePhoneCall({ phoneNumber: '12356' });
  },
  callBackup() {
    wx.makePhoneCall({ phoneNumber: '400-161-9995' });
  },
  openLegal(e) {
    wx.navigateTo({ url: `/pages/legal/legal?key=${e.currentTarget.dataset.key}` });
  }
});
