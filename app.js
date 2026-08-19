// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    isLogin: false,
    province: null,           // { code, name, examType }
    examYear: 2026,
    examDate: '2026-06-07T09:00:00+08:00',
    moodToday: null,          // -2 ~ 2
    dreamSchool: null,
    grade: 'G3',
    nickname: '',
    avatarUrl: '',
    guestChatTurns: 0,        // 未登录态对话轮次
    daysRemaining: 0
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d3g1s5sxr76d39626',
        traceUser: true
      });
    }

    // 读取本地缓存
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

    // 计算高考年份与基准时间
    this.refreshExamBase();

    // 检查是否首次启动
    const launched = wx.getStorageSync('has_launched');
    if (!launched) {
      // 不在 onLaunch 内 redirect，交给 onShow / 首页判断
      this.globalData.firstLaunch = true;
    }
  },

  refreshExamBase() {
    // 每年 6/8 之后切到下一年
    const now = new Date();
    let year = now.getFullYear();
    const cutoff = new Date(year, 5, 8, 0, 0, 0); // 6/8 00:00
    if (now >= cutoff) year += 1;
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
