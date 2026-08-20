// cloudfunctions/mood_checkin/index.js
// V2：一条 mood_checkins 记录 = 那天打过卡。
// mood_level 变为可选（旧版的心情五档仍可写入，心情曲线不受影响）；
// 新增 exam_id / is_backfill / checked 三个字段，旧文档缺这些字段时按默认值读。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }
function todayStr() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : '' + n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isDateKey(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ saved: false });

  const date = isDateKey(event.date) ? event.date : todayStr();

  // 补签窗口：只允许过去 14 天内，且不能是未来
  const delta = Math.round((new Date(todayStr()) - new Date(date)) / 86400000);
  if (delta < 0 || delta > 14) return ok({ saved: false, reason: 'out_of_window' });

  const fields = {
    checked: true,
    exam_id: event.exam_id || '',
    is_backfill: !!event.is_backfill || delta > 0,
    updatedAt: new Date()
  };

  // mood_level 选填；给了才写，且必须合法
  if (event.mood_level !== undefined && event.mood_level !== null) {
    const level = Number(event.mood_level);
    if (!isNaN(level) && level >= -2 && level <= 2) fields.mood_level = level;
  }

  const col = db.collection('mood_checkins');
  const exist = await col.where({ _openid: OPENID, date }).limit(1).get();
  if (exist.data.length) {
    await col.doc(exist.data[0]._id).update({ data: fields });
  } else {
    await col.add({ data: Object.assign({ _openid: OPENID, date, createdAt: new Date() }, fields) });
  }
  return ok({ saved: true, date, is_backfill: fields.is_backfill });
};
