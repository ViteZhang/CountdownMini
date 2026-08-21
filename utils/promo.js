// utils/promo.js
// 首页底部推荐位。开关和文案都放在云开发数据库里，改配置不需要重新提审。
//
// 数据源：集合 app_config，文档 _id = 'promo'
//   {
//     "_id": "promo",
//     "enabled": false,          // 总开关
//     "title": "知识宇宙",
//     "desc": "另一个学习工具",
//     "action_text": "去看看",
//     "url": "https://knowledgeverse.space/"
//   }
//
// 集合权限必须设成「所有用户可读，仅管理员可写」，否则客户端读不到。
//
// 两条设计约束：
// 1. 默认关闭。读不到、读失败、字段缺失 —— 一律不展示。宁可少露一次，
//    也不要因为网络抖动或配置写错在用户面前露出半截东西。
// 2. 先用本地缓存渲染，再异步刷新。否则每次进首页都要等一个网络往返，
//    推荐位会在页面上突然弹出来。

const CACHE_KEY = 'cd_promo';
const COLLECTION = 'app_config';
const DOC_ID = 'promo';

/** 只认 https，避免配置里被写进 http 或别的 scheme */
function sanitize(raw) {
  if (!raw || raw.enabled !== true) return null;
  const url = String(raw.url || '').trim();
  if (!/^https:\/\//i.test(url)) return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    title,
    desc: String(raw.desc || '').trim(),
    actionText: String(raw.action_text || '').trim() || '去看看',
    url
  };
}

/** 同步取缓存，供首屏立即渲染 */
function cached() {
  try {
    return sanitize(wx.getStorageSync(CACHE_KEY));
  } catch (e) {
    return null;
  }
}

/**
 * 异步拉最新配置。无论成功失败都会回调一次，参数是最终该展示的内容（或 null）。
 * 拉取失败时保留缓存 —— 断网不该让已经配好的位消失。
 */
function refresh(cb) {
  const done = v => { if (typeof cb === 'function') cb(v); };
  if (!wx.cloud || !wx.cloud.database) return done(cached());

  wx.cloud.database().collection(COLLECTION).doc(DOC_ID).get()
    .then(res => {
      const raw = res && res.data;
      try { wx.setStorageSync(CACHE_KEY, raw || {}); } catch (e) {}
      done(sanitize(raw));
    })
    .catch(() => {
      // 文档不存在 / 集合没建 / 没权限，都走这里。保持静默。
      done(cached());
    });
}

/**
 * 打开推荐位。
 *
 * 小程序打不开外部网页：web-view 需要已备案且在后台配置过的业务域名，
 * 而个人主体的小程序根本不支持 web-view 组件。所以只能把链接给到用户。
 * 提示语说「发送到微信聊天中」而不是「去浏览器」：粘到聊天窗口里点开
 * 就是微信内置浏览器，用户不用离开微信，这条路比切浏览器短。
 */
function open(promo) {
  if (!promo || !promo.url) return;
  wx.setClipboardData({
    data: promo.url,
    success: () => {
      wx.showModal({
        title: '链接已复制',
        content: `${promo.url}\n\n发送到微信聊天中就能打开。`,
        showCancel: false,
        confirmText: '知道了'
      });
    },
    fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
  });
}

module.exports = { cached, refresh, open, CACHE_KEY, COLLECTION, DOC_ID };
