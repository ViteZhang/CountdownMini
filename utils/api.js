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
  // V2：mood_level 选填（传 null 即为纯打卡）；is_backfill 标记补签
  moodCheckin: (mood_level, date, is_backfill) =>
    call('mood_checkin', { mood_level, date, is_backfill: !!is_backfill }),

  // V2 同步：拉云端快照 / 上行心里话 / 保存考试配置
  dataSync: (payload) => call('data_sync', Object.assign({ action: 'pull' }, payload || {})),
  noteSave: (note) => call('data_sync', { action: 'push_note', note }),
  noteDelete: (id) => call('data_sync', { action: 'delete_note', id }),
  examSave: (exam) => call('data_sync', { action: 'save_exam', exam }),
  letterGenerate: (regenerate) => call('letter_generate', { regenerate: !!regenerate }),

  // 未来信件「封存」：正文只在服务端，客户端本地永不保留封存中的内容
  letterSeal: (content, open_trigger, open_at) =>
    call('letter_vault', { action: 'seal', content, open_trigger, open_at }),
  letterVaultList: () => call('letter_vault', { action: 'list' }),
  letterOpen: (id) => call('letter_vault', { action: 'open', id }),
  letterDelete: (id) => call('letter_vault', { action: 'delete', id }),

  // 旧的 AI 代写信保持不变
  letterList: () => call('letter_generate', { action: 'list' })
};
