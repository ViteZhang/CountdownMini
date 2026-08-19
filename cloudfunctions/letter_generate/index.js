// cloudfunctions/letter_generate/index.js
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data, ...data }; }

function buildPrompt({ nickname, dream_school, grade, days_remaining }) {
  return `# 任务
你将扮演"考上了 ${dream_school || '理想大学'} 之后的用户自己"，给"现在的高三的用户自己"写一封信。

# 信件要求
- 长度 300-500 字
- 第一人称("我"指代"未来的你")
- 称呼："${nickname || '亲爱的我'}：" 或者直呼"亲爱的我"
- 文风：朴实、不煽情、不写"鸡汤"
- 不要写"你一定会考上的"这种判断
- 要写出"我考上之后看回去"的视角
- 提及一个具体的细节场景(校园里的某棵树、某条小路、某个食堂、某门课)，让信件可信
- 结尾署名："—— 考上之后的你"

# 上下文
- 用户昵称：${nickname || '同学'}
- 用户梦想院校：${dream_school || '理想大学'}
- 用户年级：${grade || '高三'}
- 用户距高考天数：${days_remaining || 218}

# 不要做
- 不要列点
- 不要写超过 500 字
- 不要用"未来不可知"这种表达，要假定"考上了"
- 不要写父母、老师、同学的话
- 不要写"如果你没考上"
- 不要使用 emoji 与感叹号链`;
}

function callQwen(messages) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return Promise.resolve({ content: mockLetter(messages), mock: true });
  }
  const body = JSON.stringify({
    model: 'qwen-plus',
    messages,
    temperature: 0.9,
    max_tokens: 800,
    stream: false
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'dashscope.aliyuncs.com',
      port: 443,
      path: '/compatible-mode/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 40000
    }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (json.error) {
            resolve({ content: mockLetter(messages), mock: true });
            return;
          }
          const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          resolve({ content: content || mockLetter(messages) });
        } catch (e) {
          resolve({ content: mockLetter(messages), mock: true });
        }
      });
    });
    req.on('error', () => resolve({ content: mockLetter(messages), mock: true }));
    req.on('timeout', () => { req.destroy(); resolve({ content: mockLetter(messages), mock: true }); });
    req.write(body);
    req.end();
  });
}

function mockLetter() {
  return '亲爱的我：\n\n现在的你是不是又在熬夜复习？我知道，那种感觉就像永远走不到尽头。\n\n我现在坐在校园中心的一棵银杏树下，秋天的叶子全黄了。风一吹就落下来一片，铺在水泥地上像金色的小手掌。我想告诉你的不是"你一定会考上"，而是——无论那个 6 月 7 日你做对了多少题，你都会比现在的自己强一点。\n\n那天我走出考场的时候，没有像电视剧里那样欢呼。我只是觉得，那段日子真的过去了。\n\n你担心的那些事，大部分都没有发生。你以为很重要的题，最后也没怎么考。但你在那两百多天里写下的每一道错题、哭过的每一个晚上，都长在了我身上。\n\n好好睡觉。\n\n—— 考上之后的你';
}

function thisWeekStart() {
  const d = new Date();
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d.getTime() - (day - 1) * 86400000);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ content: '' });

  const action = event.action || 'generate';

  if (action === 'list') {
    try {
      const r = await db.collection('letters')
        .where({ _openid: OPENID })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      return ok({
        list: r.data.map(l => ({
          id: l._id,
          content: l.content,
          dream_school: l.dream_school,
          generated_at: l.createdAt
        }))
      });
    } catch (e) {
      return ok({ list: [] });
    }
  }

  if (action === 'detail') {
    try {
      const r = await db.collection('letters').doc(event.id).get();
      const l = r.data;
      return ok({ content: l.content, dream_school: l.dream_school });
    } catch (e) {
      return ok({ content: '' });
    }
  }

  // 生成
  let user = null;
  try {
    const u = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
    if (u.data.length) user = u.data[0];
  } catch (e) {}

  // 本周生成次数限制(首次免费,重新生成本周限 1 次)
  let regen_left = 1;
  if (event.regenerate) {
    try {
      const wkStart = thisWeekStart();
      const cRes = await db.collection('letters')
        .where({ _openid: OPENID, createdAt: db.command.gte(wkStart) })
        .count();
      if (cRes.total >= 2) {
        return ok({ content: '', regen_left: 0, msg: '本周已用完' });
      }
      regen_left = Math.max(0, 1 - (cRes.total));
    } catch (e) {}
  }

  // 距高考天数
  const now = new Date();
  let examYear = now.getFullYear();
  if (now >= new Date(examYear, 5, 8)) examYear += 1;
  const examDate = new Date(examYear, 5, 7, 9, 0, 0);
  const days_remaining = Math.max(0, Math.floor((examDate - now) / 86400000));

  const prompt = buildPrompt({
    nickname: user && user.nickname,
    dream_school: user && user.dreamSchool,
    grade: user && user.grade,
    days_remaining
  });

  const res = await callQwen([
    { role: 'system', content: '你是一个善于写信的高考过来人,擅长用朴实的语言传递力量。' },
    { role: 'user', content: prompt }
  ]);

  const content = res.content || mockLetter();

  let letterId = '';
  try {
    const added = await db.collection('letters').add({
      data: {
        _openid: OPENID,
        content,
        dream_school: (user && user.dreamSchool) || '理想大学',
        context_summary: '',
        createdAt: new Date()
      }
    });
    letterId = added._id;
  } catch (e) {}

  return ok({ id: letterId, content, regen_left });
};
