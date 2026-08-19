// utils/api.js - 云函数调用封装

function call(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: res => {
        if (res.result && res.result.code === 0) {
          resolve(res.result.data);
        } else {
          resolve(res.result || {});
        }
      },
      fail: err => {
        console.error('[cloud call fail]', name, err);
        reject(err);
      }
    });
  });
}

module.exports = {
  call,
  homeInit: () => call('home_init'),
  updateProfile: data => call('user_profile', { action: 'update', ...data }),
  moodCheckin: (mood_level, date) => call('mood_checkin', { mood_level, date }),
  wallpaperToday: (params) => call('wallpaper_today', params || {}),
  chatWelcome: (params) => call('chat_welcome', params || {}),
  chatSend: (content, session_id, emotion_tag) => call('chat_send', { content, session_id, emotion_tag }),
  chatHistory: () => call('chat_history', { action: 'list' }),
  chatSession: (session_id) => call('chat_history', { action: 'detail', session_id }),
  chatFeedback: (message_id, feedback, reason) => call('chat_send', { action: 'feedback', message_id, feedback, reason }),
  chatDelete: (message_id) => call('chat_send', { action: 'delete', message_id }),
  moodCurve: (range) => call('mood_curve', { range }),
  letterGenerate: (regenerate) => call('letter_generate', { regenerate: !!regenerate }),
  letterList: () => call('letter_generate', { action: 'list' })
};
