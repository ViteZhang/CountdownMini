// utils/model.js - 备考倒计时核心模型：考试类型、默认日期、进度与成长阶段
// 纯函数，无副作用，可被页面 / 云函数逻辑复用。

const SCHEMA_VERSION = 2;

const EXAM_TYPES = [
  { key: 'gaokao',   name: '高考',     desc: '每年 6 月 7 日' },
  { key: 'zhongkao', name: '中考',     desc: '各省不同，通常 6 月中旬' },
  { key: 'kaoyan',   name: '考研',     desc: '每年 12 月下旬' },
  { key: 'kaogong',  name: '考公',     desc: '国考 11 月，省考 3 月' },
  { key: 'custom',   name: '其他考试', desc: '自己设定日期' }
];

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/* ---------------- 日期工具（全部以本地时间 00:00 为界） ---------------- */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/** Date → 'YYYY-MM-DD' */
function toKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date（当天 00:00 本地时间）。非法输入返回 null */
function fromKey(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** 抹掉时分秒，只留当天 00:00 */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function today() { return startOfDay(new Date()); }

/** b - a，以「天」为单位 */
function diffDays(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

/** '2027年6月7日' */
function humanDate(d) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function weekdayOf(d) { return WEEKDAYS[d.getDay()]; }

function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}

/* ---------------- 默认日期规则（对齐 PRD 5.1） ---------------- */

/** 某年 12 月倒数第 nth 个周六 */
function nthLastSaturday(year, nth) {
  const d = new Date(year, 11, 31);
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() - 7 * (nth - 1));
  return startOfDay(d);
}

/** 某年 11 月最后一个周日 */
function lastSundayOfNov(year) {
  const d = new Date(year, 10, 30);
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  return startOfDay(d);
}

/** 按类型给出默认目标日期；已过期自动顺延一年 */
function defaultTarget(type, now) {
  const base = startOfDay(now || new Date());
  const y = base.getFullYear();
  const roll = (make) => {
    let d = make(y);
    if (d <= base) d = make(y + 1);
    return d;
  };
  switch (type) {
    case 'gaokao':   return roll(yy => new Date(yy, 5, 7));
    case 'zhongkao': return roll(yy => new Date(yy, 5, 15));
    case 'kaoyan':   return roll(yy => nthLastSaturday(yy, 3));
    case 'kaogong':  return roll(yy => lastSundayOfNov(yy));
    default:         return addDays(base, 30);
  }
}

/** 按类型给出默认起始日期；晚于今天则回落为今天 */
function defaultStart(type, target, now) {
  const base = startOfDay(now || new Date());
  let d;
  switch (type) {
    case 'gaokao':
    case 'zhongkao':
      d = new Date(target.getFullYear() - 3, 8, 1); break;   // 入学 9/1，倒推 3 年
    case 'kaoyan':
    case 'kaogong':
      d = new Date(target.getFullYear(), 2, 1); break;       // 当年 3/1
    default:
      d = base;
  }
  return d > base ? base : d;
}

/** 起始日期的快捷选项 */
function quickStarts(type, target, now) {
  const base = startOfDay(now || new Date());
  const ty = target.getFullYear();
  if (type === 'gaokao') {
    return [
      { name: '高一开学', date: new Date(ty - 3, 8, 1) },
      { name: '高三开学', date: new Date(ty - 1, 8, 1) },
      { name: '今天', date: base }
    ];
  }
  if (type === 'zhongkao') {
    return [
      { name: '初一开学', date: new Date(ty - 3, 8, 1) },
      { name: '初三开学', date: new Date(ty - 1, 8, 1) },
      { name: '今天', date: base }
    ];
  }
  return [
    { name: '决定要考的那天', date: new Date(ty, 2, 1) },
    { name: '今天', date: base }
  ];
}

/* ---------------- 成长物阶段（只与 progress 有关，与打卡无关） ---------------- */

const GROWTH_STAGES = [
  { max: 0.15, key: 'seed',   name: '种子' },
  { max: 0.30, key: 'sprout', name: '破土' },
  { max: 0.50, key: 'branch', name: '抽枝' },
  { max: 0.70, key: 'leaf',   name: '成叶' },
  { max: 0.90, key: 'lush',   name: '繁茂' },
  { max: 1.00, key: 'bud',    name: '结蕾' }
];
const BLOOM = { max: Infinity, key: 'bloom', name: '开花' };

function growthStage(progress) {
  if (progress >= 1) return BLOOM;
  for (const s of GROWTH_STAGES) {
    if (progress < s.max) return s;
  }
  return BLOOM;
}

/** 阶段序号，用于「第 N 阶段」展示 */
function growthIndex(stage) {
  const i = GROWTH_STAGES.findIndex(s => s.key === stage.key);
  return i < 0 ? GROWTH_STAGES.length + 1 : i + 1;
}

/* ---------------- 计算字段（一律实时算，不落库） ---------------- */

/**
 * @param {{start_date:string, target_date:string}} exam
 * @returns 已走过 / 还剩 / 总长 / 进度 / 成长阶段 / 是否考试当天 / 是否考后
 */
function computeExam(exam, now) {
  const base = startOfDay(now || new Date());
  const start = fromKey(exam && exam.start_date) || base;
  const target = fromKey(exam && exam.target_date) || base;

  const total = Math.max(diffDays(start, target), 1);
  const passed = Math.max(diffDays(start, base), 0);
  const remaining = diffDays(base, target);
  const progress = Math.max(0, Math.min(passed / total, 1));
  const stage = growthStage(remaining <= 0 ? 1 : progress);

  return {
    total,
    passed,
    remaining: Math.max(remaining, 0),
    rawRemaining: remaining,
    progress,
    percent: Math.round(progress * 1000) / 10,
    stage,
    stageIndex: growthIndex(stage),
    isExamDay: remaining === 0,
    isAfterExam: remaining < 0
  };
}

/* ---------------- 补签窗口 ---------------- */

const BACKFILL_DAYS = 14;

/** 该日期是否允许补签：过去 14 天内（含今天），且不晚于今天 */
function canBackfill(dateKey, now) {
  const d = fromKey(dateKey);
  if (!d) return false;
  const base = startOfDay(now || new Date());
  const delta = diffDays(d, base);
  return delta >= 0 && delta <= BACKFILL_DAYS;
}

module.exports = {
  SCHEMA_VERSION,
  EXAM_TYPES,
  WEEKDAYS,
  BACKFILL_DAYS,
  pad2, toKey, fromKey, startOfDay, today, diffDays, addDays,
  humanDate, weekdayOf, daysInMonth,
  defaultTarget, defaultStart, quickStarts,
  growthStage, growthIndex, GROWTH_STAGES,
  computeExam, canBackfill
};
