// pages/profile-edit/profile-edit.js
const theme = require('../../utils/theme.js');
const GRADE_LABEL = { G3: '高三', G2: '高二', G1: '高一', REPEAT: '复读' };
const GRADES = ['G3', 'G2', 'G1', 'REPEAT'];

Page({
  data: {
    firstTime: false,
    nickname: '',
    avatarUrl: '',
    grade: 'G3',
    gradeLabel: '高三',
    provinceName: '未设置',
    dreamSchool: '',
    saving: false
  },

  onLoad(options) {
    this.setData({ firstTime: options.firstTime === '1' });
    if (this.data.firstTime) {
      wx.setNavigationBarTitle({ title: '完善资料' });
    }
  },

  onShow() {

    theme.apply(this, false);
    const g = getApp().globalData;
    this.setData({
      nickname: this.data.nickname || g.nickname || '',
      avatarUrl: this.data.avatarUrl || g.avatarUrl || '',
      grade: g.grade || 'G3',
      gradeLabel: GRADE_LABEL[g.grade || 'G3'],
      provinceName: g.province ? g.province.name : '未设置',
      dreamSchool: g.dreamSchool || ''
    });
  },

  // 微信 chooseAvatar:用户主动选择头像后,e.detail.avatarUrl 是临时路径
  onChooseAvatar(e) {
    const tmp = e.detail.avatarUrl;
    if (!tmp) return;
    // 先显示临时路径,让用户看到反馈
    this.setData({ avatarUrl: tmp });

    const openid = getApp().globalData.openid;
    if (!openid) {
      // 未登录态先暂存,save 时再上传
      this._pendingAvatarLocal = tmp;
      return;
    }
    wx.showLoading({ title: '上传中...', mask: true });
    wx.cloud.uploadFile({
      cloudPath: `avatar/${openid}_${Date.now()}.jpg`,
      filePath: tmp,
      success: (res) => {
        wx.hideLoading();
        this.setData({ avatarUrl: res.fileID });
        this._pendingAvatarLocal = null;
      },
      fail: () => {
        wx.hideLoading();
        // 上传失败保留本地路径,save 时重试
        this._pendingAvatarLocal = tmp;
      }
    });
  },

  // 微信 nickname input:在 blur 时取值
  onNickname(e) {
    this.setData({ nickname: (e.detail.value || '').trim() });
  },

  pickGrade() {
    wx.showActionSheet({
      itemList: GRADES.map(g => GRADE_LABEL[g]),
      success: (res) => {
        const g = GRADES[res.tapIndex];
        this.setData({ grade: g, gradeLabel: GRADE_LABEL[g] });
      }
    });
  },

  goProvince() { wx.navigateTo({ url: '/pages/province/province' }); },
  goSchool() { wx.navigateTo({ url: '/pages/school/school' }); },

  async save() {
    if (this.data.saving) return;

    const nickname = (this.data.nickname || '').trim();
    let avatarUrl = this.data.avatarUrl;

    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (!avatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });

    // 若头像还停留在本地临时路径,补一次上传
    if (this._pendingAvatarLocal && avatarUrl === this._pendingAvatarLocal) {
      const openid = getApp().globalData.openid;
      if (openid) {
        try {
          const up = await wx.cloud.uploadFile({
            cloudPath: `avatar/${openid}_${Date.now()}.jpg`,
            filePath: this._pendingAvatarLocal
          });
          avatarUrl = up.fileID;
          this._pendingAvatarLocal = null;
        } catch (e) {
          // 上传失败保留本地路径,仍可保存(微信端可显示)
        }
      }
    }

    const app = getApp();
    app.globalData.nickname = nickname;
    app.globalData.avatarUrl = avatarUrl;
    app.globalData.grade = this.data.grade;
    app.persist();

    try {
      await wx.cloud.callFunction({
        name: 'user_profile',
        data: {
          action: 'update',
          nickname,
          avatarUrl,
          grade: this.data.grade
        }
      });
    } catch (e) {}

    wx.hideLoading();
    this.setData({ saving: false, avatarUrl });
    wx.showToast({ title: '已保存', icon: 'success' });

    setTimeout(() => {
      if (this.data.firstTime) {
        wx.reLaunch({ url: '/pages/home/home' });
      } else {
        wx.navigateBack();
      }
    }, 600);
  }
});
