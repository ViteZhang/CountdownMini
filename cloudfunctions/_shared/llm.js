// cloudfunctions/_shared/llm.js
// 通义千问 qwen-plus 调用封装(DashScope OpenAI 兼容模式)
// 环境变量:DASHSCOPE_API_KEY

const https = require('https');

const ENDPOINT_HOST = 'dashscope.aliyuncs.com';
const ENDPOINT_PATH = '/compatible-mode/v1/chat/completions';
const DEFAULT_MODEL = 'qwen-plus';

function callLLM({ messages, model, temperature, max_tokens }) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    // 未配置 Key:返回 mock
    return Promise.resolve({
      mock: true,
      content: mockReply(messages)
    });
  }

  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    messages,
    temperature: temperature !== undefined ? temperature : 0.85,
    max_tokens: max_tokens || 600,
    stream: false
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: ENDPOINT_HOST,
      port: 443,
      path: ENDPOINT_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 25000
    }, res => {
      let buf = '';
      res.on('data', chunk => { buf += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (json.error) {
            console.error('[llm error]', json.error);
            resolve({ mock: true, content: mockReply(messages), error: json.error });
            return;
          }
          const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          resolve({ content: content || mockReply(messages), tokens: (json.usage && json.usage.total_tokens) || 0 });
        } catch (e) {
          console.error('[llm parse]', e, buf);
          resolve({ mock: true, content: mockReply(messages) });
        }
      });
    });
    req.on('error', err => {
      console.error('[llm req err]', err);
      resolve({ mock: true, content: mockReply(messages) });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ mock: true, content: mockReply(messages) });
    });
    req.write(body);
    req.end();
  });
}

function mockReply(messages) {
  const last = messages[messages.length - 1] || {};
  const u = last.content || '';
  if (u.indexOf('考') !== -1 || u.indexOf('试') !== -1) {
    return '我看到你说的话了。考砸了那种感觉我懂，去年我也有过。\n\n你愿意和我说说那张卷子是怎么回事吗？不用现在就给自己结论。';
  }
  if (u.indexOf('累') !== -1 || u.indexOf('困') !== -1) {
    return '嗯，听到你说累了。\n\n这种累是身体上的，还是心里那种"已经撑了很久"的累？\n\n你不用现在告诉我，慢慢来。';
  }
  if (u.indexOf('父母') !== -1 || u.indexOf('爸妈') !== -1) {
    return '嗯，听你说。家里这种事最难讲，因为对方是最亲的人。\n\n那一刻你心里在想什么？';
  }
  return '嗯，我在听。\n\n你愿意多说一点吗？不用一次说完，怎么说都行。';
}

module.exports = { callLLM };
