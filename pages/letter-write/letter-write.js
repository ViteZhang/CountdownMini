// pages/letter-write/letter-write.js
// 写一封给未来的信。写完封存 —— 正文立刻离开这台手机，只留在服务端加密保存。
const model = require('../../utils/model.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');

const MAX = 1000;

Page({
  data: {
    theme: 'cd-dark',
    statusBarHeight: 20,

    content: '',
    len: 0,

    triggers: [],
    trigger: 'd100',
    customDate: '',
    minDate: '',
    openAtText: '',
    canSeal: false,
    sealing: false
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}
    const tomorrow = model.toKey(model.addDays(new Date(), 1));
    this.setData({
      theme: getApp().refreshTheme(),
      minDate: tomorrow,
      customDate: tomorrow
    });
    this.buildTriggers();
  },

  /** 预设节点由考试日期推算；已经过去的节点不给选 */
  buildTriggers() {
    const exam = store.getExam();
    const target = exam ? model.fromKey(exam.target_date) : null;
    const today = model.toKey(new Date());

    const defs = [
      { key: 'd100', name: '还剩 100 天', offset: -100 },
      { key: 'd50', name: '还剩 50 天', offset: -50 },
      { key: 'night_before', name: '考前一晚', offset: -1 },
      { key: 'result_day', name: '出分日', offset: 23 }
    ];

    const list = defs.map(d => {
      const at = target ? model.toKey(model.addDays(target, d.offset)) : '';
      return {
        key: d.key,
        name: d.name,
        openAt: at,
        // 节点已过去就不能选了 —— 封存必须指向未来
        disabled: !at || at <= today
      };
    });
    list.push({ key: 'custom', name: '自己选个日子', openAt: '', disabled: false });

    const first = list.find(t => !t.disabled) || list[list.length - 1];
    this.setData({ triggers: list, trigger: first.key });
    this.refreshOpenAt();
  },

  pickTrigger(e) {
    const key = e.currentTarget.dataset.key;
    const t = this.data.triggers.find(x => x.key === key);
    if (!t || t.disabled) {
      wx.showToast({ title: '这个节点已经过去了', icon: 'none' });
      return;
    }
    this.setData({ trigger: key });
    this.refreshOpenAt();
  },

  onCustomDate(e) {
    this.setData({ customDate: e.detail.value });
    this.refreshOpenAt();
  },

  refreshOpenAt() {
    const t = this.data.triggers.find(x => x.key === this.data.trigger);
    const at = this.data.trigger === 'custom' ? this.data.customDate : (t && t.openAt);
    const d = model.fromKey(at);
    const days = d ? model.diffDays(new Date(), d) : 0;
    this.setData({
      openAtText: d ? `${model.humanDate(d)} · ${days} 天后开启` : '',
      canSeal: !!d && days > 0 && this.data.len > 0
    });
  },

  onInput(e) {
    const v = e.detail.value || '';
    this.setData({ content: v, len: v.length });
    this.refreshOpenAt();
  },

  seal() {
    if (!this.data.canSeal || this.data.sealing) return;
    const t = this.data.triggers.find(x => x.key === this.data.trigger);
    const openAt = this.data.trigger === 'custom' ? this.data.customDate : (t && t.openAt);

    wx.showModal({
      title: '封存这封信',
      content: `封存之后你就看不到它了，也改不了，直到 ${openAt} 才能打开。确定吗？`,
      confirmText: '封存',
      cancelText: '再想想',
      success: res => {
        if (!res.confirm) return;
        this.doSeal(openAt);
      }
    });
  },

  back() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/home' }) });
  },

  async doSeal(openAt) {
    this.setData({ sealing: true });
    wx.showLoading({ title: '正在封存…', mask: true });
    try {
      const data = await api.letterSeal(this.data.content, this.data.trigger, openAt);
      wx.hideLoading();
      if (!data || !data.id) {
        this.setData({ sealing: false });
        wx.showToast({ title: '封存失败，再试一次', icon: 'none' });
        return;
      }
      // 正文就此从客户端消失：清空输入框，本地不写任何缓存
      this.setData({ content: '', len: 0, sealing: false });
      wx.showModal({
        title: '封好了',
        content: `${openAt} 那天，它会自己出现在信箱里。`,
        showCancel: false,
        confirmText: '好',
        success: () => wx.navigateBack()
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ sealing: false });
      wx.showToast({ title: '网络不太好，没能封存', icon: 'none' });
    }
  }
});
