// pages/profile/profile.js
const theme = require('../../utils/theme.js');
const nav = require('../../utils/nav.js');
const dateUtil = require('../../utils/date.js');
const api = require('../../utils/api.js');
const { ensureLogin } = require('../../utils/auth.js');

const THEME_LABEL = { auto: '跟随时间', light: '日间', dark: '夜间' };

const GRADE_LABEL = { G3: '高三', G2: '高二', G1: '高一', REPEAT: '复读' };

Page({
  data: {
    statusBarHeight: 20,
    nickname: '',
    avatarUrl: '',
    provinceName: '未设置',
    gradeLabel: '高三',
    dreamSchool: '',
    days: 0,
    stats: { days: 0, chats: 0, checkins: 0 },
    themeLabel: '跟随时间',
    hasLetter: false,
    letterStatus: '设置梦想院校后 星语将为你写下一封来自未来的信'
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}
  },

  onShow() {

    theme.apply(this, true);
    this.refresh();
    this.setData({ themeLabel: THEME_LABEL[getApp().globalData.themeMode] || '跟随时间' });
  },

  /** 外观：默认「跟随时间」（白天浅色、天黑深色），也可固定为日间 / 夜间 */
  pickTheme() {
    const modes = ['auto', 'light', 'dark'];
    wx.showActionSheet({
      itemList: modes.map(m => THEME_LABEL[m]),
      success: res => {
        const m = modes[res.tapIndex];
        getApp().applyTheme(m);
        this.setData({ themeLabel: THEME_LABEL[m] });
      },
      fail: () => {}
    });
  },

  goExamSetup() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding?edit=1' });
  },

  refresh() {
    const g = getApp().globalData;
    this.setData({
      nickname: g.nickname || '',
      avatarUrl: g.avatarUrl || '',
      provinceName: g.province ? g.province.name : '未设置',
      gradeLabel: GRADE_LABEL[g.grade] || '高三',
      dreamSchool: g.dreamSchool || '',
      days: g.daysRemaining || dateUtil.diffCountdown().days
    });
    this.loadStats();
    this.loadLetterStatus();
  },

  async loadStats() {
    try {
      const data = await api.call('user_profile', { action: 'stats' });
      if (data && data.stats) this.setData({ stats: data.stats });
    } catch (e) {}
  },

  async loadLetterStatus() {
    try {
      const data = await api.letterVaultList();
      const list = (data && data.list) || [];
      const ready = list.filter(l => l.status === 'ready').length;
      const sealed = list.filter(l => l.status === 'sealed').length;
      if (ready) {
        this.setData({ hasLetter: true, letterStatus: `有 ${ready} 封可以开启了` });
      } else if (sealed) {
        this.setData({ hasLetter: false, letterStatus: `${sealed} 封封存中 · 点击查看` });
      } else if (list.length) {
        this.setData({ hasLetter: false, letterStatus: `已有 ${list.length} 封 · 点击查看` });
      } else {
        this.setData({ hasLetter: false, letterStatus: '写一封给未来的自己' });
      }
    } catch (e) {}
  },

  editProfile() {
    if (!getApp().globalData.isLogin) {
      ensureLogin('登录后即可编辑你的资料').then(() => this.refresh()).catch(() => {});
      return;
    }
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
  },

  openSchool() {
    ensureLogin('登录后即可设置梦想院校').then(() => {
      wx.navigateTo({ url: '/pages/school/school' });
    }).catch(() => {});
  },

  openLetter() {
    // 信箱里既有自己写的封存信，也有旧的星语代写信，不再卡梦想院校
    wx.switchTab({ url: '/pages/letter-box/letter-box' });
  },

  goBack() {
    nav.back('/pages/home/home');
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  goMoodCurve() { wx.navigateTo({ url: '/pages/mood-curve/mood-curve' }); },
  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  goWallpapers() { wx.navigateTo({ url: '/pages/wallpaper-gallery/wallpaper-gallery' }); },
  goAchievement() { wx.showToast({ title: '成就页 V1.1 上线', icon: 'none' }); },

  onShareAppMessage() {
    return {
      title: `${this.data.nickname || '我'}正在用「高三同行」 你要不要也来？`,
      path: '/pages/home/home'
    };
  }
});
