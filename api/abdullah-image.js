// Vercel Serverless Function: image generation/editing for Abdullah's voice
// call mode. Powered by Gemini's image-generation model (server-side owner
// key, GEMINI_API_KEY) - the only provider that can output images.
// Private single-owner app: no usage limits.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { prompt, editImageBase64, editMimeType } = body;
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    const parts = [];
    if (editImageBase64) {
      parts.push({ text: 'Edit this image as follows: ' + String(prompt).slice(0, 500) + '. Keep everything else about the image the same unless the instruction says otherwise. Output a single image.' });
      parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
    } else {
      parts.push({ text: 'Generate a single high-quality, photorealistic or artistic image (whichever fits best) of: ' + String(prompt).slice(0, 500) + '.' });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + apiKey;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة، حاول توصيف مختلف.' });
      return;
    }

    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
    });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
