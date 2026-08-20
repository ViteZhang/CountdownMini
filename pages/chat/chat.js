// pages/chat/chat.js
const nav = require('../../utils/nav.js');
const dateUtil = require('../../utils/date.js');
const api = require('../../utils/api.js');
const { ensureLogin } = require('../../utils/auth.js');
const safety = require('../../utils/safety-keywords.js');

const QUICK_TAGS = [
  { key: 'exam_failed', label: '模考崩了' },
  { key: 'no_motivation', label: '不想学' },
  { key: 'parent_fight', label: '跟爸妈吵架了' },
  { key: 'insomnia', label: '睡不着' },
  { key: 'wanna_cry', label: '想哭' },
  { key: 'fear_fail', label: '怕考不上' },
  { key: 'lonely', label: '没人懂我' }
];

const WELCOMES = {
  first: '嗨，我是星语。从今天起我都在这里。你可以告诉我任何事情，开心的、难过的、不想跟别人说的，都行。',
  back_lt_1h: '怎么了？这么快又来了。',
  back_lt_12h: '嗨，回来了。',
  back_gt_12h: '好久不见。最近怎么样？',
  back_gt_3d: '好久没见到你了，担心你。今天怎么样？',
  mood_n2: '你刚选了 😭。慢慢说，我在听。',
  mood_n1: '今天好像不太好，可以告诉我发生什么了吗？',
  mood_0: '如果你想聊聊，我都在。',
  mood_p1: '嗯，平平稳稳就好。今天有什么收获？',
  mood_p2: '今天状态不错！想和我分享点什么吗？',
  late_night: '都这个点了你还没睡。是睡不着，还是有什么事？',
  early_morning: '这个时间你还醒着，是发生什么了吗？',
  near_30: '高考越来越近了。这段时间不容易，能坚持到现在已经很厉害了。',
  near_7: '马上就要走进考场了。你现在的所有焦虑，都是正常的。'
};

let msgIdSeed = 0;
function nextId() { msgIdSeed += 1; return 'm' + Date.now() + '_' + msgIdSeed; }

Page({
  goBack() {
    nav.back('/pages/home/home');
  },

  data: {
    statusBarHeight: 20,
    safeBottom: 24,
    messages: [],
    draft: '',
    sending: false,
    scrollTo: '',
    showQuickTags: true,
    quickTags: QUICK_TAGS,

    showSafetyBar: false,
    showSafetyCard: false,
    networkOffline: false,
    sessionId: '',
    lastSeenAt: 0
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({
        statusBarHeight: sys.statusBarHeight || 20,
        safeBottom: (sys.safeArea && sys.screenHeight - sys.safeArea.bottom) || 24
      });
    } catch (e) {}

    wx.onNetworkStatusChange(res => {
      this.setData({ networkOffline: !res.isConnected });
    });
    wx.getNetworkType({
      success: res => {
        this.setData({ networkOffline: res.networkType === 'none' });
      }
    });

    this.bootstrap();
  },

  onShow() {
    // 处理从首页心情打卡跳转过来
    const trigger = wx.getStorageSync('chat_mood_trigger');
    if (trigger && Date.now() - trigger.ts < 5000) {
      wx.removeStorageSync('chat_mood_trigger');
      this.handleMoodTrigger(trigger.level);
    }
  },

  bootstrap() {
    const lastSeen = wx.getStorageSync('chat_last_seen') || 0;
    const sessionDate = wx.getStorageSync('chat_session_date');
    const today = dateUtil.todayStr();
    let sessionId = wx.getStorageSync('chat_session_id');
    if (sessionDate !== today) {
      sessionId = 'sess_' + Date.now();
      wx.setStorageSync('chat_session_id', sessionId);
      wx.setStorageSync('chat_session_date', today);
      wx.setStorageSync('chat_messages_' + today, []);
    }
    const cached = wx.getStorageSync('chat_messages_' + today) || [];

    const welcome = this.pickWelcome(lastSeen);
    const greeting = {
      id: nextId(),
      role: 'AI',
      content: welcome,
      streaming: false,
      ts: Date.now()
    };

    const messages = cached.length ? cached : [greeting];
    this.setData({
      messages,
      sessionId,
      lastSeenAt: lastSeen,
      scrollTo: 'm-' + messages[messages.length - 1].id
    });
    wx.setStorageSync('chat_messages_' + today, messages);
    wx.setStorageSync('chat_last_seen', Date.now());
  },

  pickWelcome(lastSeen) {
    const now = new Date();
    const g = getApp().globalData;
    const days = g.daysRemaining || 218;
    if (days < 8) return WELCOMES.near_7;
    if (days < 31) return WELCOMES.near_30;

    const hour = now.getHours();
    if (hour >= 2 && hour < 5) return WELCOMES.early_morning;
    if (hour >= 23 || hour < 2) return WELCOMES.late_night;

    if (g.moodToday !== null && g.moodToday !== undefined) {
      const map = { '-2': WELCOMES.mood_n2, '-1': WELCOMES.mood_n1, '0': WELCOMES.mood_0, '1': WELCOMES.mood_p1, '2': WELCOMES.mood_p2 };
      if (map[String(g.moodToday)]) return map[String(g.moodToday)];
    }

    if (!lastSeen) return WELCOMES.first;
    const hours = (Date.now() - lastSeen) / 3600000;
    if (hours < 1) return WELCOMES.back_lt_1h;
    if (hours < 12) return WELCOMES.back_lt_12h;
    if (hours < 72) return WELCOMES.back_gt_12h;
    return WELCOMES.back_gt_3d;
  },

  handleMoodTrigger(level) {
    // 用 mood 对应的话术作为新的 AI 起句
    const map = { '-2': WELCOMES.mood_n2, '-1': WELCOMES.mood_n1, '0': WELCOMES.mood_0, '1': WELCOMES.mood_p1, '2': WELCOMES.mood_p2 };
    const greeting = map[String(level)] || WELCOMES.mood_0;
    const msg = { id: nextId(), role: 'AI', content: greeting, streaming: false, ts: Date.now() };
    const messages = this.data.messages.concat(msg);
    this.setData({ messages, scrollTo: 'm-' + msg.id });
    this.persistMessages(messages);
  },

  persistMessages(messages) {
    wx.setStorageSync('chat_messages_' + dateUtil.todayStr(), messages);
  },

  onInput(e) {
    this.setData({ draft: e.detail.value });
  },

  onQuickTag(e) {
    const { key, label } = e.currentTarget.dataset;
    if (this.data.sending) return;
    this.send(label, key);
  },

  onSend() {
    if (this.data.sending) return;
    const text = (this.data.draft || '').trim();
    if (!text) return;
    this.setData({ draft: '' });
    this.send(text, null);
  },

  async send(content, emotionTag) {
    const g = getApp().globalData;

    // 未登录态:前 3 轮放行,第 4 条触发拦截
    if (!g.isLogin) {
      const userMsgCount = this.data.messages.filter(m => m.role === 'USER').length;
      if (userMsgCount >= 3) {
        ensureLogin('授权登录后，可保存完整的树洞对话历史').then(() => {
          this.send(content, emotionTag);
        }).catch(() => {});
        return;
      }
    }

    // 安全词识别（前端预扫）
    const detection = safety.detect(content);

    // 推入用户消息
    const userMsg = { id: nextId(), role: 'USER', content, emotion_tag: emotionTag, ts: Date.now() };
    let messages = this.data.messages.concat(userMsg);

    // L1 高危:立即吐固定话术 + 显示求助组件,不调 AI
    if (detection.level === 1) {
      const safeReply = { id: nextId(), role: 'AI', content: safety.reply_L1, streaming: false, ts: Date.now() };
      messages = messages.concat(safeReply);
      this.setData({
        messages,
        scrollTo: 'm-' + safeReply.id,
        showSafetyBar: true,
        showSafetyCard: true,
        sending: false
      });
      this.persistMessages(messages);
      // 上报安全事件
      wx.cloud.callFunction({
        name: 'safety_check',
        data: { trigger_type: 'KEYWORD_L1', content, session_id: this.data.sessionId }
      }).catch(() => {});
      return;
    }

    // 推入 AI 占位（流式）
    const aiMsg = { id: nextId(), role: 'AI', content: '', streaming: true, ts: Date.now() };
    messages = messages.concat(aiMsg);
    this.setData({
      messages,
      sending: true,
      scrollTo: 'm-' + aiMsg.id
    });

    try {
      const res = await api.chatSend(content, this.data.sessionId, emotionTag);
      const reply = (res && res.reply) || '嗯，我在听。你接着说。';
      const riskLevel = res && res.risk_level; // 服务端二次判断

      // 流式效果:逐字写入
      await this.streamReply(aiMsg.id, reply);

      if (riskLevel === 'DANGER' || detection.level === 2) {
        this.setData({ showSafetyBar: true, showSafetyCard: true });
      }
    } catch (err) {
      // 异常:替换为失败提示
      const fail = this.data.messages.map(m => {
        if (m.id === aiMsg.id) {
          return { ...m, content: '星语好像走神了，重新发送试试？', streaming: false, failed: true };
        }
        return m;
      });
      this.setData({ messages: fail, sending: false });
      this.persistMessages(fail);
      return;
    }

    this.setData({ sending: false });
    wx.setStorageSync('chat_last_seen', Date.now());
    this.persistMessages(this.data.messages);
  },

  streamReply(msgId, fullText) {
    return new Promise(resolve => {
      let i = 0;
      const chunk = Math.max(2, Math.floor(fullText.length / 60));
      const step = () => {
        i += chunk;
        const messages = this.data.messages.map(m => {
          if (m.id === msgId) {
            const done = i >= fullText.length;
            return { ...m, content: fullText.slice(0, i), streaming: !done };
          }
          return m;
        });
        this.setData({
          messages,
          scrollTo: 'm-' + msgId
        });
        if (i < fullText.length) {
          setTimeout(step, 28);
        } else {
          resolve();
        }
      };
      step();
    });
  },

  onLongPressUser(e) {
    const id = e.currentTarget.dataset.id;
    wx.vibrateShort({ type: 'light' });
    wx.showActionSheet({
      itemList: ['复制', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          const m = this.data.messages.find(x => x.id === id);
          if (m) wx.setClipboardData({ data: m.content });
        } else if (res.tapIndex === 1) {
          const messages = this.data.messages.filter(x => x.id !== id);
          this.setData({ messages });
          this.persistMessages(messages);
        }
      }
    });
  },

  onLongPressAI(e) {
    const id = e.currentTarget.dataset.id;
    wx.vibrateShort({ type: 'light' });
    wx.showActionSheet({
      itemList: ['复制', '反馈 · 不够好', '反馈 · 很温暖'],
      success: (res) => {
        const m = this.data.messages.find(x => x.id === id);
        if (!m) return;
        if (res.tapIndex === 0) {
          wx.setClipboardData({ data: m.content });
        } else if (res.tapIndex === 1) {
          this.feedback(id, 'BAD');
        } else if (res.tapIndex === 2) {
          this.feedback(id, 'GOOD');
        }
      }
    });
  },

  feedback(id, value) {
    if (value === 'BAD') {
      wx.showActionSheet({
        itemList: ['说教', '不理解我', '太长', '太短', '其他'],
        success: (r) => {
          const reason = ['说教', '不理解我', '太长', '太短', '其他'][r.tapIndex] || '其他';
          this.markFeedback(id, value, reason);
        }
      });
    } else {
      this.markFeedback(id, value, '');
    }
  },

  markFeedback(id, value, reason) {
    const messages = this.data.messages.map(m => m.id === id ? { ...m, feedback: value, feedback_reason: reason } : m);
    this.setData({ messages });
    this.persistMessages(messages);
    api.chatFeedback(id, value, reason).catch(() => {});
    wx.showToast({ title: '感谢反馈', icon: 'success', duration: 800 });
  },

  callHotline(e) {
    const num = e.currentTarget.dataset.num;
    wx.makePhoneCall({
      phoneNumber: num,
      fail: () => {}
    });
  },

  closeSafety() {
    this.setData({ showSafetyBar: false });
  },

  onSystemTap() {}
});
