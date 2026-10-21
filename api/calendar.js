// Vercel Serverless Function: Abdullah ↔ the owner's Google Calendar through his
// own Google Apps Script web app (runs as the owner, default calendar only).
// The shared secret (CALENDAR_SECRET env var) never reaches the browser.
const checkAccess = require('./_auth');

const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbzxgioFSYghyCGYYiEbSy3JGQXX1w2QhIAwMD5xDfRVkLLFs56s93i30fhvF9KAlIfnTw/exec';
const ACTIONS = ['list', 'create', 'update', 'cancel'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!checkAccess(req, res)) return;

  const secret = String(process.env.CALENDAR_SECRET || '').trim();
  if (!secret) {
    res.status(500).json({ ok: false, error: 'الرمز CALENDAR_SECRET مب محطوط في Vercel.' });
    return;
  }

  let b = req.body;
  if (!b || typeof b === 'string') {
    try { b = JSON.parse(b || '{}'); } catch (e) { b = {}; }
  }
  const action = String(b.action || '');
  if (!ACTIONS.includes(action)) {
    res.status(400).json({ ok: false, error: 'Unknown action. Use one of: ' + ACTIONS.join(', ') });
    return;
  }
  for (const k of ['from_date', 'to_date', 'date']) {
    if (b[k] != null && b[k] !== '' && !DATE_RE.test(String(b[k]))) {
      res.status(400).json({ ok: false, error: k + ' must be YYYY-MM-DD' });
      return;
    }
  }
  if (b.time != null && b.time !== '' && !TIME_RE.test(String(b.time))) {
    res.status(400).json({ ok: false, error: 'time must be 24h HH:mm' });
    return;
  }
  if (action === 'list' && !b.from_date) {
    res.status(400).json({ ok: false, error: 'from_date is required for list' });
    return;
  }

  const payload = { secret, action };
  for (const k of ['from_date', 'to_date', 'date', 'time', 'duration_minutes', 'title', 'location', 'notes', 'reminder_minutes', 'id']) {
    if (b[k] != null && b[k] !== '') payload[k] = typeof b[k] === 'string' ? b[k].slice(0, 2000) : b[k];
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    // Apps Script answers POST with a redirect; fetch follows it as GET (expected).
    const r = await fetch(process.env.CALENDAR_URL || DEFAULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(t);
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!data) {
      console.error('[calendar] non-JSON from Apps Script', r.status, text.slice(0, 300));
      res.status(502).json({ ok: false, error: 'سكربت التقويم ما رد بشكل صحيح (HTTP ' + r.status + ') — تأكد إن النشر في Apps Script «تطبيق ويب» والوصول «أي شخص».' });
      return;
    }
    if (!data.ok && data.error === 'Unauthorized') {
      console.error('[calendar] secret mismatch');
      res.status(400).json({ ok: false, error: 'الرمز CALENDAR_SECRET في Vercel ما يطابق رمز Apps Script.' });
      return;
    }
    if (!data.ok) console.error('[calendar] script error', data.error);
    res.status(data.ok ? 200 : 400).json(data);
  } catch (e) {
    console.error('[calendar] request failed', e && e.message);
    res.status(504).json({ ok: false, error: 'ما قدرت أوصل لسكربت التقويم: ' + (e && e.message ? e.message : String(e)) });
  }
};
