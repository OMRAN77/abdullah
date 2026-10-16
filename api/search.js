// Vercel Serverless Function: live internet search via Tavily's API, using the
// owner's own server-side API key (TAVILY_API_KEY env var). Used by Abdullah
// to answer questions that need real-time information.
const checkAccess = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!checkAccess(req, res)) return;

  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing TAVILY_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
    }
    const query = (body && body.query || '').toString().trim();
    if (!query) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }

    const tavilyResp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
    });

    if (!tavilyResp.ok) {
      const errText = await tavilyResp.text().catch(() => '');
      res.status(502).json({ error: 'Search provider error', detail: errText });
      return;
    }

    const data = await tavilyResp.json();
    const results = Array.isArray(data.results) ? data.results.slice(0, 5).map(r => ({
      title: r.title,
      url: r.url,
      content: (r.content || '').slice(0, 500),
    })) : [];

    res.status(200).json({ answer: data.answer || '', results });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
