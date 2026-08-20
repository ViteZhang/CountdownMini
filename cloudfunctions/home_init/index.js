// cloudfunctions/home_init/index.js
// V2：除了旧的 profile / moodToday，额外返回累计打卡天数与心里话条数，
// 让首页在登录态下一次拿全。旧字段一个不动，老客户端继续兼容。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }
function todayStr() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : '' + n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ profile: null, moodToday: null });

  let profile = null;
  try {
    const r = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
    if (r.data.length) {
      const u = r.data[0];
      profile = {
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        province: u.province,
        grade: u.grade,
        dreamSchool: u.dreamSchool
      };
    }
  } catch (e) {}

  const t = todayStr();

  let moodToday = null;
  let checkedToday = false;
  try {
    const m = await db.collection('mood_checkins').where({ _openid: OPENID, date: t }).limit(1).get();
    if (m.data.length) {
      checkedToday = true;                      // 有记录即为「今天来过」
      const lv = m.data[0].mood_level;
      moodToday = (lv === undefined) ? null : lv;
    }
  } catch (e) {}

  let totalCheckins = 0;
  try {
    const c = await db.collection('mood_checkins').where({ _openid: OPENID }).count();
    totalCheckins = c.total;
  } catch (e) {}

  let totalNotes = 0;
  try {
    const n = await db.collection('notes').where({ _openid: OPENID }).count();
    totalNotes = n.total;
  } catch (e) {}

  return ok({ profile, moodToday, checkedToday, totalCheckins, totalNotes });
};
