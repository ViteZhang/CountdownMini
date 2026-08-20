// pages/record/record.js
// 记录页：日历（已打卡 / 补签 / 有心里话）+ 心里话时间线；支持 14 天内补签
const model = require('../../utils/model.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');

Page({
  data: {
    theme: 'cd-dark',
    statusBarHeight: 20,
    tab: 'cal',              // 'cal' | 'timeline'

    totalCheckins: 0,
    totalNotes: 0,
    passed: 0,

    calYear: 0,
    calMonth: 0,             // 1-12
    calTitle: '',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    cells: [],

    notes: [],
    todayKey: ''
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}
    const now = new Date();
    this.setData({
      calYear: now.getFullYear(),
      calMonth: now.getMonth() + 1,
      todayKey: model.toKey(now)
    });
  },

  onShow() {
    this.setData({ theme: getApp().refreshTheme() });
    this.refresh();
  },

  refresh() {
    const snap = store.snapshot(new Date());
    this.setData({
      totalCheckins: snap.totalCheckins,
      totalNotes: snap.totalNotes,
      passed: snap.stats ? snap.stats.passed : 0
    });
    this.drawCalendar();
    this.drawTimeline();
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  /* ---------------- 日历 ---------------- */

  drawCalendar() {
    const { calYear, calMonth } = this.data;
    const checkins = store.getCheckins();
    const notes = store.getNotes();
    const noteDays = {};
    notes.forEach(n => { noteDays[n.date] = true; });

    const first = new Date(calYear, calMonth - 1, 1);
    const len = model.daysInMonth(calYear, calMonth);
    const todayKey = model.toKey(new Date());

    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ key: 'blank-' + i, blank: true });

    for (let d = 1; d <= len; d++) {
      const key = `${calYear}-${model.pad2(calMonth)}-${model.pad2(d)}`;
      const c = checkins[key];
      cells.push({
        key,
        day: d,
        blank: false,
        has: !!c && !c.is_backfill,
        back: !!c && !!c.is_backfill,
        note: !!noteDays[key],
        today: key === todayKey,
        canBackfill: !c && model.canBackfill(key)
      });
    }

    this.setData({
      cells,
      calTitle: `${calYear} 年 ${calMonth} 月`
    });
  },

  shiftMonth(e) {
    const n = Number(e.currentTarget.dataset.n);
    let y = this.data.calYear;
    let m = this.data.calMonth + n;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    this.setData({ calYear: y, calMonth: m });
    this.drawCalendar();
  },

  /** 点某一天：可补签则补签，已打卡则看当天心里话 */
  tapDay(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const cell = this.data.cells.find(c => c.key === key);
    if (!cell || cell.blank) return;

    if (cell.has || cell.back) {
      const list = store.notesOn(key);
      wx.showModal({
        title: key,
        content: list.length ? list.map(n => n.content).join('\n\n') : '这天你来过。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    if (!cell.canBackfill) {
      wx.showToast({ title: '只能补签过去 14 天内的日子', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '补签这一天',
      content: `把 ${key} 补上。补签一样计入累计天数。`,
      confirmText: '补上',
      cancelText: '算了',
      success: res => {
        if (!res.confirm) return;
        store.addCheckin(key, { is_backfill: true });
        api.moodCheckin(null, key, true).catch(() => {});
        this.refresh();
        wx.showToast({ title: '已补上', icon: 'none' });
      }
    });
  },

  /* ---------------- 时间线 ---------------- */

  drawTimeline() {
    const exam = store.getExam();
    const target = exam ? model.fromKey(exam.target_date) : null;
    const notes = store.getNotes().map(n => {
      const d = model.fromKey(n.date);
      const rest = (target && d) ? Math.max(model.diffDays(d, target), 0) : 0;
      return {
        id: n.id,
        content: n.content,
        meta: `${d ? `${d.getMonth() + 1} 月 ${d.getDate()} 日` : n.date} · 还剩 ${rest} 天`
      };
    });
    this.setData({ notes });
  },

  deleteNote(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删掉这句话？',
      content: '删掉之后找不回来。',
      confirmText: '删掉',
      confirmColor: '#C97064',
      success: res => {
        if (!res.confirm) return;
        store.removeNote(id);
        api.noteDelete(id).catch(() => {});
        this.refresh();
      }
    });
  }
});
