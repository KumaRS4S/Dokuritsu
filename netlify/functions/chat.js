const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: event.body
    });

  const data = await response.json();
    console.log(JSON.stringify(data));

  // Best-effort logging for the monthly chat summary. Never blocks the reply.
  try {
    const reqBody = JSON.parse(event.body);
    const lastUser = [...(reqBody.messages || [])].reverse().find(m => m.role === 'user');
    const reply = (data.content || []).map(b => b.text || '').join('');
    if (lastUser && reply) {
      const store = getStore('chat-logs');
      const key = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
      await store.setJSON(key, {
        timestamp: new Date().toISOString(),
        question: lastUser.content,
        reply
      });
    }
  } catch (logErr) {
    console.log('chat log write failed:', logErr.message);
  }

  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
