// cloudfunctions/mood_curve/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ points: [] });

  const range = event.range || '30';
  const now = new Date();
  let since = null;
  if (range === '30') since = new Date(now.getTime() - 30 * 86400000);
  else if (range === '90') since = new Date(now.getTime() - 90 * 86400000);

  const pad = n => n < 10 ? '0' + n : '' + n;
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let q = db.collection('mood_checkins').where({ _openid: OPENID });
  if (since) {
    q = q.where({ _openid: OPENID, date: db.command.gte(fmt(since)) });
  }
  const r = await q.orderBy('date', 'asc').limit(200).get();

  return ok({
    points: r.data.map(d => ({ date: d.date, mood_level: d.mood_level })),
    range
  });
};
