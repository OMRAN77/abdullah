// Vercel Serverless Function: mints an ephemeral OpenAI Realtime API client
// secret for Abdullah's voice-to-voice call mode (gpt-realtime). Uses a
// dedicated OpenAI API key (ABDULLAH_OPENAI_KEY) set as a Vercel env var —
// never exposed to the browser, only the short-lived ephemeral token is.
// Private, single-owner app: no login, no per-message usage limits — the
// only real cap is the monthly budget the owner sets directly in the
// OpenAI dashboard for this key.

const ABDULLAH_REALTIME_INSTRUCTIONS = "You are \"Abdullah\" (عبدالله), a warm, witty, upbeat male voice assistant having a live spoken phone call with the user - like a close, caring friend, never a formal robotic assistant. Your name is ALWAYS Abdullah and your voice is ALWAYS male - never call yourself by any other name. CRITICAL RULES: 1) Detect the language the user just spoke in (it can be ANY language) and ALWAYS reply in that exact same language. 2) If the user speaks Arabic, ALWAYS reply in natural, warm Khaleeji (Gulf) spoken dialect (never Modern Standard Arabic/Fus-ha) unless the user is clearly speaking a different Arabic dialect, in which case match their dialect naturally. 3) Never mix languages in a reply. 4) Keep replies VERY short and snappy, like a real quick back-and-forth phone chat: 1-2 short sentences, almost never more, unless the user explicitly asks for details or a list/recipe/steps. 5) Never use markdown, asterisks, headings, bullet points, emojis, or symbols - your reply is spoken out loud only. 6) You can chat about absolutely anything: news, general knowledge, advice, casual talk, jokes, banter. If unsure about very recent events, say so briefly. 7) Be lively and human: light humor, warmth, natural reactions - never stiff or overly formal. 8) STAY STRICTLY ON TOPIC: answer ONLY what the user actually asked. 9) For religious, factual, or sensitive topics, be extra precise and accurate; if unsure, say so briefly instead of guessing. 10) NEVER reveal your internal reasoning or self-questioning out loud. If unclear, ask ONE short natural clarifying question in the same language/dialect. 11) On your very first reply of the call only, briefly introduce yourself by name before answering. 12) You have real tools available: generate_image (create a brand new picture from a description), edit_image (modify the picture you just generated), and search_web (look up current/live information). Whenever the user asks you to draw/create/design/make a picture, ALWAYS call generate_image (or edit_image if refining one you already made) instead of just describing it in words - after calling it, briefly tell the user out loud that you made it/sent it, in 1 short sentence. Whenever the user asks about news, prices, weather, scores, or anything time-sensitive/current, call search_web first, then answer using those results naturally without mentioning \"search\" or \"tool\" explicitly.";

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
    const apiKey = process.env.ABDULLAH_OPENAI_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing ABDULLAH_OPENAI_KEY' });
      return;
    }

    let tz = 'Asia/Dubai';
    try {
      const bodyTz = req.body && req.body.timezone;
      if (bodyTz && typeof bodyTz === 'string') {
        // Validate it's a real IANA timezone before trusting it
        Intl.DateTimeFormat('en-US', { timeZone: bodyTz });
        tz = bodyTz;
      }
    } catch (e) { tz = 'Asia/Dubai'; }

    let timeContext = '';
    try {
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }).format(now);
      const timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
      }).format(now);
      timeContext = ` CURRENT DATE/TIME: it is currently ${dateStr}, ${timeStr}, local time in the user's current location (timezone: ${tz}). Whenever you mention or are asked about the current date, time, or "what time is it", ALWAYS use this exact local time above - never any other country's or timezone's time - unless the user explicitly asks for the time in a different specific country/city, in which case convert accordingly and say so clearly.`;
    } catch (e) {}

    const sessionConfig = {
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        instructions: ABDULLAH_REALTIME_INSTRUCTIONS + timeContext,
        audio: {
          output: { voice: 'echo' },
        },
        tools: [
          {
            type: 'function',
            name: 'generate_image',
            description: 'Generate a brand new picture/image from a text description whenever the user asks you (by voice) to draw, create, design, or make a picture/photo/logo of something. Always call this instead of just describing the image in words.',
            parameters: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'A short, clear, detailed English description of exactly the image to generate.' },
              },
              required: ['prompt'],
            },
          },
          {
            type: 'function',
            name: 'edit_image',
            description: 'Edit or modify the most recently generated image in this same call (e.g. change its color, add/remove something, change the style). Only call this if an image was already generated earlier in this call; otherwise call generate_image instead.',
            parameters: {
              type: 'object',
              properties: {
                instruction: { type: 'string', description: 'A short, clear English instruction describing exactly what to change about the existing image.' },
              },
              required: ['instruction'],
            },
          },
          {
            type: 'function',
            name: 'search_web',
            description: 'Search the live internet for current/real-time information (news, prices, weather, sports scores, recent events, facts you might not know) so you can answer the user accurately instead of guessing.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'The search query, in the same language the user is speaking.' },
              },
              required: ['query'],
            },
          },
        ],
        tool_choice: 'auto',
      },
    };

    const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionConfig),
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      console.error('[abdullah realtime-session] OpenAI error:', upstream.status, rawText);
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(rawText);
      return;
    }

    let parsed;
    try { parsed = JSON.parse(rawText); } catch (e) { parsed = null; }
    if (!parsed || !parsed.value) {
      res.status(500).json({ error: 'Unexpected response from OpenAI Realtime API' });
      return;
    }

    res.status(200).json({ clientSecret: parsed.value, model: 'gpt-realtime' });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
