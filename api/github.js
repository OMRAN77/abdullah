// Vercel Serverless Function: read-only window into the owner's GitHub
// (account OMRAN77) for Abdullah's voice calls, plus one safe write action:
// recording a task for the coding agent as a GitHub Issue. No merge, push,
// delete or settings access exists here by design. Uses the server-side
// GITHUB_TOKEN env var (fine-grained, owner-scoped) — never sent to the browser.
const checkAccess = require('./_auth');

const OWNER = 'OMRAN77';
const API = 'https://api.github.com';
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

function clip(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n) + ' …[truncated]' : s;
}

function when(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso)) + ' (Dubai)';
  } catch (e) { return iso; }
}

function makeGh(token) {
  return async function gh(path, opts) {
    const resp = await fetch(API + path, {
      method: (opts && opts.method) || 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'abdullah-assistant',
        ...(opts && opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!resp.ok) {
      const err = new Error((data && data.message) || ('GitHub HTTP ' + resp.status));
      err.status = resp.status;
      throw err;
    }
    return data;
  };
}

function repoName(v) {
  const r = String(v || '').trim().replace(/^OMRAN77\//i, '');
  if (!REPO_RE.test(r)) {
    const e = new Error('Unknown or missing repo name. Call action "overview" first to get the exact repo names.');
    e.status = 400;
    throw e;
  }
  return r;
}

async function ciForSha(gh, repo, sha) {
  const out = {};
  try {
    const runs = await gh(`/repos/${OWNER}/${repo}/actions/runs?head_sha=${sha}&per_page=10`);
    out.ci = (runs.workflow_runs || []).map(r => ({ name: r.name, status: r.status, result: r.conclusion || 'running' }));
    if (!out.ci.length) out.ci = 'no CI workflow ran on this commit';
  } catch (e) { out.ci = 'unavailable: ' + e.message; }
  try {
    const st = await gh(`/repos/${OWNER}/${repo}/commits/${sha}/status`);
    out.deploy_and_checks = (st.statuses || []).slice(0, 6).map(s => ({ name: s.context, state: s.state, note: clip(s.description, 120) }));
    if (!out.deploy_and_checks.length) delete out.deploy_and_checks;
  } catch (e) { /* optional */ }
  return out;
}

const ACTIONS = {
  async overview(gh) {
    const repos = await gh('/user/repos?per_page=100&sort=pushed&affiliation=owner');
    return {
      account: OWNER,
      repos: (repos || []).slice(0, 40).map(r => ({
        name: r.name,
        about: clip(r.description || '', 140),
        private: !!r.private,
        last_update: when(r.pushed_at),
        open_issues_and_prs: r.open_issues_count,
      })),
    };
  },

  async repo(gh, a) {
    const repo = repoName(a.repo);
    const info = await gh(`/repos/${OWNER}/${repo}`);
    const branch = info.default_branch;
    const [commits, pulls] = await Promise.all([
      gh(`/repos/${OWNER}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=6`),
      gh(`/repos/${OWNER}/${repo}/pulls?state=open&per_page=15&sort=updated&direction=desc`),
    ]);
    const head = commits && commits[0];
    return {
      repo, about: clip(info.description || '', 200), private: !!info.private, branch,
      website: info.homepage || '',
      latest_commits: (commits || []).map(c => ({
        sha: c.sha.slice(0, 8),
        message: clip((c.commit.message || '').split('\n')[0], 160),
        when: when(c.commit.author && c.commit.author.date),
      })),
      latest_commit_checks: head ? await ciForSha(gh, repo, head.sha) : null,
      open_pull_requests: (pulls || []).map(p => ({
        number: p.number, title: clip(p.title, 160), draft: !!p.draft, updated: when(p.updated_at),
      })),
    };
  },

  async pr(gh, a) {
    const repo = repoName(a.repo);
    const n = parseInt(a.number, 10);
    if (!n) { const e = new Error('Missing pull request number'); e.status = 400; throw e; }
    const p = await gh(`/repos/${OWNER}/${repo}/pulls/${n}`);
    return {
      repo, number: n, title: p.title, state: p.merged ? 'merged' : p.state, draft: !!p.draft,
      mergeable: p.mergeable, merge_state: p.mergeable_state,
      opened: when(p.created_at), updated: when(p.updated_at), merged_at: when(p.merged_at),
      files_changed: p.changed_files, additions: p.additions, deletions: p.deletions,
      description: clip(p.body || '', 3000),
      checks: await ciForSha(gh, repo, p.head.sha),
    };
  },

  async issues(gh, a) {
    const repo = repoName(a.repo);
    const list = await gh(`/repos/${OWNER}/${repo}/issues?state=open&per_page=30&sort=updated`);
    return {
      repo,
      open_issues: (list || []).filter(i => !i.pull_request).slice(0, 15).map(i => ({
        number: i.number, title: clip(i.title, 160), updated: when(i.updated_at),
      })),
    };
  },

  async file(gh, a) {
    const repo = repoName(a.repo);
    const path = String(a.path || '').trim().replace(/^\/+/, '');
    const enc = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const data = await gh(`/repos/${OWNER}/${repo}/contents/${enc}`);
    if (Array.isArray(data)) {
      return { repo, folder: path || '/', items: data.slice(0, 100).map(f => (f.type === 'dir' ? f.name + '/' : f.name)) };
    }
    if (data.encoding !== 'base64' || !data.content) return { repo, path, note: 'File too large or not text; size ' + data.size + ' bytes.' };
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    return { repo, path, size_bytes: data.size, content: clip(text, 9000) };
  },

  async search(gh, a) {
    const repo = repoName(a.repo);
    const q = String(a.query || '').trim();
    if (!q) { const e = new Error('Missing search text'); e.status = 400; throw e; }
    const r = await gh(`/search/code?per_page=10&q=${encodeURIComponent(q + ' repo:' + OWNER + '/' + repo)}`);
    return { repo, query: q, total: r.total_count, files: (r.items || []).map(i => i.path) };
  },

  async create_task(gh, a) {
    const repo = repoName(a.repo || 'omran-ai-builder');
    const title = clip(String(a.title || '').trim(), 200);
    if (!title) { const e = new Error('Missing task title'); e.status = 400; throw e; }
    const body = clip(String(a.details || '').trim(), 6000) +
      '\n\n—\nسجّلها عبدالله بطلب عمران (مكالمة صوتية). مهمة لكودي — لا دمج بدون موافقة المالك.';
    const i = await gh(`/repos/${OWNER}/${repo}/issues`, { method: 'POST', body: { title: '[عبدالله] ' + title, body } });
    return { repo, created_issue_number: i.number, title: i.title };
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!checkAccess(req, res)) return;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    res.status(500).json({ ok: false, error: 'Server is missing GITHUB_TOKEN' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const action = String((body && body.action) || 'overview');
  const fn = ACTIONS[action];
  if (!fn) {
    res.status(400).json({ ok: false, error: 'Unknown action. Use one of: ' + Object.keys(ACTIONS).join(', ') });
    return;
  }

  try {
    const data = await fn(makeGh(token), body || {});
    res.status(200).json({ ok: true, action, ...data });
  } catch (e) {
    const status = e.status === 404 ? 404 : (e.status === 400 ? 400 : 502);
    res.status(status).json({ ok: false, action, error: e.message || String(e) });
  }
};

module.exports._test = { ACTIONS, makeGh, repoName };
