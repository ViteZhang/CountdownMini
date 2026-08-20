// pages/school/school.js
const theme = require('../../utils/theme.js');
const { SCHOOLS } = require('../../utils/schools.js');
const api = require('../../utils/api.js');

const HOT = [
  '清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学',
  '南京大学', '中国科学技术大学', '武汉大学', '中山大学', '四川大学',
  '北京师范大学', '华中科技大学', '西安交通大学', '哈尔滨工业大学', '同济大学',
  '北京航空航天大学', '南开大学', '天津大学', '吉林大学', '山东大学',
  '中国人民大学', '厦门大学', '北京理工大学', '中南大学', '湖南大学',
  '北京邮电大学', '华南理工大学', '电子科技大学', '兰州大学', '东南大学'
];

let debounceTimer = null;

Page({
  data: {
    keyword: '',
    current: '',
    hot: HOT,
    filtered: [],
    inLibrary: false
  },

  onShow() {
    theme.apply(this, false);
  },


  onLoad() {
    const g = getApp().globalData;
    this.setData({ current: g.dreamSchool || '' });
  },

  onSearch(e) {
    const kw = e.detail.value;
    this.setData({ keyword: kw });
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => this.filter(kw.trim()), 150);
  },

  filter(kw) {
    if (!kw) {
      this.setData({ filtered: [], inLibrary: false });
      return;
    }
    const filtered = SCHOOLS.filter(s => s.indexOf(kw) !== -1).slice(0, 30);
    const inLibrary = SCHOOLS.indexOf(kw) !== -1;
    this.setData({ filtered, inLibrary });
  },

  clear() {
    this.setData({ keyword: '', filtered: [], inLibrary: false });
  },

  pick(e) {
    const name = e.currentTarget.dataset.name;
    this.commit(name);
  },

  pickCustom() {
    const name = this.data.keyword.trim();
    if (!name) return;
    this.commit(name);
  },

  commit(name) {
    getApp().globalData.dreamSchool = name;
    getApp().persist();
    wx.cloud.callFunction({
      name: 'user_profile',
      data: { action: 'update', dreamSchool: name }
    }).catch(() => {});
    wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: '已设置', icon: 'success', duration: 600 });
    setTimeout(() => wx.navigateBack(), 320);
  }
});
