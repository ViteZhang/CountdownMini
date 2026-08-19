// utils/auth.js - 登录与权限拦截
// 注:微信 2022/10 起回收 wx.getUserInfo,昵称头像必须由用户主动通过
// button open-type="chooseAvatar" + input type="nickname" 提供。
// 因此登录流程拆为两步:
//   1) wx.cloud.callFunction(login) 仅拿 openid 并建用户档案
//   2) 若云端没有 nickname,跳转 profile-edit 让用户补全

const app = () => getApp();

function ensureLogin(reason) {
  return new Promise((resolve, reject) => {
    const g = app().globalData;
    if (g.isLogin && g.nickname && g.avatarUrl) return resolve(true);

    // 已登录但资料未补全,直接去补
    if (g.isLogin && (!g.nickname || !g.avatarUrl)) {
      goCompleteProfile();
      return reject(new Error('need_profile'));
    }

    wx.showModal({
      title: '微信登录',
      content: reason || '授权登录后，可解锁每日专属备考壁纸 与 完整的树洞对话历史',
      confirmText: '一键登录',
      cancelText: '稍后再说',
      confirmColor: '#D4572A',
      success(res) {
        if (!res.confirm) return reject(new Error('cancelled'));
        login().then(profile => {
          // 缺资料 → 跳 profile-edit
          if (!profile.nickname || !profile.avatarUrl) {
            goCompleteProfile();
            // 视为登录完成,但 caller 不要继续后续操作
            return reject(new Error('need_profile'));
          }
          resolve(profile);
        }).catch(reject);
      },
      fail: reject
    });
  });
}

function goCompleteProfile() {
  wx.navigateTo({
    url: '/pages/profile-edit/profile-edit?firstTime=1'
  });
}

function login() {
  return new Promise((resolve, reject) => {
    wx.showLoading({ title: '登录中...', mask: true });
    wx.cloud.callFunction({
      name: 'user_profile',
      data: { action: 'login' }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 0) {
        const profile = res.result.data || {};
        const g = app().globalData;
        g.openid = profile.openid;
        g.isLogin = true;
        if (profile.nickname) g.nickname = profile.nickname;
        if (profile.avatarUrl) g.avatarUrl = profile.avatarUrl;
        if (profile.dreamSchool) g.dreamSchool = profile.dreamSchool;
        if (profile.province) g.province = profile.province;
        if (profile.grade) g.grade = profile.grade;
        app().persist();
        resolve(profile);
      } else {
        reject(new Error('login_fail'));
      }
    }).catch(err => {
      wx.hideLoading();
      reject(err);
    });
  });
}

module.exports = { ensureLogin, login, goCompleteProfile };
