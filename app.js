// app.js
const store = require('./utils/store.js');
const model = require('./utils/model.js');

App({
  globalData: {
    // ---- 账号（沿用原有微信 openid 登录，不改）----
    userInfo: null,
    openid: null,
    isLogin: false,
    nickname: '',
    avatarUrl: '',

    // ---- 旧版保留字段：老页面（profile / wallpaper / chat / letter）仍在读 ----
    province: null,           // { code, name, examType }
    examYear: 2026,
    examDate: '2026-06-07T09:00:00+08:00',
    moodToday: null,          // -2 ~ 2
    dreamSchool: null,
    grade: 'G3',
    guestChatTurns: 0,
    daysRemaining: 0,

    // ---- V2 新增 ----
    exam: null,               // 当前主考试
    theme: 'cd-dark',         // 'cd-dark' | 'cd-light'
    themeMode: 'auto',        // 'auto' | 'dark' | 'light'
    firstLaunch: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d3g1s5sxr76d39626',
        traceUser: true
      });
    }

    // 旧版本地缓存（账号 / 省份 / 梦想院校等）继续读，保证老用户资料不丢
    const cached = wx.getStorageSync('app_state') || {};
    if (cached.province) this.globalData.province = cached.province;
    if (cached.dreamSchool) this.globalData.dreamSchool = cached.dreamSchool;
    if (cached.grade) this.globalData.grade = cached.grade;
    if (cached.nickname) this.globalData.nickname = cached.nickname;
    if (cached.avatarUrl) this.globalData.avatarUrl = cached.avatarUrl;
    if (cached.openid) {
      this.globalData.openid = cached.openid;
      this.globalData.isLogin = true;
    }
    if (cached.examYear) this.globalData.examYear = cached.examYear;
    if (cached.examDate) this.globalData.examDate = cached.examDate;

    // V2 数据层启动：老用户在这里被自动迁移出一条 primary exam
    const booted = store.boot();
    this.globalData.exam = booted.exam;
    this.globalData.firstLaunch = !store.isConfigured();

    this.applyTheme(store.getTheme());
    this.refreshExamBase();
  },

  /** 主题：auto 跟随系统 */
  applyTheme(mode) {
    let m = mode || 'auto';
    let theme = m;
    if (m === 'auto') {
      let sysDark = true;
      try {
        const info = wx.getSystemInfoSync();
        if (info && info.theme) sysDark = info.theme === 'dark';
      } catch (e) {}
      theme = sysDark ? 'dark' : 'light';
    }
    this.globalData.themeMode = m;
    this.globalData.theme = theme === 'light' ? 'cd-light' : 'cd-dark';
    store.setTheme(m);
    this.applyTabBarTheme(theme);
    return this.globalData.theme;
  },

  /** tabBar 不受页面 CSS 变量影响，需要单独设色 */
  applyTabBarTheme(theme) {
    const light = theme === 'light';
    try {
      wx.setTabBarStyle({
        color: light ? '#9A9A94' : '#5D646F',
        selectedColor: light ? '#16181C' : '#F2F4F7',
        backgroundColor: light ? '#FAFAF8' : '#101114',
        borderStyle: light ? 'white' : 'black',
        fail: () => {}
      });
    } catch (e) {}
  },

  /** 同步 V2 exam 到旧字段，让未改造的老页面继续正常工作 */
  syncLegacyFromExam() {
    const exam = store.getExam();
    if (!exam) return;
    this.globalData.exam = exam;
    const target = model.fromKey(exam.target_date);
    if (target) {
      this.globalData.examYear = target.getFullYear();
      this.globalData.examDate = `${exam.target_date}T09:00:00+08:00`;
      this.globalData.daysRemaining = Math.max(model.diffDays(new Date(), target), 0);
    }
    this.persist();
  },

  refreshExamBase() {
    const exam = store.getExam();
    if (exam && exam.target_date) {
      this.syncLegacyFromExam();
      return;
    }
    // 尚未配置：沿用旧的「6/8 后切下一年」规则兜底
    const now = new Date();
    let year = now.getFullYear();
    if (now >= new Date(year, 5, 8, 0, 0, 0)) year += 1;
    this.globalData.examYear = year;
    this.globalData.examDate = `${year}-06-07T09:00:00+08:00`;
  },

  persist() {
    const g = this.globalData;
    wx.setStorageSync('app_state', {
      province: g.province,
      dreamSchool: g.dreamSchool,
      grade: g.grade,
      nickname: g.nickname,
      avatarUrl: g.avatarUrl,
      openid: g.openid,
      examYear: g.examYear,
      examDate: g.examDate
    });
  }
});
