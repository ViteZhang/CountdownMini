// pages/home/home.js
const dateUtil = require('../../utils/date.js');
const provinceUtil = require('../../utils/province.js');
const api = require('../../utils/api.js');
const { ensureLogin } = require('../../utils/auth.js');

const MOODS = [
  { level: 2, emoji: '😀', label: '很好', hint: '今天状态不错！想和我分享点什么吗？' },
  { level: 1, emoji: '🙂', label: '不错', hint: '嗯，平平稳稳就好。今天有什么收获？' },
  { level: 0, emoji: '😐', label: '一般', hint: '如果你想聊聊，我都在。' },
  { level: -1, emoji: '😔', label: '低落', hint: '今天好像不太好，可以告诉我发生什么了吗？' },
  { level: -2, emoji: '😭', label: '很差', hint: '看到你这样，我也很担心。慢慢说，我在听。' }
];

const QUOTES = [
  '你只管努力 剩下的交给时间',
  '不必担心明天 你已经走得很远',
  '愿你成为想成为的人',
  '熬过去的日子 都长成了未来的你',
  '在该睡的时候睡 在该努力的时候努力',
  '所有的耐心 都会被这个夏天回应',
  '你不必完美 你只需要尽力',
  '此刻翻的每一页书 都在替未来的你说话'
];

const WALLPAPER_QUOTES = [
  '愿你成为想成为的人',
  '所有努力都会被回应',
  '不慌不忙 稳稳到达',
  '把每一天 过成认真的样子',
  '熬过去 就是黎明',
  '相信坚持的力量',
  '一切都会刚刚好'
];

Page({
  data: {
    statusBarHeight: 20,
    scrollTop: 0,
    refreshing: false,

    examYear: 2026,
    days: 218,
    hh: '00',
    mm: '00',
    ss: '00',
    examDateText: '',
    showMilestones: false,
    milestones: [],

    province: null,
    examTypeLabel: '',

    moods: MOODS,
    moodToday: null,
    moodLabel: '',

    dreamSchool: '',
    wallpaperQuote: '',
    dailyQuote: ''
  },

  timer: null,

  onLoad() {
    // 首次启动跳引导
    const launched = wx.getStorageSync('has_launched');
    if (!launched) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}

    this.initFromGlobal();
    this.tryAutoLocate();
    this.fetchHomeData();
  },

  onShow() {
    this.initFromGlobal();
    this.startCountdown();
    // 选择一句随机金句（按日期固定）
    const idx = Math.floor((Date.now() / 86400000) % QUOTES.length);
    this.setData({
      dailyQuote: QUOTES[idx],
      wallpaperQuote: WALLPAPER_QUOTES[idx % WALLPAPER_QUOTES.length]
    });
    this.drawWallpaper();
  },

  onHide() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  initFromGlobal() {
    const g = getApp().globalData;
    const province = g.province;
    const label = province ? provinceUtil.examTypeLabel[province.examType] : '';
    this.setData({
      province,
      examTypeLabel: label,
      examYear: dateUtil.getExamYear(),
      examDateText: dateUtil.formatExamDate(),
      dreamSchool: g.dreamSchool || ''
    });
    this.setMilestones();
  },

  setMilestones() {
    const year = dateUtil.getExamYear();
    this.setData({
      milestones: [
        { label: '一模', date: `${year - 1}-12 ~ ${year}-01` },
        { label: '二模', date: `${year}-03 ~ ${year}-04` },
        { label: '三模', date: `${year}-05` },
        { label: '高考', date: `${year}-06-07` }
      ]
    });
  },

  startCountdown() {
    if (this.timer) clearInterval(this.timer);
    const tick = () => {
      const c = dateUtil.diffCountdown();
      this.setData({
        days: c.days,
        hh: dateUtil.pad2(c.hours),
        mm: dateUtil.pad2(c.minutes),
        ss: dateUtil.pad2(c.seconds),
        examYear: c.year
      });
      const g = getApp().globalData;
      g.daysRemaining = c.days;
    };
    tick();
    this.timer = setInterval(tick, 1000);
  },

  tryAutoLocate() {
    const g = getApp().globalData;
    if (g.province) return;
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) {
          this.doLocate();
        }
        // 否则不主动弹授权 — 等用户点击省份切换
      }
    });
  },

  doLocate() {
    wx.getLocation({
      type: 'gcj02',
      success: (loc) => {
        // 简化:用 wx.reverseGeocoder 不一定开 — 用经纬度大致判断或交给用户手选
        // MVP:不做地理反查,提示用户手动选择
      }
    });
  },

  onScroll(e) {
    this.setData({ scrollTop: e.detail.scrollTop });
  },

  async onRefresh() {
    this.setData({ refreshing: true });
    try {
      await this.fetchHomeData();
    } catch (e) {}
    this.setData({ refreshing: false });
  },

  async fetchHomeData() {
    try {
      const data = await api.homeInit();
      if (!data) return;
      const g = getApp().globalData;
      if (data.profile) {
        if (data.profile.province) g.province = data.profile.province;
        if (data.profile.dreamSchool) g.dreamSchool = data.profile.dreamSchool;
        if (data.profile.nickname) g.nickname = data.profile.nickname;
        if (data.profile.avatarUrl) g.avatarUrl = data.profile.avatarUrl;
      }
      if (data.moodToday !== undefined) {
        g.moodToday = data.moodToday;
        this.applyMood(data.moodToday);
      }
      this.initFromGlobal();
    } catch (e) {
      // 静默
    }
  },

  openProvince() {
    wx.navigateTo({ url: '/pages/province/province' });
  },

  toggleMilestones() {
    this.setData({ showMilestones: !this.data.showMilestones });
  },

  shareCountdown() {
    wx.showActionSheet({
      itemList: ['分享倒计时卡片'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showToast({ title: '请点击右上角分享', icon: 'none' });
        }
      }
    });
  },

  applyMood(level) {
    const item = MOODS.find(m => m.level === level);
    this.setData({
      moodToday: level,
      moodLabel: item ? item.label : ''
    });
  },

  async checkin(e) {
    const level = Number(e.currentTarget.dataset.level);
    wx.vibrateShort({ type: 'light' });
    this.applyMood(level);
    getApp().globalData.moodToday = level;

    try {
      await api.moodCheckin(level, dateUtil.todayStr());
    } catch (err) {}

    // 树洞功能暂未上线 — 只完成打卡反馈
    setTimeout(() => {
      const item = MOODS.find(m => m.level === level);
      wx.showToast({
        title: item ? `已记录:${item.label}` : '已打卡',
        icon: 'success',
        duration: 1200
      });
    }, 320);
  },

  previewWallpaper() {
    wx.navigateTo({ url: `/pages/wallpaper/wallpaper?quote=${encodeURIComponent(this.data.wallpaperQuote)}` });
  },

  saveWallpaper() {
    ensureLogin('登录后保存属于你的每日壁纸').then(() => {
      wx.navigateTo({ url: `/pages/wallpaper/wallpaper?quote=${encodeURIComponent(this.data.wallpaperQuote)}&auto=save` });
    }).catch(() => {});
  },

  bookPlan() {
    wx.showModal({
      title: '预约伴学功能',
      content: 'AI 学习规划官「同行」将在 V1.1 上线。点击确定关注我们的公众号,首发即通知你。',
      confirmText: '我知道了',
      showCancel: false
    });
  },

  shareQuote() {
    wx.showToast({ title: '点右上角分享', icon: 'none' });
  },

  onShareAppMessage() {
    return {
      title: `距 ${this.data.examYear} 年高考还有 ${this.data.days} 天 · 高三同行`,
      path: '/pages/home/home',
      imageUrl: ''
    };
  },

  onShareTimeline() {
    return {
      title: `还有 ${this.data.days} 天 · 高三同行`,
      query: ''
    };
  },

  drawWallpaper() {
    // canvas 主要用作渐变背景,文字层用 wxml 覆盖
    const query = wx.createSelectorQuery();
    query.select('#wallpaperCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        const w = res[0].width;
        const h = res[0].height;
        const gradient = ctx.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, '#FF8C42');
        gradient.addColorStop(0.6, '#D4572A');
        gradient.addColorStop(1, '#6B2D0F');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        // 半透明圆点装饰
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(w * 0.85, h * 0.2, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w * 0.15, h * 0.85, 90, 0, Math.PI * 2);
        ctx.fill();
      });
  }
});
