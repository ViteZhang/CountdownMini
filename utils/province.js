// utils/province.js - 省份数据字典与索引

const provinces = [
  { code: '110000', name: '北京', pinyin: 'B', examType: 'NEW_33', hot: true },
  { code: '120000', name: '天津', pinyin: 'T', examType: 'NEW_33' },
  { code: '130000', name: '河北', pinyin: 'H', examType: 'NEW_312' },
  { code: '140000', name: '山西', pinyin: 'S', examType: 'TRADITIONAL' },
  { code: '150000', name: '内蒙古', pinyin: 'N', examType: 'TRADITIONAL' },
  { code: '210000', name: '辽宁', pinyin: 'L', examType: 'NEW_312' },
  { code: '220000', name: '吉林', pinyin: 'J', examType: 'NEW_312' },
  { code: '230000', name: '黑龙江', pinyin: 'H', examType: 'NEW_312' },
  { code: '310000', name: '上海', pinyin: 'S', examType: 'NEW_33', hot: true },
  { code: '320000', name: '江苏', pinyin: 'J', examType: 'NEW_312', hot: true },
  { code: '330000', name: '浙江', pinyin: 'Z', examType: 'NEW_33', hot: true },
  { code: '340000', name: '安徽', pinyin: 'A', examType: 'NEW_312' },
  { code: '350000', name: '福建', pinyin: 'F', examType: 'NEW_312' },
  { code: '360000', name: '江西', pinyin: 'J', examType: 'NEW_312' },
  { code: '370000', name: '山东', pinyin: 'S', examType: 'NEW_33', hot: true },
  { code: '410000', name: '河南', pinyin: 'H', examType: 'TRADITIONAL', hot: true },
  { code: '420000', name: '湖北', pinyin: 'H', examType: 'NEW_312' },
  { code: '430000', name: '湖南', pinyin: 'H', examType: 'NEW_312' },
  { code: '440000', name: '广东', pinyin: 'G', examType: 'NEW_312', hot: true },
  { code: '450000', name: '广西', pinyin: 'G', examType: 'NEW_312' },
  { code: '460000', name: '海南', pinyin: 'H', examType: 'NEW_33' },
  { code: '500000', name: '重庆', pinyin: 'C', examType: 'NEW_312' },
  { code: '510000', name: '四川', pinyin: 'S', examType: 'TRADITIONAL', hot: true },
  { code: '520000', name: '贵州', pinyin: 'G', examType: 'NEW_312' },
  { code: '530000', name: '云南', pinyin: 'Y', examType: 'TRADITIONAL' },
  { code: '540000', name: '西藏', pinyin: 'X', examType: 'TRADITIONAL' },
  { code: '610000', name: '陕西', pinyin: 'S', examType: 'TRADITIONAL' },
  { code: '620000', name: '甘肃', pinyin: 'G', examType: 'NEW_312' },
  { code: '630000', name: '青海', pinyin: 'Q', examType: 'TRADITIONAL' },
  { code: '640000', name: '宁夏', pinyin: 'N', examType: 'TRADITIONAL' },
  { code: '650000', name: '新疆', pinyin: 'X', examType: 'TRADITIONAL' }
];

const examTypeLabel = {
  NEW_312: '新高考 3+1+2',
  NEW_33: '新高考 3+3',
  TRADITIONAL: '传统文理'
};

function findByCode(code) {
  return provinces.find(p => p.code === code);
}

function findByName(name) {
  if (!name) return null;
  return provinces.find(p => name.indexOf(p.name) !== -1 || p.name.indexOf(name) !== -1);
}

function groupByPinyin(list) {
  const groups = {};
  list.forEach(p => {
    if (!groups[p.pinyin]) groups[p.pinyin] = [];
    groups[p.pinyin].push(p);
  });
  return Object.keys(groups).sort().map(letter => ({
    letter,
    items: groups[letter]
  }));
}

module.exports = {
  provinces,
  examTypeLabel,
  findByCode,
  findByName,
  groupByPinyin
};
