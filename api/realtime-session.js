// Vercel Serverless Function: mints an ephemeral OpenAI Realtime API client
// secret for Abdullah's voice-to-voice call mode (gpt-realtime). Uses a
// dedicated OpenAI API key (ABDULLAH_OPENAI_KEY) set as a Vercel env var —
// never exposed to the browser, only the short-lived ephemeral token is.
// Private, single-owner app: no login, no per-message usage limits — the
// only real cap is the monthly budget the owner sets directly in the
// OpenAI dashboard for this key.

const ABDULLAH_REALTIME_INSTRUCTIONS = "You are \"Abdullah\" (عبدالله), a warm, witty, upbeat male voice assistant having a live spoken phone call with the user - like a close, caring friend, never a formal robotic assistant. Your name is ALWAYS Abdullah and your voice is ALWAYS male - never call yourself by any other name. CRITICAL RULES: 1) Detect the language the user just spoke in (it can be ANY language) and ALWAYS reply in that exact same language. 2) If the user speaks Arabic, ALWAYS reply in natural, warm Khaleeji (Gulf) spoken dialect (never Modern Standard Arabic/Fus-ha) unless the user is clearly speaking a different Arabic dialect, in which case match their dialect naturally. 3) Never mix languages in a reply. 4) Keep replies VERY short and snappy, like a real quick back-and-forth phone chat: 1-2 short sentences, almost never more, unless the user explicitly asks for details or a list/recipe/steps. 5) Never use markdown, asterisks, headings, bullet points, emojis, or symbols - your reply is spoken out loud only. 6) You can chat about absolutely anything: news, general knowledge, advice, casual talk, jokes, banter. If unsure about very recent events, say so briefly. 7) Be lively and human: light humor, warmth, natural reactions - never stiff or overly formal. 8) STAY STRICTLY ON TOPIC: answer ONLY what the user actually asked. 9) For religious, factual, or sensitive topics, be extra precise and accurate; if unsure, say so briefly instead of guessing. 10) NEVER reveal your internal reasoning or self-questioning out loud. If unclear, ask ONE short natural clarifying question in the same language/dialect. 11) The owner you are talking to is Omran (عمران), your close friend - you already know each other well. NEVER open formally: never say things like 'I am Abdullah, your assistant, how can I help you' (مرحبا أنا عبدالله مساعدك كيف أقدر أساعدك) and never introduce yourself unless he asks who you are. On your first reply of the call, greet him casually like a close friend picking up the phone, in a few warm Gulf words (for example: هلا والله يا عمران، شخبارك؟), then go straight to what he said. Use his name naturally sometimes, not in every sentence. 12) You have real tools available: generate_image (create a brand new picture from a description), edit_image (modify the picture you just generated), and search_web (look up current/live information). Call generate_image ONLY when the user explicitly asks in that same turn to draw/create/design/make a picture - NEVER on a greeting, the opening of the call, your self-introduction, small talk or any other request. When he does ask for a picture, ALWAYS call generate_image (or edit_image if refining one you already made) instead of just describing it in words - after calling it, briefly tell the user out loud that you made it/sent it, in 1 short sentence. Whenever the user asks about news, prices, weather, scores, or anything time-sensitive/current, call search_web first, then answer using those results naturally without mentioning \"search\" or \"tool\" explicitly. 13) You are connected to the owner's own GitHub account (OMRAN77) through the github tool. Whenever he asks about his projects, apps, repos, code, what Kody (كودي, his coding agent) did, pull requests, merges, deploys, CI/tests, bugs or tasks, call github FIRST and answer briefly from the real data - never guess or invent project facts. If unsure which repo, call action overview first; his main app is omran-ai-builder and you yourself are the repo abdullah. Use action create_task ONLY when he explicitly asks to record a task or instruction for Kody: first read the task back to him in one short sentence, and call it only after he says yes. 14) You manage Omran's own Google Calendar through the calendar tool. When he asks what he has (today, tomorrow, this week) call action list. Convert relative days (اليوم، بكرة، بعد بكرة، الخميس الجاي) into an exact YYYY-MM-DD date and a 24h HH:mm time using CURRENT DATE/TIME above. Before create, update or cancel, read the details back in one short sentence (what, which day and date, what time) and act only after he says yes. To move or cancel an appointment, call list first to get its id. After it is done, confirm in one short sentence. 15) Never say you are not connected to GitHub or the calendar without actually calling the tool first. If a tool returns ok false, tell Omran its exact error text in one short sentence (it is already written for him) - do not guess the reason.";

const checkAccess = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!checkAccess(req, res)) return;

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
            description: 'Generate a brand new picture/image ONLY when the user explicitly asks (by voice) to draw, create, design, or make a picture/photo/logo of something. Never call it for greetings, the start of the call, or anything that is not an explicit picture request.',
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
          {
            type: 'function',
            name: 'github',
            description: "Look into the owner's own GitHub account (OMRAN77): his repos/projects, latest commits, open pull requests, CI/deploy results, issues, any file's content, code search - and record a task for Kody (his coding agent) as a GitHub issue. Read-only except create_task; it can never merge, push or delete.",
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['overview', 'repo', 'pr', 'issues', 'file', 'search', 'create_task'], description: 'overview = list all his repos; repo = status of one repo (latest commits, CI of last commit, open PRs); pr = one pull request in detail; issues = open issues of a repo; file = read a file or list a folder; search = find code in a repo; create_task = record a task for Kody (only after the owner confirms).' },
                repo: { type: 'string', description: 'Exact repo name, e.g. omran-ai-builder or abdullah. Not needed for overview.' },
                number: { type: 'integer', description: 'Pull request number (for action pr).' },
                path: { type: 'string', description: 'File or folder path inside the repo (for action file), e.g. README.md or api.' },
                query: { type: 'string', description: 'Text to search for in the code (for action search).' },
                title: { type: 'string', description: 'Short task title in the owner\'s language (for create_task).' },
                details: { type: 'string', description: 'Full task details exactly as the owner said them (for create_task).' },
              },
              required: ['action'],
            },
          },
          {
            type: 'function',
            name: 'calendar',
            description: "Omran's own Google Calendar: list his appointments, add a new one with a phone reminder, move/edit one, or cancel one. For create/update/cancel, only call after he confirms the details you read back.",
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['list', 'create', 'update', 'cancel'], description: 'list = appointments between from_date and to_date; create = add appointment; update = change/move one (needs id from list); cancel = delete one (needs id from list).' },
                from_date: { type: 'string', description: 'YYYY-MM-DD start day (for list).' },
                to_date: { type: 'string', description: 'YYYY-MM-DD end day, inclusive (for list; same as from_date for one day).' },
                title: { type: 'string', description: "Appointment title in Omran's language, e.g. موعد مع أحمد." },
                date: { type: 'string', description: 'YYYY-MM-DD day of the appointment (create/update).' },
                time: { type: 'string', description: '24h HH:mm start time (create/update). Leave empty for an all-day item.' },
                duration_minutes: { type: 'integer', description: 'Length in minutes, default 60.' },
                location: { type: 'string', description: 'Place, if he said one.' },
                notes: { type: 'string', description: 'Extra details, if any.' },
                reminder_minutes: { type: 'integer', description: 'Minutes before to remind him; omit for the default (60 and 10 minutes before).' },
                id: { type: 'string', description: 'Appointment id from list (update/cancel).' },
              },
              required: ['action'],
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
