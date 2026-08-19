// utils/store.js - local-first 数据层
// 原则（PRD 4）：所有数据先写本地，账号只是同步凭证，不是使用前提。
// 未登录状态下全部功能可用；登录后本地数据上行合并，之后双向同步。

const model = require('./model.js');

const K = {
  version:  'cd_schema_version',
  exam:     'cd_exam',
  checkins: 'cd_checkins',   // { 'YYYY-MM-DD': { is_backfill, created_at } }
  notes:    'cd_notes',      // [ { id, date, content, created_at, updated_at } ]
  theme:    'cd_theme',      // 'auto' | 'light' | 'dark'
  legacy:   'app_state'      // 旧版全局缓存，只读不删
};

function get(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return (v === '' || v === null || v === undefined) ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function set(key, value) {
  try { wx.setStorageSync(key, value); } catch (e) {}
}

function uuid() {
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ================= 迁移 ================= */

/**
 * 从旧版（高三同行）本地状态生成一条 primary exam。
 * 旧版高考写死 6/7，省份存在 app_state.province。
 * start_date 无从得知，先给按类型倒推的默认值，随后 mergeCloud() 会用
 * 云端最早的一条 mood_checkins 把它往前拉到真实起点。
 */
function migrateFromLegacy() {
  const legacy = get(K.legacy, {}) || {};
  const now = new Date();

  let target = model.fromKey(String(legacy.examDate || '').slice(0, 10));
  if (!target || target <= model.startOfDay(now)) target = model.defaultTarget('gaokao', now);

  const exam = {
    id: uuid(),
    type: 'gaokao',
    title: '高考',
    start_date: model.toKey(model.defaultStart('gaokao', target, now)),
    target_date: model.toKey(target),
    province: legacy.province ? legacy.province.name : '',
    is_primary: true,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  set(K.exam, exam);
  set(K.checkins, get(K.checkins, {}));
  set(K.notes, get(K.notes, []));
  set(K.version, model.SCHEMA_VERSION);
  return exam;
}

/** 启动时调用，幂等。返回 { exam, migrated } */
function boot() {
  const version = Number(get(K.version, 0)) || 0;
  let migrated = false;

  if (version < model.SCHEMA_VERSION) {
    const legacy = get(K.legacy, null);
    const hasExam = !!get(K.exam, null);
    if (!hasExam && legacy) {
      // 线上老用户：有旧缓存但没有 exam → 迁移
      migrateFromLegacy();
      migrated = true;
    } else {
      set(K.version, model.SCHEMA_VERSION);
    }
  }

  return { exam: getExam(), migrated };
}

/** 是否已完成配置（决定要不要走引导） */
function isConfigured() {
  const e = getExam();
  return !!(e && e.start_date && e.target_date);
}

/* ================= Exam ================= */

function getExam() {
  return get(K.exam, null);
}

function saveExam(patch) {
  const cur = getExam() || {
    id: uuid(), type: 'gaokao', title: '高考',
    is_primary: true, created_at: Date.now()
  };
  const next = Object.assign({}, cur, patch, { updated_at: Date.now() });
  set(K.exam, next);
  return next;
}

/* ================= CheckIn ================= */

function getCheckins() {
  return get(K.checkins, {}) || {};
}

function hasCheckin(dateKey) {
  return !!getCheckins()[dateKey];
}

function checkinCount() {
  return Object.keys(getCheckins()).length;
}

/**
 * 打卡。同一天重复调用是幂等的（不会重复计数）。
 * @returns { added:boolean, record }
 */
function addCheckin(dateKey, opts) {
  const key = dateKey || model.toKey(new Date());
  const map = getCheckins();
  if (map[key]) return { added: false, record: map[key] };

  const exam = getExam();
  map[key] = {
    exam_id: exam ? exam.id : '',
    is_backfill: !!(opts && opts.is_backfill),
    created_at: Date.now()
  };
  set(K.checkins, map);
  return { added: true, record: map[key] };
}

/* ================= Note（心里话） ================= */

function getNotes() {
  const list = get(K.notes, []) || [];
  return list.slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.created_at || 0) - (a.created_at || 0)));
}

function notesOn(dateKey) {
  return getNotes().filter(n => n.date === dateKey);
}

function noteCount() {
  return (get(K.notes, []) || []).length;
}

/** 保存心里话（≤200 字）。内容为空则不保存。 */
function addNote(dateKey, content) {
  const text = String(content || '').trim().slice(0, 200);
  if (!text) return null;
  const exam = getExam();
  const note = {
    id: uuid(),
    exam_id: exam ? exam.id : '',
    date: dateKey || model.toKey(new Date()),
    content: text,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  const list = get(K.notes, []) || [];
  list.push(note);
  set(K.notes, list);
  return note;
}

function removeNote(id) {
  const list = (get(K.notes, []) || []).filter(n => n.id !== id);
  set(K.notes, list);
}

/* ================= 主题 ================= */

function getTheme() { return get(K.theme, 'auto'); }
function setTheme(t) { set(K.theme, t); return t; }

/* ================= 云端合并 ================= */

/**
 * 把云端数据并入本地。规则（PRD 5.14.4）：
 *  - 打卡取并集（不同设备的打卡都算数）
 *  - 心里话按 id 去重，冲突以 updated_at 较晚者为准
 *  - exam 本地为真相源；仅在本地缺失时采用云端
 *  - 老用户的 start_date 若晚于云端最早的打卡日，往前拉到那一天
 * 任何一步失败都不抛错——同步失败不得阻塞功能。
 */
function mergeCloud(remote) {
  if (!remote) return { changed: false };
  let changed = false;

  try {
    // exam
    if (remote.exam && !getExam()) {
      set(K.exam, Object.assign({ id: uuid() }, remote.exam));
      changed = true;
    }

    // checkins 并集
    const map = getCheckins();
    (remote.checkins || []).forEach(c => {
      const key = typeof c === 'string' ? c : c.date;
      if (!key || map[key]) return;
      map[key] = {
        exam_id: (c && c.exam_id) || '',
        is_backfill: !!(c && c.is_backfill),
        mood_level: c && c.mood_level,
        created_at: (c && c.created_at) || Date.now(),
        from_cloud: true
      };
      changed = true;
    });
    if (changed) set(K.checkins, map);

    // notes 按 id 合并
    const local = get(K.notes, []) || [];
    const byId = {};
    local.forEach(n => { byId[n.id] = n; });
    (remote.notes || []).forEach(n => {
      if (!n || !n.id) return;
      const prev = byId[n.id];
      if (!prev || (n.updated_at || 0) > (prev.updated_at || 0)) {
        byId[n.id] = n;
        changed = true;
      }
    });
    set(K.notes, Object.values(byId));

    // start_date 回拉：老用户的真实起点不该晚于他最早的一次打卡
    const exam = getExam();
    const keys = Object.keys(getCheckins()).sort();
    if (exam && keys.length && keys[0] < exam.start_date) {
      saveExam({ start_date: keys[0] });
      changed = true;
    }
  } catch (e) {
    // 静默：同步失败不影响本地使用
  }

  set(K.version, model.SCHEMA_VERSION);
  return { changed };
}

/** 首页需要的一次性快照 */
function snapshot(now) {
  const exam = getExam();
  const stats = exam ? model.computeExam(exam, now) : null;
  return {
    exam,
    stats,
    totalCheckins: checkinCount(),
    totalNotes: noteCount(),
    checkedToday: hasCheckin(model.toKey(now || new Date()))
  };
}

module.exports = {
  KEYS: K,
  boot, isConfigured, uuid,
  getExam, saveExam,
  getCheckins, hasCheckin, checkinCount, addCheckin,
  getNotes, notesOn, noteCount, addNote, removeNote,
  getTheme, setTheme,
  mergeCloud, snapshot
};
