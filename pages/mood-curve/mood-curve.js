// pages/mood-curve/mood-curve.js
const theme = require('../../utils/theme.js');
const api = require('../../utils/api.js');

Page({
  data: {
    ranges: [
      { key: '30', label: '近 30 天' },
      { key: '90', label: '近 90 天' },
      { key: 'all', label: '全部' }
    ],
    range: '30',
    loading: true,
    points: [],
    summary: '',
    lowSpan: false
  },

  onShow() {
    theme.apply(this, false);
  },


  onLoad() {
    this.load();
  },

  switchRange(e) {
    this.setData({ range: e.currentTarget.dataset.key });
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.moodCurve(this.data.range);
      const points = (data && data.points) || [];
      this.setData({
        loading: false,
        points,
        summary: this.computeSummary(points),
        lowSpan: this.detectLowSpan(points)
      });
      if (points.length >= 3) {
        setTimeout(() => this.draw(), 80);
      }
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  computeSummary(points) {
    if (!points.length) return '';
    const sum = points.reduce((a, b) => a + b.mood_level, 0);
    const avg = sum / points.length;
    if (avg >= 1) return `这 ${points.length} 天 你大多数时候是开心的。`;
    if (avg >= 0) return `这 ${points.length} 天 你大多数时候是平静的。`;
    if (avg >= -0.5) return `这 ${points.length} 天 你的状态有些起伏。`;
    return `这 ${points.length} 天 你过得不容易。记得有我在。`;
  },

  detectLowSpan(points) {
    let count = 0;
    for (const p of points) {
      if (p.mood_level <= -1) {
        count += 1;
        if (count >= 3) return true;
      } else {
        count = 0;
      }
    }
    return false;
  },

  draw() {
    const query = wx.createSelectorQuery();
    query.select('#moodChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const W = res[0].width;
        const H = res[0].height;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        const padL = 40, padR = 24, padT = 24, padB = 32;
        const cw = W - padL - padR;
        const ch = H - padT - padB;
        const points = this.data.points;

        // 坐标轴 (Y: -2 ~ 2)
        ctx.strokeStyle = '#EEEEEE';
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          const y = padT + ch - ((i + 2) / 4) * ch;
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + cw, y);
          ctx.stroke();
          ctx.fillStyle = '#BBBBBB';
          ctx.font = '20px -apple-system';
          ctx.textAlign = 'right';
          const labels = { '-2': '😭', '-1': '😔', '0': '😐', '1': '🙂', '2': '😀' };
          ctx.fillText(labels[String(i)], padL - 6, y + 6);
        }

        if (!points.length) return;

        // 均值线
        const avg = points.reduce((a, b) => a + b.mood_level, 0) / points.length;
        const avgY = padT + ch - ((avg + 2) / 4) * ch;
        ctx.strokeStyle = '#FFC857';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, avgY);
        ctx.lineTo(padL + cw, avgY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 折线
        const step = points.length > 1 ? cw / (points.length - 1) : 0;
        ctx.strokeStyle = '#D4572A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        points.forEach((p, i) => {
          const x = padL + i * step;
          const y = padT + ch - ((p.mood_level + 2) / 4) * ch;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 点
        ctx.fillStyle = '#D4572A';
        points.forEach((p, i) => {
          const x = padL + i * step;
          const y = padT + ch - ((p.mood_level + 2) / 4) * ch;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      });
  },

  goCheckin() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  goChat() {
    wx.showToast({ title: '树洞即将上线', icon: 'none' });
  }
});
