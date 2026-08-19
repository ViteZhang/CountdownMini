// cloudfunctions/safety_check/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  try {
    await db.collection('safety_events').add({
      data: {
        _openid: OPENID,
        session_id: event.session_id || '',
        trigger_type: event.trigger_type || 'CLIENT',
        trigger_content: event.content || '',
        reviewed: false,
        createdAt: new Date()
      }
    });
  } catch (e) {
    console.error('[safety_check]', e);
  }
  return ok({ logged: true });
};
