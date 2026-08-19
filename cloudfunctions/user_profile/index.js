// cloudfunctions/user_profile/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function ok(data) { return { code: 0, data }; }
function err(msg) { return { code: 1, msg }; }

async function ensureUser(openid) {
  const col = db.collection('users');
  const r = await col.where({ _openid: openid }).limit(1).get();
  if (r.data.length) return r.data[0];
  const now = new Date();
  const newUser = {
    _openid: openid,
    nickname: '',
    avatarUrl: '',
    province: null,
    grade: 'G3',
    dreamSchool: '',
    createdAt: now,
    updatedAt: now
  };
  const created = await col.add({ data: newUser });
  newUser._id = created._id;
  return newUser;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return err('no_openid');

  const action = event.action || 'login';

  try {
    if (action === 'login') {
      const u = await ensureUser(OPENID);
      return ok({
        openid: OPENID,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        province: u.province,
        grade: u.grade,
        dreamSchool: u.dreamSchool
      });
    }

    if (action === 'update') {
      const u = await ensureUser(OPENID);
      const fields = {};
      ['nickname', 'avatarUrl', 'grade', 'dreamSchool', 'province'].forEach(k => {
        if (event[k] !== undefined) fields[k] = event[k];
      });
      fields.updatedAt = new Date();
      await db.collection('users').doc(u._id).update({ data: fields });
      return ok({ updated: true });
    }

    if (action === 'stats') {
      const today = new Date();
      const u = await ensureUser(OPENID);
      const days = Math.max(1, Math.floor((today - new Date(u.createdAt)) / 86400000) + 1);

      let chats = 0;
      let checkins = 0;
      try {
        const cRes = await db.collection('chat_messages').where({ _openid: OPENID, role: 'USER' }).count();
        chats = cRes.total;
      } catch (e) {}
      try {
        const kRes = await db.collection('mood_checkins').where({ _openid: OPENID }).count();
        checkins = kRes.total;
      } catch (e) {}

      return ok({ stats: { days, chats, checkins } });
    }

    if (action === 'feedback') {
      await db.collection('feedbacks').add({
        data: {
          _openid: OPENID,
          cat: event.cat || '其他',
          content: event.content || '',
          contact: event.contact || '',
          createdAt: new Date()
        }
      });
      return ok({ submitted: true });
    }

    if (action === 'export') {
      const u = await ensureUser(OPENID);
      const today = new Date();
      const days = Math.max(1, Math.floor((today - new Date(u.createdAt)) / 86400000) + 1);
      let chats = 0, checkins = 0;
      try {
        const cRes = await db.collection('chat_messages').where({ _openid: OPENID, role: 'USER' }).count();
        chats = cRes.total;
      } catch (e) {}
      try {
        const kRes = await db.collection('mood_checkins').where({ _openid: OPENID }).count();
        checkins = kRes.total;
      } catch (e) {}
      return ok({
        profile: {
          nickname: u.nickname,
          province: u.province,
          grade: u.grade,
          dreamSchool: u.dreamSchool,
          createdAt: u.createdAt
        },
        stats: { days, chats, checkins }
      });
    }

    if (action === 'delete') {
      const u = await ensureUser(OPENID);
      const expireAt = new Date(Date.now() + 7 * 86400000);
      await db.collection('users').doc(u._id).update({ data: { deletePending: true, deleteAt: expireAt } });
      return ok({ scheduled: true, deleteAt: expireAt });
    }

    return err('unknown_action');
  } catch (e) {
    console.error('[user_profile]', e);
    return err(e.message || 'fail');
  }
};
