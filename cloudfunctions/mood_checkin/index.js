// cloudfunctions/mood_checkin/index.js
// V2：一条 mood_checkins 记录 = 那天打过卡。
// mood_level 变为可选（旧版的心情五档仍可写入，心情曲线不受影响）；
// 新增 exam_id / is_backfill / checked 三个字段，旧文档缺这些字段时按默认值读。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }
/*
 * 云函数容器的时区是 UTC。用它判断「今天」，北京时间 0 点到 8 点之间会算成昨天。
 * 这里的后果是打卡直接失败：用户凌晨 0 点半打卡，客户端传的是 21 号，
 * 服务端认为今天是 20 号，delta = -1 被当成「未来日期」挡掉。
 * 所以先把绝对时间平移到东八区，再取 UTC 年月日。
 */
const CST_OFFSET = 8 * 3600 * 1000;
function todayStr() {
  const d = new Date(Date.now() + CST_OFFSET);
  const pad = n => n < 10 ? '0' + n : '' + n;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
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
