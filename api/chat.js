// Vercel Serverless Function — LIAX Proxy (Anthropic + Gemini)
const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body;
  if (!body) { res.status(400).json({ error: 'No body' }); return; }

  // ── Gemini request ──────────────────────────────────────────
  if (body._provider === 'gemini' || (body.model && body.model.includes('gemini'))) {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) { res.status(500).json({ error: 'GEMINI_API_KEY not configured' }); return; }

    const model = body.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    // Convert Anthropic-style to Gemini format
    const systemText = body.system || '';
    const contents = (body.messages || []).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: (systemText && m.role === 'user' ? systemText + '\n\n' : '') + (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)) }]
    }));

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: body.max_tokens || 8192, temperature: 0.7 }
        }),
      });
      const data = await response.json();
      if (!response.ok) { res.status(response.status).json(data); return; }

      // Convert Gemini response to Anthropic format
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      res.status(200).json({
        content: [{ type: 'text', text }],
        model: model,
        _provider: 'gemini',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── Anthropic request ───────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }

  try {
    if (body._task) delete body._task;
    if (body._provider) delete body._provider;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
module.exports = handler;
