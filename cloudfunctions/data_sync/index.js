// cloudfunctions/data_sync/index.js
// V2 同步端点：pull（拉云端快照）/ push_note / delete_note / save_exam
//
// 兼容要点：
//  - 打卡直接读旧集合 mood_checkins。**一条记录 = 那天打过卡**，
//    所以线上老用户升级后累计天数立刻有值，不归零。
//  - exams / notes 为新集合，老用户没有时按需创建，不影响旧数据。
//  - 全部字段读取都对 undefined 兜底，旧客户端继续可用。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function ok(data) { return { code: 0, data }; }
function err(msg) { return { code: 1, msg }; }

const pad = n => n < 10 ? '0' + n : '' + n;
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function getPrimaryExam(openid) {
  try {
    const r = await db.collection('exams')
      .where({ _openid: openid, is_primary: true }).limit(1).get();
    return r.data.length ? r.data[0] : null;
  } catch (e) {
    return null; // 集合尚未创建
  }
}

/** 老用户没有 exams 记录时，用 users + 最早的 mood_checkins 造一条 */
async function ensureExam(openid, hint) {
  const found = await getPrimaryExam(openid);
  if (found) return found;

  let user = null;
  try {
    const u = await db.collection('users').where({ _openid: openid }).limit(1).get();
    if (u.data.length) user = u.data[0];
  } catch (e) {}

  // 目标日期：客户端传来的优先，否则用「6/8 后切下一年」的高考规则
  let target = hint && hint.target_date;
  if (!target) {
    const now = new Date();
    let y = now.getFullYear();
    if (now >= new Date(y, 5, 8)) y += 1;
    target = `${y}-06-07`;
  }

  // 起始日期：客户端传来的优先；否则取「最早的打卡日」与「建档日」中更早者
  let start = hint && hint.start_date;
  if (!start) {
    const candidates = [];
    try {
      const first = await db.collection('mood_checkins')
        .where({ _openid: openid }).orderBy('date', 'asc').limit(1).get();
      if (first.data.length && first.data[0].date) candidates.push(first.data[0].date);
    } catch (e) {}
    if (user && user.createdAt) candidates.push(keyOf(new Date(user.createdAt)));
    if (candidates.length) {
      candidates.sort();
      start = candidates[0];
    } else {
      start = `${Number(target.slice(0, 4)) - 3}-09-01`;
    }
  }
  // 起始不得晚于今天
  const todayKey = keyOf(new Date());
  if (start > todayKey) start = todayKey;

  const doc = {
    _openid: openid,
    type: (hint && hint.type) || 'gaokao',
    title: (hint && hint.title) || '高考',
    start_date: start,
    target_date: target,
    province: (user && user.province && user.province.name) || '',
    is_primary: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  try {
    const added = await db.collection('exams').add({ data: doc });
    doc._id = added._id;
  } catch (e) {}
  return doc;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ exam: null, checkins: [], notes: [] });

  const action = event.action || 'pull';

  try {
    if (action === 'save_exam') {
      const e = event.exam || {};
      const found = await getPrimaryExam(OPENID);
      const fields = {
        type: e.type, title: e.title,
        start_date: e.start_date, target_date: e.target_date,
        is_primary: true, updatedAt: new Date()
      };
      if (found) {
        await db.collection('exams').doc(found._id).update({ data: fields });
      } else {
        await db.collection('exams').add({
          data: Object.assign({ _openid: OPENID, createdAt: new Date() }, fields)
        });
      }

      // 考期变了，预设节点信件（d100 / d50 / 考前一晚 / 出分日）的开启日期要跟着重算；
      // 自定义日期的信不动。见 PRD 5.6 边界情况。
      let rescheduled = 0;
      if (e.target_date) {
        try {
          const r = await cloud.callFunction({
            name: 'letter_vault',
            data: { action: 'reschedule', target_date: e.target_date }
          });
          rescheduled = (r.result && r.result.data && r.result.data.updated) || 0;
        } catch (err2) {
          console.error('[data_sync reschedule]', err2);
        }
      }
      return ok({ saved: true, rescheduled });
    }

    if (action === 'push_note') {
      const n = event.note || {};
      if (!n.id || !n.content) return err('bad_note');
      const col = db.collection('notes');
      const exist = await col.where({ _openid: OPENID, note_id: n.id }).limit(1).get();
      const fields = {
        date: n.date,
        exam_id: n.exam_id || '',
        content: String(n.content).slice(0, 200),
        updatedAt: new Date()
      };
      if (exist.data.length) {
        await col.doc(exist.data[0]._id).update({ data: fields });
      } else {
        await col.add({
          data: Object.assign({ _openid: OPENID, note_id: n.id, createdAt: new Date() }, fields)
        });
      }
      return ok({ saved: true });
    }

    if (action === 'delete_note') {
      try {
        const r = await db.collection('notes')
          .where({ _openid: OPENID, note_id: event.id }).limit(1).get();
        if (r.data.length) await db.collection('notes').doc(r.data[0]._id).remove();
      } catch (e) {}
      return ok({ deleted: true });
    }

    // ---- pull ----
    const exam = await ensureExam(OPENID, event.exam);

    let checkins = [];
    try {
      // 打卡最多取近两年，够首页与日历用
      const since = keyOf(new Date(Date.now() - 730 * 86400000));
      const r = await db.collection('mood_checkins')
        .where({ _openid: OPENID, date: _.gte(since) })
        .orderBy('date', 'asc').limit(1000).get();
      checkins = r.data.map(c => ({
        date: c.date,
        exam_id: c.exam_id || '',
        // 旧数据没有 is_backfill / checked：一条记录就代表那天来过
        is_backfill: !!c.is_backfill,
        mood_level: c.mood_level,
        created_at: c.createdAt ? new Date(c.createdAt).getTime() : Date.now()
      }));
    } catch (e) {}

    let notes = [];
    try {
      const r = await db.collection('notes')
        .where({ _openid: OPENID })
        .orderBy('date', 'desc').limit(500).get();
      notes = r.data.map(n => ({
        id: n.note_id,
        date: n.date,
        exam_id: n.exam_id || '',
        content: n.content,
        created_at: n.createdAt ? new Date(n.createdAt).getTime() : Date.now(),
        updated_at: n.updatedAt ? new Date(n.updatedAt).getTime() : Date.now()
      }));
    } catch (e) {}

    return ok({
      exam: exam ? {
        type: exam.type,
        title: exam.title,
        start_date: exam.start_date,
        target_date: exam.target_date,
        province: exam.province || '',
        is_primary: true
      } : null,
      checkins,
      notes,
      synced_at: Date.now()
    });
  } catch (e) {
    console.error('[data_sync]', e);
    return err(e.message || 'fail');
  }
};
