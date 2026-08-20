// cloudfunctions/user_profile/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function ok(data) { return { code: 0, data }; }
function err(msg) { return { code: 1, msg }; }

// 注销冷静期内的用户数据分布在这些集合里。加了新集合就要加到这里，
// 否则「注销即删除」这句承诺会随着功能增加悄悄失效。
const USER_COLLECTIONS = ['mood_checkins', 'letters', 'exams', 'notes', 'chat_messages', 'feedbacks'];

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


/** 取出某用户在某集合下的全部记录。云开发单次 get 上限 100 条，所以要翻页。 */
async function dumpAll(name, openid) {
  const out = [];
  try {
    for (let skip = 0; skip < 5000; skip += 100) {
      const r = await db.collection(name)
        .where({ _openid: openid })
        .skip(skip).limit(100).get();
      out.push.apply(out, r.data);
      if (r.data.length < 100) break;
    }
  } catch (e) {
    // 集合可能还没建（老环境）。导出缺一块也好过整个失败。
    console.warn('[export skip]', name, e.message);
  }
  return out;
}

/**
 * 信件只导出元信息，不导出自己写的信的正文。
 *
 * 不是偷懒：解密密钥 LETTER_SECRET_KEY 只配在 letter_vault 一个函数上，
 * 这里再放一份就等于把钥匙复制到第二个地方，还会因为两处配置不一致而静默失效。
 * 已开启的信在「信箱」里随时能读，这个口子不值得为它开。
 * 旧的 AI 代写信本来就是明文存的，直接给。
 */
function exportLetter(l) {
  const isSelf = !!l.open_at;
  const meta = {
    kind: isSelf ? 'self' : 'ai',
    written_at: l.written_at || l.createdAt || null,
    open_at: l.open_at || null,
    is_opened: !!l.is_opened
  };
  if (!isSelf) {
    meta.content = l.content || '';
    return meta;
  }
  meta.content = null;
  meta.note = l.is_opened
    ? '已开启，正文请在小程序「信箱」中查看。'
    : '这封信还在封存中，到期后才能读到内容。';
  return meta;
}

/**
 * 冷静期到点后真正删数据。由云函数定时触发器每天调用一次（见 config.json）。
 * 之前这里只写了个 deletePending 标记，没有任何东西会来读它 ——
 * 也就是说「7 天后彻底删除」是个没人执行的承诺。
 */
async function purgeExpired() {
  const now = new Date();
  const r = await db.collection('users')
    .where({ deletePending: true, deleteAt: _.lte(now) })
    .limit(50).get();

  const report = [];
  for (const u of r.data) {
    const openid = u._openid;
    const removed = {};
    for (const name of USER_COLLECTIONS) {
      try {
        const res = await db.collection(name).where({ _openid: openid }).remove();
        removed[name] = res.stats ? res.stats.removed : 0;
      } catch (e) {
        console.warn('[purge skip]', name, e.message);
      }
    }
    await db.collection('users').doc(u._id).remove();
    report.push({ user: u._id, removed });
  }
  console.log('[purge]', JSON.stringify(report));
  return report;
}

exports.main = async (event, context) => {
  // 定时触发器没有 OPENID，得走在身份校验前面。
  // 只认 Type === 'Timer'：不留客户端可调的别名，否则任何用户都能手动触发清理。
  // 需要手工跑一次时，在云开发控制台用 {"Type":"Timer"} 测试调用。
  if (event.Type === 'Timer') {
    try {
      return ok({ purged: await purgeExpired() });
    } catch (e) {
      console.error('[purge]', e);
      return err(e.message || 'purge_fail');
    }
  }

  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return err('no_openid');

  const action = event.action || 'login';

  try {
    if (action === 'login') {
      const u = await ensureUser(OPENID);
      // 冷静期内重新登录 = 撤销注销。这是删除弹窗里对用户的承诺。
      if (u.deletePending) {
        await db.collection('users').doc(u._id).update({
          data: { deletePending: false, deleteAt: null }
        });
        u.deletePending = false;
      }
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

      const checkins = await dumpAll('mood_checkins', OPENID);
      const notes = await dumpAll('notes', OPENID);
      const exams = await dumpAll('exams', OPENID);
      const letters = await dumpAll('letters', OPENID);

      return ok({
        exported_at: today,
        profile: {
          nickname: u.nickname,
          province: u.province,
          grade: u.grade,
          dreamSchool: u.dreamSchool,
          createdAt: u.createdAt
        },
        stats: {
          days,
          checkins: checkins.length,
          notes: notes.length,
          letters: letters.length
        },
        exams: exams.map(e => ({
          type: e.type, title: e.title,
          start_date: e.start_date, target_date: e.target_date,
          is_primary: !!e.is_primary
        })),
        checkins: checkins.map(c => ({
          date: c.date, mood_level: c.mood_level === undefined ? null : c.mood_level,
          is_backfill: !!c.is_backfill
        })),
        notes: notes.map(n => ({ date: n.date, content: n.content, updated_at: n.updated_at })),
        // 封存中的信不导出正文。导出口子一旦漏，封存就等于没有。
        letters: letters.map(l => exportLetter(l))
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
