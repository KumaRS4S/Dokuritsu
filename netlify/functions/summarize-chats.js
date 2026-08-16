const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
const store = getStore('chat-logs');
const { blobs } = await store.list();

if (!blobs.length) {
console.log('No chat logs to summarize this run.');
return { statusCode: 200 };
}

const entries = [];
for (const b of blobs) {
const entry = await store.get(b.key, { type: 'json' });
if (entry) entries.push(entry);
}
entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

const transcript = entries
.map(e => `Q: ${e.question}\nA: ${e.reply}`)
.join('\n\n')
.slice(0, 100000);

const monthLabel = new Date().toISOString().slice(0, 7);
const summaryPrompt = `Below are ${entries.length} visitor conversations with the AI chat widget on a Japan driving-tour company's website. Summarize them for the business owner: recurring themes or questions, any notable or unusual requests, and anything suggesting a missed booking opportunity or a gap in the website's info. Keep it tight and skimmable, short sections, no fluff.\n\n${transcript}`;

let summaryText = '';
try {
const res = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-api-key': process.env.ANTHROPIC_API_KEY,
'anthropic-version': '2023-06-01'
},
body: JSON.stringify({
model: 'claude-sonnet-4-5',
max_tokens: 1200,
messages: [{ role: 'user', content: summaryPrompt }]
})
});
const data = await res.json();
summaryText = (data.content || []).map(b => b.text || '').join('');
} catch (err) {
console.log('summary generation failed:', err.message);
return { statusCode: 500 };
}

if (!summaryText) {
console.log('Empty summary, skipping delivery and delete.');
return { statusCode: 200 };
}

// Archive the summary permanently (small text, kept indefinitely)
const summaryStore = getStore('chat-summaries');
await summaryStore.setJSON(monthLabel, {
month: monthLabel,
conversationCount: entries.length,
summary: summaryText,
generatedAt: new Date().toISOString()
});

// Email it out via the site's existing Netlify Forms notification pipeline
try {
const siteUrl = process.env.URL || 'https://dokuritsutours.com';
await fetch(siteUrl + '/', {
method: 'POST',
headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
body: new URLSearchParams({
'form-name': 'chat-digest',
month: monthLabel,
summary: `${entries.length} conversations this period.\n\n${summaryText}`
}).toString()
});
} catch (err) {
console.log('digest form submit failed:', err.message);
}

// Auto-delete the raw entries now that they're summarized and archived
for (const b of blobs) {
await store.delete(b.key);
}

console.log(`Summarized and cleared ${entries.length} chat logs for ${monthLabel}.`);
return { statusCode: 200 };
};
