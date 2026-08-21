// pages/letter/letter.js
// 读信页。信只有一个来源：letter_vault。
// 封存信的正文永远由服务端在到期后下发，客户端不缓存、不预取。
const api = require('../../utils/api.js');
const nav = require('../../utils/nav.js');
const card = require('../../utils/card.js');

Page({
  data: {
    statusBarHeight: 20,
    stage: 'loading',  // loading -> reading
    loadingText: '正在拆封...',
    content: '',
    contentShown: '',
    streaming: false,
    sign: '',
    openAt: '',
    nickname: '',
    saving: false,
    stars: [],
    letterId: ''
  },

  onLoad(options) {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {}

    const stars = [];
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        d: Math.random() * 2
      });
    }
    this.setData({ stars, nickname: getApp().globalData.nickname || '亲爱的我' });

    if (options.id) {
      this.loadFromVault(options.id);
    } else {
      // 没有信可读就别停在空页面上
      this.bounce('没有指定要读哪封信');
    }
  },

  /** 从信件保险箱开启。未到期时服务端会拒绝，这里如实告诉用户还要等多久。 */
  async loadFromVault(id) {
    this.setData({ stage: 'loading', loadingText: '正在拆封...' });
    try {
      const res = await api.call('letter_vault', { action: 'open', id });
      const content = res && res.content;
      if (content) {
        this.setData({
          content,
          letterId: id,
          openAt: res.open_at || '',
          // 自己写的信落款是过去的自己；旧的 AI 代写信保持原来的署名
          sign: res.kind === 'ai' ? '—— 星语' : '—— 过去的你'
        });
        this.enterReading();
        return;
      }
      this.bounce((res && res.msg) === 'still_sealed' ? '还没到开启的日子' : '没能打开这封信');
    } catch (e) {
      this.bounce('网络异常');
    }
  },

  bounce(msg) {
    wx.showToast({ title: msg, icon: 'none' });
    setTimeout(() => nav.back('/pages/letter-box/letter-box'), 1200);
  },

  enterReading() {
    this.setData({ stage: 'reading', streaming: true, contentShown: '' });
    this.streamPrint();
  },

  streamPrint() {
    const full = this.data.content;
    let i = 0;
    const step = () => {
      i += 2;
      this.setData({ contentShown: full.slice(0, i) });
      if (i < full.length) {
        setTimeout(step, 35);
      } else {
        this.setData({ streaming: false });
      }
    };
    step();
  },

  /**
   * 存成图片。整条链路：离屏 canvas 画一张 → 导出临时文件 → 存相册。
   *
   * 相册权限被拒时不是死路：退回 previewImage，用户长按也能存下来。
   * 这比弹一句「保存失败」有用得多。
   */
  async saveCard() {
    if (this.data.saving || this.data.streaming) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '正在生成', mask: true });

    let tempPath = '';
    try {
      tempPath = await card.render(this, '#cardCanvas', {
        head: `${this.data.nickname || '亲爱的我'}：`,
        body: this.data.content,
        sign: this.data.sign,
        openAt: this.data.openAt
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
      console.error('[saveCard]', e);
      wx.showToast({ title: '没能生成卡片', icon: 'none' });
      return;
    }

    wx.hideLoading();
    this.setData({ saving: false });

    wx.saveImageToPhotosAlbum({
      filePath: tempPath,
      success: () => wx.showToast({ title: '已存到相册', icon: 'success' }),
      fail: (err) => {
        const denied = String((err && err.errMsg) || '').indexOf('auth deny') >= 0
          || String((err && err.errMsg) || '').indexOf('authorize') >= 0;
        if (denied) {
          wx.showModal({
            title: '需要相册权限',
            content: '开启后就能把这张卡片存下来。也可以先预览，长按图片保存。',
            confirmText: '去开启',
            cancelText: '先预览',
            success: (res) => {
              if (res.confirm) wx.openSetting({});
              else wx.previewImage({ urls: [tempPath] });
            }
          });
          return;
        }
        wx.previewImage({ urls: [tempPath] });
      }
    });
  },

  back() {
    nav.back('/pages/letter-box/letter-box');
  }
});
