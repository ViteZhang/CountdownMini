// pages/profile/profile.js
const theme = require('../../utils/theme.js');
const nav = require('../../utils/nav.js');
const model = require('../../utils/model.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');
const { ensureLogin } = require('../../utils/auth.js');

const THEME_LABEL = { auto: '跟随时间', light: '日间', dark: '夜间' };

const GRADE_LABEL = { G3: '高三', G2: '高二', G1: '高一', REPEAT: '复读' };

// GRADE_LABEL 是高考语境的（高一/高二/高三），中考用户套上去会显示成「高一」，是错的。
// 在 profile-edit 里补出初中年级之前，年级只对高考展示。
const GRADE_APPLIES = ['gaokao'];

Page({
  data: {
    statusBarHeight: 20,
    nickname: '',
    avatarUrl: '',
    metaText: '',
    dreamSchool: '',
    examTitle: '考试',
    themeLabel: '跟随时间',
    hasLetter: false,
    letterStatus: '写一封给未来的自己'
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
      dreamSchool: g.dreamSchool || '',
      metaText: this.buildMeta(g),
      examTitle: this.examTitle()
    });
    this.loadLetterStatus();
  },

  examTitle() {
    const exam = store.getExam();
    return (exam && exam.title) || '考试';
  },

  /**
   * 资料行。天数与考试名都取自当前主考试 —— 不能写死「距高考 X 天」，
   * 用户可能准备的是中考 / 考研 / 考公 / 自定义考试。
   */
  buildMeta(g) {
    const exam = store.getExam();
    const parts = [];
    if (g.province && g.province.name) parts.push(g.province.name);
    if (exam && GRADE_APPLIES.indexOf(exam.type) >= 0 && g.grade) {
      parts.push(GRADE_LABEL[g.grade] || '');
    }
    if (exam) {
      const s = model.computeExam(exam);
      if (s.isExamDay) parts.push(`${exam.title}就是今天`);
      else if (s.isAfterExam) parts.push(`${exam.title}已结束`);
      else parts.push(`距${exam.title} ${s.remaining} 天`);
    }
    return parts.filter(Boolean).join(' · ');
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

  onShareAppMessage() {
    return {
      title: `我在记录距${this.data.examTitle}还剩多少天，也记下已经走过多少天`,
      path: '/pages/home/home'
    };
  }
});
