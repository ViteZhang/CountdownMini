// utils/nav.js - 返回导航助手
//
// 用了 navigationStyle: custom 的页面，微信不提供系统返回键 ——
// 页面必须自己画一个，否则用户进去就出不来（iOS 侧滑返回不可发现，
// 且 Tab 页跳转过来的场景下页面栈可能只有一层，侧滑也无效）。

/**
 * 返回上一页；页面栈只剩一层时回落到指定 Tab。
 * @param {string} fallback 回落的 Tab 路径，默认首页
 */
function back(fallback) {
  const url = fallback || '/pages/home/home';
  wx.navigateBack({
    delta: 1,
    fail: () => {
      wx.switchTab({
        url,
        fail: () => wx.reLaunch({ url })
      });
    }
  });
}

module.exports = { back };
