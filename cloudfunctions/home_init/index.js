// cloudfunctions/home_init/index.js
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

  let moodToday = null;
  try {
    const t = todayStr();
    const m = await db.collection('mood_checkins').where({ _openid: OPENID, date: t }).limit(1).get();
    if (m.data.length) moodToday = m.data[0].mood_level;
  } catch (e) {}

  return ok({ profile, moodToday });
};
