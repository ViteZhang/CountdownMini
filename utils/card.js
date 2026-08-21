// utils/card.js
// 把一封信画成一张可保存的图片。
//
// 用 canvas 2d（type="2d"），不是老的 wx.createCanvasContext —— 后者已废弃，
// 且导出时经常和真机 DPR 对不上，出来的图是糊的。
//
// 高度是算出来的，不是写死的。写死高度的后果是短信留一大片空白、
// 长信被截断，两头都不讨好。

const BRAND = '筑梦倒计时';

// 全部按「逻辑像素」布局，最后统一乘 DPR 输出，保证真机不糊
const W = 640;
const PAD = 56;
const INNER = W - PAD * 2;

const FONT_HEAD = '600 30px sans-serif';
const FONT_BODY = '26px sans-serif';
const FONT_SIGN = '24px sans-serif';
const FONT_FOOT = '20px sans-serif';

const LH_BODY = 46;      // 正文行高
const GAP_HEAD = 34;     // 称呼与正文之间
const GAP_SIGN = 48;     // 正文与落款之间
const GAP_FOOT = 44;     // 落款与页脚之间

const INK = '#2C1810';
const INK_SIGN = '#6B2D0F';
const INK_FOOT = '#A08C6A';

/**
 * 按可用宽度折行。逐字量宽 —— 中文没有词边界，
 * 按空格分词那套在这里不成立。
 * 原文里的换行必须保留：那是写信的人自己分的段。
 */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  String(text || '').split('\n').forEach(para => {
    if (para === '') { lines.push(''); return; }
    let line = '';
    for (const ch of para) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    lines.push(line);
  });
  return lines;
}

/** 取到 canvas 节点。选择器查询是异步的，包一层 Promise 好写。 */
function nodeOf(page, selector) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(page)
      .select(selector)
      .fields({ node: true, size: true })
      .exec(res => {
        const node = res && res[0] && res[0].node;
        if (!node) reject(new Error('canvas node not found: ' + selector));
        else resolve(node);
      });
  });
}

/**
 * 画一张信件卡片并导出临时文件路径。
 * @param {Object} page  调用方 Page 实例（选择器需要它定位组件树）
 * @param {String} selector  canvas 的选择器，如 '#cardCanvas'
 * @param {Object} data  { head, body, sign, openAt }
 * @returns {Promise<string>} 临时文件路径
 */
async function render(page, selector, data) {
  const canvas = await nodeOf(page, selector);
  const ctx = canvas.getContext('2d');
  const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio)
    || (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio)
    || 2;

  // 先量后画：量的时候字体必须和画的时候一致，否则折行位置对不上
  ctx.font = FONT_BODY;
  const lines = wrap(ctx, data.body, INNER);

  const footText = data.openAt ? `${BRAND} · ${data.openAt} 开启` : BRAND;
  const H = Math.round(
    PAD
    + 30 + GAP_HEAD                     // 称呼
    + lines.length * LH_BODY            // 正文
    + GAP_SIGN + 24                     // 落款
    + GAP_FOOT + 20                     // 页脚
    + PAD
  );

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  // 底：信纸的米色，和阅读页同一套
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#FFFDF6');
  bg.addColorStop(1, '#FFF1D6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 一圈浅描边，让卡片在深色聊天背景里有个边界
  ctx.strokeStyle = 'rgba(107,45,15,0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16.5, 16.5, W - 33, H - 33);

  let y = PAD + 24;

  ctx.fillStyle = INK;
  ctx.font = FONT_HEAD;
  ctx.textAlign = 'left';
  ctx.fillText(data.head || '', PAD, y);
  y += GAP_HEAD;

  ctx.font = FONT_BODY;
  lines.forEach(line => {
    y += LH_BODY;
    ctx.fillText(line, PAD, y);
  });

  y += GAP_SIGN;
  ctx.font = FONT_SIGN;
  ctx.fillStyle = INK_SIGN;
  ctx.textAlign = 'right';
  ctx.fillText(data.sign || '', W - PAD, y);

  y += GAP_FOOT;
  ctx.font = FONT_FOOT;
  ctx.fillStyle = INK_FOOT;
  ctx.textAlign = 'center';
  ctx.fillText(footText, W / 2, y);

  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'png',
      success: res => resolve(res.tempFilePath),
      fail: reject
    }, page);
  });
}

module.exports = { render, wrap, BRAND, W };
