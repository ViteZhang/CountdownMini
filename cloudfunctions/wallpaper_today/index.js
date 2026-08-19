// cloudfunctions/wallpaper_today/index.js
// MVP:壁纸由小程序端 canvas 合成,云函数仅记录保存历史
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ list: [] });

  if (event.action === 'list') {
    try {
      const r = await db.collection('wallpapers')
        .where({ _openid: OPENID })
        .orderBy('createdAt', 'desc')
        .limit(60)
        .get();
      return ok({ list: r.data });
    } catch (e) {
      return ok({ list: [] });
    }
  }

  if (event.action === 'save' && event.image_url) {
    try {
      await db.collection('wallpapers').add({
        data: {
          _openid: OPENID,
          date: event.date,
          template_id: event.template_id,
          image_url: event.image_url,
          createdAt: new Date()
        }
      });
    } catch (e) {}
    return ok({ saved: true });
  }

  return ok({});
};
