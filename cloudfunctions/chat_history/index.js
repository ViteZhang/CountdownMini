// cloudfunctions/chat_history/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function ok(data) { return { code: 0, data }; }

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return ok({ list: [] });

  const action = event.action || 'list';

  if (action === 'list') {
    try {
      const r = await db.collection('chat_sessions')
        .where({ _openid: OPENID })
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();
      return ok({
        list: r.data.map(s => ({
          id: s.session_id,
          date: s.date,
          message_count: s.message_count || 0,
          risk_level: s.risk_level || 'NORMAL',
          preview: s.preview || '',
          created_at: s.createdAt
        }))
      });
    } catch (e) {
      return ok({ list: [] });
    }
  }

  if (action === 'detail') {
    try {
      const session_id = event.session_id;
      const r = await db.collection('chat_messages')
        .where({ _openid: OPENID, session_id })
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get();
      return ok({
        messages: r.data.map(m => ({
          id: m._id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          feedback: m.feedback
        }))
      });
    } catch (e) {
      return ok({ messages: [] });
    }
  }

  return ok({});
};
