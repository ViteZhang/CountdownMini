// utils/date.js - 高考倒计时与日期工具

const examTimeStr = (year) => `${year}-06-07T09:00:00+08:00`;

function getExamYear(now = new Date()) {
  const year = now.getFullYear();
  // 6/8 00:00:00 之后切到下一年
  const cutoff = new Date(year, 5, 8, 0, 0, 0);
  return now >= cutoff ? year + 1 : year;
}

function getExamMoment(now = new Date()) {
  const year = getExamYear(now);
  return new Date(`${year}-06-07T09:00:00+08:00`);
}

function diffCountdown(now = new Date()) {
  const target = getExamMoment(now);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true, year: getExamYear(now) };
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { days, hours, minutes, seconds, ended: false, year: getExamYear(now) };
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatExamDate(now = new Date()) {
  const year = getExamYear(now);
  const target = new Date(year, 5, 7);
  const weekArr = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${year} 年 6 月 7 日 ${weekArr[target.getDay()]}`;
}

function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function hoursBetween(t1, t2) {
  return Math.abs(t2 - t1) / 3600000;
}

module.exports = {
  getExamYear,
  getExamMoment,
  diffCountdown,
  formatExamDate,
  todayStr,
  isSameDay,
  hoursBetween,
  pad2
};
