// pages/legal/legal.js
// 三份协议共用一个渲染页，正文来自 utils/legal.js，靠 ?key= 区分。
const theme = require('../../utils/theme.js');
const legal = require('../../utils/legal.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    theme: 'cd-light',
    title: '',
    lead: '',
    updated: legal.UPDATED,
    sections: []
  },

  onLoad(options) {
    const doc = legal.get(options.key);
    if (!doc) {
      wx.showToast({ title: '没有这份文档', icon: 'none' });
      setTimeout(() => nav.back('/pages/settings/settings'), 1000);
      return;
    }
    this.setData({ title: doc.title, lead: doc.lead, sections: doc.sections });
    wx.setNavigationBarTitle({ title: doc.title });
  },

  onShow() {
    theme.apply(this, false);
  },

  onShareAppMessage() {
    return { title: `${legal.BRAND} · ${this.data.title}`, path: '/pages/home/home' };
  }
});
