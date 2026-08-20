// cloudfunctions/letter_vault/index.js
// 未来信件的「封存」机制。PRD 5.6：封存后不可查看、不可修改 —— 这条要真正做到位，
// 靠客户端不显示是不够的（导出数据、调试面板、直接翻数据库都能绕过）。
//
// 因此本函数是封存的唯一权威：
//   1. 正文只存在服务端，客户端写完即丢，本地永不保留封存中的正文
//   2. 正文以 AES-256-GCM 加密落库，翻数据库看到的是密文
//   3. list 永远不返回正文；open 由服务端校验 open_at，未到期一律拒绝
//   4. 封存后没有任何 update 正文的入口 —— 改都改不了，只能删
//
// 环境变量：LETTER_SECRET_KEY（32 字节以上的随机串，必须配置）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const MAX_LEN = 1000;
const TRIGGERS = ['d100', 'd50', 'night_before', 'result_day', 'custom'];

function ok(data) { return { code: 0, data }; }
function err(msg) { return { code: 1, msg }; }

const pad = n => n < 10 ? '0' + n : '' + n;
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => keyOf(new Date());
const isDateKey = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function addDays(dateKey, n) {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

/* ---------------- 加密 ---------------- */

function secretKey() {
  const raw = process.env.LETTER_SECRET_KEY;
  if (!raw) return null;
  // 任意长度的口令派生出固定 32 字节密钥
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plain) {
  const key = secretKey();
  if (!key) return { enc: false, body: plain };
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const buf = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return {
    enc: true,
    body: buf.toString('base64'),
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64')
  };
}

function decrypt(doc) {
  if (!doc.enc) return doc.body || '';
  const key = secretKey();
  if (!key) throw new Error('missing_key');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(doc.iv, 'base64'));
  d.setAuthTag(Buffer.from(doc.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(doc.body, 'base64')), d.final()]).toString('utf8');
}

/* ---------------- 开启日期 ---------------- */

/**
 * 由节点推算开启日期。
 * 预设节点绑定考试日期，用户改考期时会被 reschedule 重算；
 * 自定义日期是用户自己定的，任何情况下都不动。
 */
function resolveOpenAt(trigger, targetDate, customDate) {
  if (trigger === 'custom') return isDateKey(customDate) ? customDate : null;
  if (!isDateKey(targetDate)) return null;
  switch (trigger) {
    case 'd100': return addDays(targetDate, -100);
    case 'd50': return addDays(targetDate, -50);
    case 'night_before': return addDays(targetDate, -1);
    case 'result_day': return addDays(targetDate, 23);  // 出分日：多数省份考后约 23 天
    default: return null;
  }
}

async function primaryTargetDate(openid) {
  try {
    const r = await db.collection('exams')
      .where({ _openid: openid, is_primary: true }).limit(1).get();
    if (r.data.length && r.data[0].target_date) return r.data[0].target_date;
  } catch (e) {}
  const now = new Date();
  let y = now.getFullYear();
  if (now >= new Date(y, 5, 8)) y += 1;
  return `${y}-06-07`;
}

/** 对外的信件元数据 —— 注意：任何分支都不含正文 */
function meta(doc) {
  const today = todayKey();
  const ready = doc.open_at <= today;
  return {
    id: doc._id,
    kind: doc.kind || 'self',
    open_at: doc.open_at,
    open_trigger: doc.open_trigger,
    written_at: doc.written_at,
    is_opened: !!doc.is_opened,
    opened_at: doc.opened_at || null,
    // sealed 封存中 / ready 可开启 / opened 已开启
    status: doc.is_opened ? 'opened' : (ready ? 'ready' : 'sealed'),
    days_left: Math.max(Math.round(
      (new Date(doc.open_at) - new Date(today)) / 86400000
    ), 0),
    length: doc.length || 0
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return err('no_openid');

  const action = event.action || 'list';
  const col = db.collection('letters');

  try {
    /* ---- 写信并封存 ---- */
    if (action === 'seal') {
      const content = String(event.content || '').trim();
      if (!content) return err('empty');
      if (content.length > MAX_LEN) return err('too_long');

      const trigger = TRIGGERS.indexOf(event.open_trigger) >= 0 ? event.open_trigger : 'custom';
      const target = await primaryTargetDate(OPENID);
      const openAt = resolveOpenAt(trigger, target, event.open_at);
      if (!openAt) return err('bad_open_at');
      // 开启日必须在未来，否则「封存」没有意义
      if (openAt <= todayKey()) return err('open_at_not_future');

      const box = encrypt(content);
      const added = await col.add({
        data: {
          _openid: OPENID,
          kind: 'self',
          enc: box.enc,
          body: box.body,
          iv: box.iv || '',
          tag: box.tag || '',
          length: content.length,
          open_at: openAt,
          open_trigger: trigger,
          written_at: new Date(),
          is_opened: false,
          opened_at: null,
          createdAt: new Date()
        }
      });
      // 只回元数据，正文不回传 —— 客户端从此刻起就看不到它了
      return ok({
        id: added._id,
        open_at: openAt,
        open_trigger: trigger,
        status: 'sealed',
        encrypted: box.enc
      });
    }

    /* ---- 列表：任何情况下都不含正文 ---- */
    if (action === 'list') {
      const r = await col.where({ _openid: OPENID }).orderBy('createdAt', 'desc').limit(100).get();
      const list = r.data.map(d => {
        // 旧的 AI 代写信没有 open_at，视为已开启、随时可读
        if (!d.open_at) {
          return {
            id: d._id,
            kind: 'ai',
            open_at: null,
            open_trigger: null,
            written_at: d.createdAt,
            is_opened: true,
            opened_at: d.createdAt,
            status: 'opened',
            days_left: 0,
            dream_school: d.dream_school || '',
            length: (d.content || '').length
          };
        }
        return meta(d);
      });
      return ok({ list });
    }

    /* ---- 开启：服务端是唯一裁判 ---- */
    if (action === 'open') {
      const r = await col.doc(event.id).get();
      const d = r.data;
      if (!d || d._openid !== OPENID) return err('not_found');

      // 旧的 AI 信：明文 content 字段，直接给
      if (!d.open_at) return ok({ content: d.content || '', kind: 'ai' });

      if (d.open_at > todayKey()) {
        // 未到期。不返回正文，也不返回任何可推断正文的信息
        return err('still_sealed');
      }

      let content;
      try {
        content = decrypt(d);
      } catch (e) {
        console.error('[letter_vault decrypt]', e.message);
        return err('decrypt_fail');
      }

      if (!d.is_opened) {
        await col.doc(event.id).update({
          data: { is_opened: true, opened_at: new Date() }
        });
      }
      return ok({ content, kind: 'self', open_at: d.open_at, written_at: d.written_at });
    }

    /* ---- 删除：允许，但由调用方做二次确认 ---- */
    if (action === 'delete') {
      const r = await col.doc(event.id).get();
      if (!r.data || r.data._openid !== OPENID) return err('not_found');
      await col.doc(event.id).remove();
      return ok({ deleted: true });
    }

    /* ---- 考试日期变了：预设节点信件的 open_at 同步重算 ---- */
    if (action === 'reschedule') {
      const target = isDateKey(event.target_date)
        ? event.target_date
        : await primaryTargetDate(OPENID);

      const r = await col.where({
        _openid: OPENID,
        is_opened: false,
        open_trigger: _.in(['d100', 'd50', 'night_before', 'result_day'])
      }).limit(100).get();

      let updated = 0;
      for (const d of r.data) {
        const next = resolveOpenAt(d.open_trigger, target);
        if (next && next !== d.open_at) {
          await col.doc(d._id).update({ data: { open_at: next } });
          updated++;
        }
      }
      // 自定义日期的信不动
      return ok({ updated });
    }

    return err('unknown_action');
  } catch (e) {
    console.error('[letter_vault]', e);
    return err(e.message || 'fail');
  }
};
