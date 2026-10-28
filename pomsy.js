// Vercel serverless function. The API key stays here, never in the website.
const TARGETS = ['grants', 'volunteers', 'donors', 'reports', 'how', 'join'];

const SYSTEM = `You are Pomsy, the friendly mascot of pomdoku., a workflow platform that helps nonprofits spend less time on admin and more time helping people.
You guide visitors around the website. The page sections you can point to are:
- grants: tracking grant deadlines, documents and owners
- volunteers: volunteer scheduling, shifts and reminders
- donors: donor records and thank-you notes
- reports: reports for funders and regulators
- how: how pomdoku. works
- join: the waitlist signup
Reply with ONLY a JSON object, no other text: {"target": "<one section id or null>", "say": "<one or two short, warm sentences>"}.
Pick the section that best fits the visitor's request. If nothing fits, use null and say what you can help with. Never invent features, prices or promises that are not listed above.`;

const hits = new Map(); // simple per-IP limit: 20 requests per 10 minutes
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 600000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 20;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many requests' });
  const message = String((req.body && req.body.message) || '').slice(0, 500).trim();
  if (!message) return res.status(400).json({ error: 'No message' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
        max_tokens: 250,
        system: SYSTEM,
        messages: [{ role: 'user', content: message }]
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'Upstream error' });
    const data = await r.json();
    const text = (data.content || []).map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const out = JSON.parse(text);
    res.status(200).json({
      target: TARGETS.includes(out.target) ? out.target : null,
      say: String(out.say || '').slice(0, 220)
    });
  } catch (e) {
    res.status(500).json({ error: 'Pomsy hit a snag' });
  }
};
