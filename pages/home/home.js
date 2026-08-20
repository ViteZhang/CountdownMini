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

    totalCheckins: 0,
    totalNotes: 0,
    checkedToday: false,

    // 心里话弹层
    sheetOn: false,
    noteText: '',
    noteLen: 0,

    hintText: '',
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
    this.setData({ theme: getApp().globalData.theme });
    this.render();
    this.pullCloud();
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

    getApp().globalData.daysRemaining = s.remaining;
    this.drawRing(s.progress);
    this.drawTree(s.stage.key);
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

  /* ---------------- 绘制 ---------------- */

  drawRing(progress) {
    const q = wx.createSelectorQuery().in(this);
    q.select('#ringCanvas').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      let dpr = 2;
      try { dpr = wx.getSystemInfoSync().pixelRatio || 2; } catch (e) {}
      const w = res[0].width;
      const h = res[0].height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2, r = w / 2 - 10;
      const line = this.data.theme === 'cd-light' ? '#E3E2DD' : '#2E323A';
      const fill = this.data.theme === 'cd-light' ? '#16181C' : '#F2F4F7';

      ctx.lineWidth = 9;
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      if (progress > 0) {
        ctx.strokeStyle = fill;
        ctx.lineCap = 'round';
        ctx.beginPath();
        // 12 点方向起，顺时针
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }
    });
  },

  /** 成长树：只与 progress 映射出的阶段有关，与打卡无关 */
  drawTree(stageKey) {
    const q = wx.createSelectorQuery().in(this);
    q.select('#treeCanvas').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      let dpr = 2;
      try { dpr = wx.getSystemInfoSync().pixelRatio || 2; } catch (e) {}
      const w = res[0].width, h = res[0].height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const c = this.data.theme === 'cd-light' ? '#5E8570' : '#7FA08A';
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineCap = 'round';

      const order = ['seed', 'sprout', 'branch', 'leaf', 'lush', 'bud', 'bloom'];
      const lv = Math.max(order.indexOf(stageKey), 0);
      const baseY = h - 3;
      const cx = w / 2;

      // 主干：随阶段变高
      const trunkH = 6 + (h - 20) * (lv / 6);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      ctx.lineTo(cx, baseY - trunkH);
      ctx.stroke();

      if (lv === 0) {
        // 种子
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 4, 4, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      // 枝
      if (lv >= 2) {
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, baseY - trunkH * 0.55);
        ctx.lineTo(cx - 9, baseY - trunkH * 0.78);
        ctx.moveTo(cx, baseY - trunkH * 0.72);
        ctx.lineTo(cx + 9, baseY - trunkH * 0.92);
        ctx.stroke();
      }

      // 冠：半径与数量随阶段增长；bloom 为实心
      const crown = [
        { x: cx, y: baseY - trunkH - 2, r: 3 + lv * 1.3 },
        { x: cx - 10, y: baseY - trunkH * 0.82, r: lv >= 2 ? 2 + lv * 0.8 : 0 },
        { x: cx + 10, y: baseY - trunkH * 0.95, r: lv >= 3 ? 2.5 + lv * 0.8 : 0 }
      ];
      ctx.lineWidth = 1.4;
      crown.forEach(o => {
        if (o.r <= 0) return;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        if (stageKey === 'bloom') ctx.fill(); else ctx.stroke();
      });
    });
  },

  /* ---------------- 导航 ---------------- */

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  toggleTheme() {
    const app = getApp();
    const next = app.globalData.theme === 'cd-dark' ? 'light' : 'dark';
    app.applyTheme(next);
    this.setData({ theme: app.globalData.theme });
    this.render();
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
