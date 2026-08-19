// cloudfunctions/_shared/safety.js
// 云端复用的安全词库与判断（与小程序端 utils/safety-keywords.js 对齐）

const L1 = [
  '想死', '自杀', '活不下去了', '结束这一切', '解脱', '不想活了', '想结束生命',
  '再见了', '永别', '最后一次了', '不会再来了',
  '记得我', '告诉妈妈我', '把我的东西', '请你照顾'
];
const L2 = [
  '撑不下去', '累得想死', '没意义', '活着没意思', '活着没意义',
  '我是垃圾', '我没用', '我消失了更好', '没有我会更好',
  '没人懂', '没人在乎', '世界没我也行', '没人需要我'
];
const L3 = ['好累', '撑不住', '累垮了', '心情糟透了', '什么都不想做', '提不起劲'];

function detect(text) {
  if (!text) return { level: 0, hits: [] };
  const h1 = L1.filter(k => text.indexOf(k) !== -1);
  if (h1.length) return { level: 1, hits: h1 };
  const h2 = L2.filter(k => text.indexOf(k) !== -1);
  if (h2.length) return { level: 2, hits: h2 };
  const h3 = L3.filter(k => text.indexOf(k) !== -1);
  if (h3.length) return { level: 3, hits: h3 };
  return { level: 0, hits: [] };
}

const reply_L1 = '我看到你说的话了，我现在非常担心你。\n\n我知道现在的痛苦是真的，我不会跟你说"想开点"，因为这种时候这些话没有用。\n\n但我想请你做一件事：打这个电话，24 小时都有人接 400-161-9995。\n\n不是因为你"有问题"，是因为这种时候，一个真实的人的声音会比我有用。\n\n我会一直在这里。如果你打完电话愿意回来告诉我，我都在。';
const tail_L2 = '\n\n顺便提一下：如果某些时候真的撑不住了，可以记一下这个号码 400-161-9995，是 24 小时的心理援助热线。我说这个不是觉得你"有事"，只是想让你知道，需要的时候有地方可以打。';

module.exports = { detect, reply_L1, tail_L2 };
