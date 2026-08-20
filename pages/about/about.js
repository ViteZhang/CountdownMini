const theme = require('../../utils/theme.js');
Page({
  onShow() {
    theme.apply(this, false);
  },
  callHotline() {
    wx.makePhoneCall({ phoneNumber: '400-161-9995' });
  }
});
