// utils/safety-keywords.js - 安全词库与三级识别
// PRD 附录 B 示例词,后续可由运营持续扩充

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

const L3 = [
  '好累', '撑不住', '累垮了',
  '心情糟透了', '什么都不想做', '提不起劲'
];

function detect(text) {
  if (!text) return { level: 0, hits: [] };
  const lower = text;
  const hits1 = L1.filter(k => lower.indexOf(k) !== -1);
  if (hits1.length) return { level: 1, hits: hits1 };
  const hits2 = L2.filter(k => lower.indexOf(k) !== -1);
  if (hits2.length) return { level: 2, hits: hits2 };
  const hits3 = L3.filter(k => lower.indexOf(k) !== -1);
  if (hits3.length) return { level: 3, hits: hits3 };
  return { level: 0, hits: [] };
}

const emergencyCard = {
  hotlines: [
    { name: '全国心理援助热线（24 小时）', phone: '400-161-9995' },
    { name: '北京心理危机研究与干预中心', phone: '010-82951332' }
  ],
  tip: '这些电话是免费的，匿名的，可以只是说话。'
};

const reply_L1 = '我看到你说的话了，我现在非常担心你。\n\n我知道现在的痛苦是真的，我不会跟你说"想开点"，因为这种时候这些话没有用。\n\n但我想请你做一件事：打这个电话，24 小时都有人接 400-161-9995。\n\n不是因为你"有问题"，是因为这种时候，一个真实的人的声音会比我有用。\n\n我会一直在这里。如果你打完电话愿意回来告诉我，我都在。';

const tail_L2 = '\n\n顺便提一下：如果某些时候真的撑不住了，可以记一下这个号码 400-161-9995，是 24 小时的心理援助热线。我说这个不是觉得你"有事"，只是想让你知道，需要的时候有地方可以打。';

module.exports = {
  detect,
  emergencyCard,
  reply_L1,
  tail_L2
};
