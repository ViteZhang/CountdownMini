// pages/onboarding/onboarding.js
// 四屏配置流：考试类型 → 目标日期 → 起始日期 → 第一次看见那个数字
const model = require('../../utils/model.js');
const store = require('../../utils/store.js');
const nav = require('../../utils/nav.js');
const api = require('../../utils/api.js');

Page({
  data: {
    theme: 'cd-dark',
    statusBarHeight: 20,
    step: 1,
    editMode: false,   // 从设置页进来修改考试配置

    types: model.EXAM_TYPES,
    type: 'gaokao',

    targetKey: '',
    targetBig: '',
    targetWeek: '',
    targetErr: '',
    targetFixYear: 0,

    startKey: '',
    startBig: '',
    startWeek: '',
    startErr: '',
    startBlocking: false,
    quicks: [],

    // 第 4 屏
    passed: 0,
    passedShown: 0,
    remaining: 0,
    barWidth: 0,
    revealed: false,

    todayKey: '',
    typeTip: ''
  },

  animTimer: null,

  onLoad(options) {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}
    const edit = !!(options && options.edit);
    if (!edit && store.isConfigured()) {
      // 老用户 / 已配置过：不再重复引导
      wx.reLaunch({ url: '/pages/home/home' });
      return;
    }
    this.setData({
      theme: getApp().globalData.theme,
      todayKey: model.toKey(new Date()),
      editMode: edit
    });

    const exam = store.getExam();
    if (edit && exam) {
      // 修改模式：用现有配置预填，仍走同样的三屏
      this.setData({ type: exam.type || 'gaokao' });
      this.applyTarget(exam.target_date);
      this.applyStart(exam.start_date);
      return;
    }
    this.pickType({ currentTarget: { dataset: { key: 'gaokao' } } }, true);
  },

  onUnload() {
    if (this.animTimer) clearInterval(this.animTimer);
  },

  /* ---------------- 第 1 屏：类型 ---------------- */

  pickType(e, silent) {
    const key = e.currentTarget.dataset.key;
    const now = new Date();
    const target = model.defaultTarget(key, now);
    const start = model.defaultStart(key, target, now);
    this.setData({ type: key });
    this.applyTarget(model.toKey(target));
    this.applyStart(model.toKey(start));
    if (silent) return;
    // 选中即前进，留 220ms 让选中态可见
    setTimeout(() => this.go(2), 220);
  },

  /* ---------------- 第 2 屏：目标日期 ---------------- */

  onTargetChange(e) {
    this.applyTarget(e.detail.value);
  },

  applyTarget(key) {
    const d = model.fromKey(key);
    if (!d) return;
    const past = model.diffDays(new Date(), d) <= 0;
    this.setData({
      targetKey: key,
      targetBig: model.humanDate(d),
      targetWeek: model.weekdayOf(d),
      targetErr: past ? `这个日期已经过去了。要改成 ${d.getFullYear() + 1} 年吗？` : '',
      targetFixYear: past ? d.getFullYear() + 1 : 0,
      typeTip: this.tipFor(this.data.type)
    });
    // 目标变了，快捷起点也要跟着变
    if (this.data.startKey) this.applyStart(this.data.startKey);
  },

  fixTargetYear() {
    const d = model.fromKey(this.data.targetKey);
    if (!d) return;
    this.applyTarget(model.toKey(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate())));
  },

  tipFor(type) {
    const map = {
      gaokao: '全国统考首日通常是 6 月 7 日。如果你所在的省份有单独安排，改成实际日期就好。',
      zhongkao: '各省中考时间不同，通常在 6 月中旬。按你学校通知的日期改就好。',
      kaoyan: '初试一般在 12 月下旬的周末。以研招网公布为准。',
      kaogong: '国考笔试通常在 11 月最后一个周日，省考多在 3 月。',
      custom: '填你真正要考的那一天。'
    };
    return map[type] || '';
  },

  /* ---------------- 第 3 屏：起始日期 ---------------- */

  onStartChange(e) {
    this.applyStart(e.detail.value);
  },

  applyStart(key) {
    const d = model.fromKey(key);
    if (!d) return;
    const target = model.fromKey(this.data.targetKey) || model.defaultTarget(this.data.type, new Date());
    const now = new Date();

    const bad = model.diffDays(d, target) <= 0;
    const future = model.diffDays(now, d) > 0;

    const quicks = model.quickStarts(this.data.type, target, now).map(q => ({
      name: q.name,
      key: model.toKey(q.date),
      on: model.toKey(q.date) === key
    }));

    this.setData({
      startKey: key,
      startBig: model.humanDate(d),
      startWeek: model.weekdayOf(d),
      startErr: bad ? '起始日期要早于考试日期。' : (future ? '起始日期还没到，「已走过」会是 0 天。确定吗？' : ''),
      startBlocking: bad,
      quicks
    });
  },

  pickQuick(e) {
    this.applyStart(e.currentTarget.dataset.key);
  },

  /* ---------------- 流程 ---------------- */

  go(n) {
    this.setData({ step: n });
  },

  next() {
    if (this.data.step === 2 && this.data.targetErr) return;
    this.go(this.data.step + 1);
  },

  prev() {
    if (this.data.step > 1) {
      this.go(this.data.step - 1);
      return;
    }
    // 编辑模式下第 1 屏就是入口，再往回就该退出这个页面
    if (this.data.editMode) nav.back('/pages/home/home');
  },

  skip() {
    // 跳过 = 直接按默认值走完，但仍必须看到第 4 屏那个数字
    if (this.data.step === 1) {
      this.pickType({ currentTarget: { dataset: { key: 'gaokao' } } }, true);
      this.go(2);
      return;
    }
    if (this.data.step === 2) { this.go(3); return; }
    this.finish();
  },

  finish() {
    if (this.data.startBlocking) return;

    const typeItem = model.EXAM_TYPES.find(t => t.key === this.data.type);
    const exam = store.saveExam({
      id: (store.getExam() && store.getExam().id) || store.uuid(),
      type: this.data.type,
      title: typeItem ? typeItem.name : '考试',
      start_date: this.data.startKey,
      target_date: this.data.targetKey,
      is_primary: true
    });

    const app = getApp();
    app.globalData.exam = exam;
    app.syncLegacyFromExam();
    wx.setStorageSync('has_launched', true);
    // 已登录时把配置上行；未登录不上行，也不阻塞（PRD 5.14.4）
    if (app.globalData.isLogin) api.examSave(exam).catch(() => {});

    if (this.data.editMode) {
      wx.showToast({ title: '已更新', icon: 'none' });
      setTimeout(() => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) }), 500);
      return;
    }

    const s = model.computeExam(exam);
    this.setData({
      step: 4,
      passed: s.passed,
      remaining: s.remaining,
      passedShown: 0,
      barWidth: 0,
      revealed: false
    });
    this.playReveal(s);
  },

  /** 第 4 屏的演出：数字滚动 → 进度条 → 剩余天数 / 树 / 按钮 */
  playReveal(s) {
    const dur = 1400;
    const t0 = Date.now();
    if (this.animTimer) clearInterval(this.animTimer);
    this.animTimer = setInterval(() => {
      const p = Math.min((Date.now() - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      this.setData({ passedShown: Math.round(s.passed * eased) });
      if (p >= 1) {
        clearInterval(this.animTimer);
        this.animTimer = null;
      }
    }, 32);
    setTimeout(() => this.setData({ barWidth: Math.round(s.progress * 1000) / 10 }), 260);
    setTimeout(() => this.setData({ revealed: true }), 300);
  },

  enterHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
