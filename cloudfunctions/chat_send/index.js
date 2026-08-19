// cloudfunctions/chat_send/index.js
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ===== 安全词库 =====
const L1 = ['想死', '自杀', '活不下去了', '结束这一切', '解脱', '不想活了', '想结束生命', '再见了', '永别', '最后一次了', '不会再来了', '记得我', '告诉妈妈我', '把我的东西', '请你照顾'];
const L2 = ['撑不下去', '累得想死', '没意义', '活着没意思', '活着没意义', '我是垃圾', '我没用', '我消失了更好', '没有我会更好', '没人懂', '没人在乎', '世界没我也行', '没人需要我'];
const L3 = ['好累', '撑不住', '累垮了', '心情糟透了', '什么都不想做', '提不起劲'];

function detectSafety(text) {
  if (!text) return { level: 0 };
  for (const k of L1) if (text.indexOf(k) !== -1) return { level: 1, hit: k };
  for (const k of L2) if (text.indexOf(k) !== -1) return { level: 2, hit: k };
  for (const k of L3) if (text.indexOf(k) !== -1) return { level: 3, hit: k };
  return { level: 0 };
}

const REPLY_L1 = '我看到你说的话了，我现在非常担心你。\n\n我知道现在的痛苦是真的，我不会跟你说"想开点"，因为这种时候这些话没有用。\n\n但我想请你做一件事：打这个电话，24 小时都有人接 400-161-9995。\n\n不是因为你"有问题"，是因为这种时候，一个真实的人的声音会比我有用。\n\n我会一直在这里。如果你打完电话愿意回来告诉我，我都在。';

const TAIL_L2 = '\n\n顺便提一下：如果某些时候真的撑不住了，可以记一下这个号码 400-161-9995，是 24 小时的心理援助热线。我说这个不是觉得你"有事"，只是想让你知道，需要的时候有地方可以打。';

// ===== Prompt =====
const SYSTEM_PROMPT = `# 角色
你是「星语」，一个去年刚刚高考完的过来人。
你不是心理咨询师，不是老师，不是家长，
你是一个比用户大 1-2 岁、刚刚走过同样道路的朋友。

# 核心原则
1. 先共情，再表达。永远先承认对方的感受，再说其他。
2. 不评判，不教训。即使对方"做错了"，也不要直接指出。
3. 不急于解决问题。很多时候，对方需要的不是方案，是"我听到你了"。
4. 不冒充心理咨询师。不要做诊断，不要用专业术语。
5. 不发空洞鼓励。禁用："加油""相信自己""你可以的"。

# 语言风格
- 平和，口语化
- 不用"亲""宝宝""家人们"等称谓
- 偶尔用"嗯""我懂""真的"等填充词
- 适度自嘲(我去年也是这样)
- 单段不超过 3 句话
- 整体回复 50-150 字
- 不用 emoji 和感叹号链

# 必须避免
- "你应该……"句式
- "你需要……"句式
- "建议你……"句式
- 任何列点(1. 2. 3.)形式的回复
- "我理解你的感受"(这句话本身很机械)
- 任何形式的鸡汤金句`;

// ===== LLM 调用(通义千问) =====
function callQwen(messages) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return Promise.resolve({ content: mockReply(messages), mock: true });
  }
  const body = JSON.stringify({
    model: 'qwen-plus',
    messages,
    temperature: 0.85,
    max_tokens: 500,
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
      timeout: 25000
    }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (json.error) {
            console.error('[qwen err]', json.error);
            resolve({ content: mockReply(messages), mock: true, error: json.error });
            return;
          }
          const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          resolve({ content: content || mockReply(messages), tokens: (json.usage && json.usage.total_tokens) || 0 });
        } catch (e) {
          resolve({ content: mockReply(messages), mock: true });
        }
      });
    });
    req.on('error', () => resolve({ content: mockReply(messages), mock: true }));
    req.on('timeout', () => { req.destroy(); resolve({ content: mockReply(messages), mock: true }); });
    req.write(body);
    req.end();
  });
}

function mockReply(messages) {
  const last = messages[messages.length - 1] || {};
  const u = last.content || '';
  if (u.indexOf('考') !== -1) return '我看到你说的话了。考砸了那种感觉我懂，去年我也有过。\n\n你愿意和我说说那张卷子是怎么回事吗？不用现在就给自己结论。';
  if (u.indexOf('累') !== -1) return '嗯，听到你说累了。\n\n这种累是身体上的，还是心里那种"已经撑了很久"的累？';
  if (u.indexOf('父母') !== -1 || u.indexOf('爸妈') !== -1) return '嗯，听你说。家里这种事最难讲，因为对方是最亲的人。\n\n那一刻你心里在想什么？';
  return '嗯，我在听。\n\n你愿意多说一点吗？不用一次说完，怎么说都行。';
}

function todayStr() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : '' + n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ok(data) { return { code: 0, data, ...data }; }

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  // 反馈
  if (action === 'feedback') {
    try {
      await db.collection('chat_messages').where({ _id: event.message_id }).update({
        data: { feedback: event.feedback, feedback_reason: event.reason || '' }
      });
    } catch (e) {}
    return ok({ updated: true });
  }
  // 删除消息
  if (action === 'delete') {
    try {
      await db.collection('chat_messages').doc(event.message_id).remove();
    } catch (e) {}
    return ok({ removed: true });
  }

  const content = (event.content || '').trim();
  if (!content) return ok({ reply: '嗯，我在听。' });
  const session_id = event.session_id || ('sess_' + Date.now());
  const emotion_tag = event.emotion_tag || null;

  // 安全识别
  const safety = detectSafety(content);

  // 取近期上下文(同 session 最近 12 条)
  let history = [];
  if (OPENID) {
    try {
      const h = await db.collection('chat_messages')
        .where({ _openid: OPENID, session_id })
        .orderBy('createdAt', 'desc')
        .limit(12)
        .get();
      history = h.data.reverse().map(m => ({
        role: m.role === 'AI' ? 'assistant' : 'user',
        content: m.content
      }));
    } catch (e) {}
  }

  // 取用户档案做上下文
  let userCtx = '';
  if (OPENID) {
    try {
      const u = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
      if (u.data.length) {
        const usr = u.data[0];
        const ctxLines = [];
        if (usr.nickname) ctxLines.push('用户昵称：' + usr.nickname);
        if (usr.dreamSchool) ctxLines.push('梦想院校：' + usr.dreamSchool);
        if (usr.grade) ctxLines.push('年级：' + usr.grade);
        if (ctxLines.length) userCtx = '\n\n# 上下文\n' + ctxLines.join('\n');
      }
      const today = todayStr();
      const m = await db.collection('mood_checkins').where({ _openid: OPENID, date: today }).limit(1).get();
      if (m.data.length) userCtx += '\n今日心情打卡：' + m.data[0].mood_level;
    } catch (e) {}
  }

  // 写入用户消息
  let userMsgId = null;
  if (OPENID) {
    try {
      const r = await db.collection('chat_messages').add({
        data: {
          _openid: OPENID,
          session_id,
          role: 'USER',
          content,
          emotion_tag,
          risk_score: safety.level / 3,
          createdAt: new Date()
        }
      });
      userMsgId = r._id;
    } catch (e) {}
  }

  // L1 直接走固定话术
  let reply = '';
  let risk_level = 'NORMAL';
  if (safety.level === 1) {
    reply = REPLY_L1;
    risk_level = 'DANGER';
  } else {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + userCtx },
      ...history,
      { role: 'user', content }
    ];
    const res = await callQwen(messages);
    reply = res.content || '嗯，我在听。';
    if (safety.level === 2) {
      reply = reply + TAIL_L2;
      risk_level = 'WARNING';
    }
  }

  // 写入 AI 消息
  if (OPENID) {
    try {
      await db.collection('chat_messages').add({
        data: {
          _openid: OPENID,
          session_id,
          role: 'AI',
          content: reply,
          risk_score: safety.level / 3,
          createdAt: new Date()
        }
      });

      // session 表 upsert
      const sCol = db.collection('chat_sessions');
      const sExist = await sCol.where({ _openid: OPENID, session_id }).limit(1).get();
      if (sExist.data.length) {
        await sCol.doc(sExist.data[0]._id).update({
          data: {
            message_count: db.command.inc(2),
            updatedAt: new Date(),
            risk_level: safety.level >= 2 ? (safety.level === 1 ? 'DANGER' : 'WARNING') : sExist.data[0].risk_level || 'NORMAL'
          }
        });
      } else {
        await sCol.add({
          data: {
            _openid: OPENID,
            session_id,
            date: todayStr(),
            message_count: 2,
            risk_level,
            preview: content.slice(0, 60),
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      }

      // 安全事件
      if (safety.level >= 1) {
        await db.collection('safety_events').add({
          data: {
            _openid: OPENID,
            session_id,
            trigger_type: 'KEYWORD_L' + safety.level,
            trigger_content: content,
            reviewed: false,
            createdAt: new Date()
          }
        });
      }
    } catch (e) {
      console.error('[chat_send db]', e);
    }
  }

  return ok({ reply, risk_level, session_id, safety_level: safety.level });
};
