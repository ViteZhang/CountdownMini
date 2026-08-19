// cloudfunctions/mood_checkin/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }
function todayStr() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : '' + n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ saved: false });
  const date = event.date || todayStr();
  const level = Number(event.mood_level);
  if (isNaN(level) || level < -2 || level > 2) return ok({ saved: false });

  const col = db.collection('mood_checkins');
  const exist = await col.where({ _openid: OPENID, date }).limit(1).get();
  const now = new Date();
  if (exist.data.length) {
    await col.doc(exist.data[0]._id).update({ data: { mood_level: level, updatedAt: now } });
  } else {
    await col.add({ data: { _openid: OPENID, date, mood_level: level, createdAt: now, updatedAt: now } });
  }
  return ok({ saved: true, date, mood_level: level });
};
