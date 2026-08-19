// pages/province/province.js
const { provinces, examTypeLabel, groupByPinyin } = require('../../utils/province.js');

Page({
  data: {
    keyword: '',
    current: null,
    hotList: [],
    groups: [],
    letters: [],
    filtered: [],
    examTypeLabel,
    scrollTo: ''
  },

  onLoad() {
    const hot = provinces.filter(p => p.hot);
    const groups = groupByPinyin(provinces);
    const letters = groups.map(g => g.letter);
    const g = getApp().globalData;
    this.setData({
      hotList: hot,
      groups,
      letters,
      current: g.province
    });
  },

  onSearch(e) {
    const kw = e.detail.value.trim();
    if (!kw) {
      this.setData({ keyword: '', filtered: [] });
      return;
    }
    const filtered = provinces.filter(p =>
      p.name.indexOf(kw) !== -1 || p.pinyin.toLowerCase() === kw.toLowerCase()
    );
    this.setData({ keyword: kw, filtered });
  },

  clearSearch() {
    this.setData({ keyword: '', filtered: [] });
  },

  jumpLetter(e) {
    this.setData({ scrollTo: 'g-' + e.currentTarget.dataset.letter });
  },

  pick(e) {
    const code = e.currentTarget.dataset.code;
    const p = provinces.find(x => x.code === code);
    if (!p) return;
    const province = { code: p.code, name: p.name, examType: p.examType };
    getApp().globalData.province = province;
    getApp().persist();
    // 同步到云端
    wx.cloud.callFunction({
      name: 'user_profile',
      data: { action: 'update', province }
    }).catch(() => {});
    wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '已切换', icon: 'success', duration: 600 });
    setTimeout(() => wx.navigateBack(), 320);
  }
});
