// pages/home/home.js
// V2 首页：进度环（填充 = 已走过比例）+ 已走过天数 + 成长树 + 「今天也在」+ 心里话
const model = require('../../utils/model.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');

Page({
  data: {
    theme: 'cd-dark',
    statusBarHeight: 20,

    title: '高考',
    targetText: '',

    remaining: 0,
    passed: 0,
    percent: 0,
    stageName: '',
    stageIndex: 1,
    isExamDay: false,
    isAfterExam: false,

    // 进度环（纯 CSS 双半圆），避免 canvas 原生组件在 scroll-view 中不跟随滚动
    ringRightDeg: -135,
    ringLeftDeg: -315,
    // 成长树（纯 CSS）
    tree: { trunk: 0, crowns: [], seed: false, bloom: false },

    totalCheckins: 0,
    totalNotes: 0,
    checkedToday: false,

    // 心里话弹层
    sheetOn: false,
    noteText: '',
    noteLen: 0,

    hintText: '',
    // 信件提示条：最近一封信 ≤30 天内开启，或已经可以开启（PRD 5.6）
    letterHint: null,
    ready: false
  },

  onLoad() {
    // 未配置 → 走引导（老用户已在 app.onLaunch 里被迁移出 exam，不会走到这）
    if (!store.isConfigured()) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}
  },

  onShow() {
    if (!store.isConfigured()) return;
    this.setData({ theme: getApp().refreshTheme() });
    this.render();
    this.pullCloud();
    this.pullLetters();
  },

  /** 从本地快照渲染整页 */
  render() {
    const snap = store.snapshot(new Date());
    if (!snap.exam || !snap.stats) return;
    const s = snap.stats;
    const target = model.fromKey(snap.exam.target_date);

    this.setData({
      title: snap.exam.title || '考试',
      targetText: target ? `${model.humanDate(target)} ${model.weekdayOf(target)}` : '',
      remaining: s.remaining,
      passed: s.passed,
      percent: s.percent,
      stageName: s.stage.name,
      stageIndex: s.stageIndex,
      isExamDay: s.isExamDay,
      isAfterExam: s.isAfterExam,
      totalCheckins: snap.totalCheckins,
      totalNotes: snap.totalNotes,
      checkedToday: snap.checkedToday,
      hintText: this.buildHint(s),
      ready: true
    });

    this.layoutRing(s.progress);
    this.layoutTree(s.stage.key);
  },

  /**
   * 进度环。用两个半圆窗口各自裁剪一个「半环」元素，靠旋转露出对应弧段：
   *   右窗覆盖 0–50%，左窗覆盖 50–100%，起点 12 点方向、顺时针。
   * 推导：半环着色跨度 180°，右窗可见区间 [0°,180°]，
   *   令着色区间右端 = 360p 即得 rightDeg = 360p − 135；左窗同理 leftDeg = 360p − 315。
   */
  layoutRing(progress) {
    const p = Math.max(0, Math.min(progress, 1));
    this.setData({
      ringRightDeg: 360 * Math.min(p, 0.5) - 135,
      ringLeftDeg: 360 * Math.max(p, 0.5) - 315
    });
  },

  /** 成长树：形态只由 progress 映射出的阶段决定，与打卡无关 */
  layoutTree(stageKey) {
    const order = ['seed', 'sprout', 'branch', 'leaf', 'lush', 'bud', 'bloom'];
    const lv = Math.max(order.indexOf(stageKey), 0);
    const bloom = stageKey === 'bloom';

    if (lv === 0) {
      this.setData({ tree: { trunk: 12, crowns: [], seed: true, bloom: false } });
      return;
    }

    const trunk = 16 + 60 * (lv / 6);          // rpx 百分比基准，见 wxss
    const crowns = [{ x: 50, y: trunk + 6, r: 9 + lv * 2.6, solid: bloom }];
    if (lv >= 2) crowns.push({ x: 26, y: trunk * 0.72, r: 5 + lv * 1.6, solid: bloom });
    if (lv >= 3) crowns.push({ x: 74, y: trunk * 0.84, r: 6 + lv * 1.6, solid: bloom });

    this.setData({ tree: { trunk, crowns, seed: false, bloom } });
  },

  buildHint(s) {
    if (s.isExamDay) return '今天。走到这里已经很了不起。';
    if (s.isAfterExam) return '考完了。这段路你走完了。';
    if (s.remaining <= 30) return `还剩 ${s.remaining} 天，你已经走过 ${s.passed} 天。`;
    return `你已经走过 ${s.passed} 天，这个数字只会往上加。`;
  },

  /* ---------------- 打卡 ---------------- */

  checkin() {
    if (this.data.checkedToday) {
      this.openSheet();
      return;
    }
    const key = model.toKey(new Date());
    store.addCheckin(key, { is_backfill: false });
    wx.vibrateShort({ type: 'light' });
    this.render();

    // 云端静默同步，失败不影响本地
    api.moodCheckin(null, key).catch(() => {});

    setTimeout(() => this.openSheet(), 320);
  },

  /* ---------------- 心里话 ---------------- */

  openSheet() {
    this.setData({ sheetOn: true, noteText: '', noteLen: 0 });
  },

  closeSheet() {
    this.setData({ sheetOn: false });
  },

  onNoteInput(e) {
    const v = e.detail.value || '';
    this.setData({ noteText: v, noteLen: v.length });
  },

  saveNote() {
    const text = (this.data.noteText || '').trim();
    this.closeSheet();
    if (!text) {
      wx.showToast({ title: '已记下今天', icon: 'none' });
      return;
    }
    const key = model.toKey(new Date());
    const note = store.addNote(key, text);
    this.render();
    if (note) api.noteSave(note).catch(() => {});
    wx.showToast({ title: '已记下', icon: 'none' });
  },

  /**
   * 信件提示条。只拿元数据 —— 封存中的正文服务端根本不下发。
   * 无网络时静默隐藏，不显示错误态。
   */
  async pullLetters() {
    try {
      const data = await api.letterVaultList();
      const list = (data && data.list) || [];

      const ready = list.filter(l => l.status === 'ready');
      if (ready.length) {
        this.setData({
          letterHint: {
            text: ready.length > 1
              ? `有 ${ready.length} 封信可以开启了`
              : '有一封信今天可以开启',
            ready: true
          }
        });
        return;
      }

      const sealed = list
        .filter(l => l.status === 'sealed')
        .sort((a, b) => a.days_left - b.days_left)[0];

      if (sealed && sealed.days_left <= 30) {
        this.setData({
          letterHint: { text: `写给自己的信，${sealed.days_left} 天后开启`, ready: false }
        });
        return;
      }
      this.setData({ letterHint: null });
    } catch (e) {
      this.setData({ letterHint: null });
    }
  },

  goLetters() {
    wx.switchTab({ url: '/pages/letter-box/letter-box' });
  },

  /* ---------------- 云端 ---------------- */

  async pullCloud() {
    const g = getApp().globalData;
    if (!g.isLogin) return;
    try {
      const data = await api.dataSync({ exam: store.getExam() });
      if (data) {
        const r = store.mergeCloud(data);
        if (r.changed) this.render();
      }
    } catch (e) {
      // 静默重试留给下次 onShow
    }
  },

  /* ---------------- 导航 ---------------- */

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' });
  },

  goMine() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  onShareAppMessage() {
    return {
      title: `距 ${this.data.title} 还有 ${this.data.remaining} 天，我已经走过 ${this.data.passed} 天`,
      path: '/pages/home/home'
    };
  },

  onShareTimeline() {
    return { title: `还剩 ${this.data.remaining} 天 · 已走过 ${this.data.passed} 天` };
  }
});
