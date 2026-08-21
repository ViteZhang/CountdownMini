// utils/theme.js - 页面级主题助手
//
// 新页面（首页 / 记录 / 信箱 / 写信 / 引导）根节点直接写 class="cd-page {{theme}}"。
// 老页面（设置 / 关于 / 反馈 / 我的数据 / 个人资料 / 我的）也走同一套 token，
// 由本模块统一注入 theme class，并把系统导航栏的颜色一起改掉 ——
// 否则深色页面顶上会顶着一条白色导航栏。

const NAV = {
  'cd-dark': { front: '#ffffff', background: '#101114' },
  'cd-light': { front: '#000000', background: '#FAFAF8' }
};

/**
 * 在页面 onShow 里调用：
 *   const theme = require('../../utils/theme.js');
 *   onShow() { theme.apply(this); }
 * @param {object} page 页面实例
 * @param {boolean} customNav 页面是否用了 navigationStyle: custom（是则不动导航栏）
 */
function apply(page, customNav) {
  const t = getApp().refreshTheme();
  if (page && page.data && page.data.theme !== t) {
    page.setData({ theme: t });
  } else if (page && (!page.data || page.data.theme === undefined)) {
    page.setData({ theme: t });
  }
  if (!customNav) {
    const c = NAV[t] || NAV['cd-light'];
    try {
      wx.setNavigationBarColor({
        frontColor: c.front,
        backgroundColor: c.background,
        fail: () => {}
      });
    } catch (e) {}
  }
  return t;
}

module.exports = { apply };
