/* =========================================================
   WISHLIST PROXY SERVER
   - Nhận request từ frontend (localhost:3000)
   - Gọi API thật (danger-wishlist-manager.vercel.app)
   - Trả JSON về, không bị CORS chặn
   ========================================================= */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const API_BASE = 'https://danger-wishlist-manager.vercel.app';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));   // phục vụ index.html

/* =========================================================
   TIỆN ÍCH
   ========================================================= */

/** Bóc JWT từ mọi kiểu response */
function extractToken(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    const jwt = data.match(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
    if (jwt) return jwt[0];
    if (data.length > 15 && !/\s/.test(data.trim())) return data.trim();
    return null;
  }
  if (typeof data !== 'object') return null;

  const keys = ['token', 'jwt', 'access_token', 'accessToken', 'id_token', 'auth', 'authToken'];
  for (const k of keys) {
    if (typeof data[k] === 'string' && data[k].length > 15) return data[k].trim();
  }
  const nested = ['data', 'result', 'payload', 'user', 'session', 'auth'];
  for (const n of nested) {
    if (data[n] && typeof data[n] === 'object') {
      const t = extractToken(data[n]);
      if (t) return t;
    }
  }
  for (const k in data) {
    if (typeof data[k] === 'string') {
      const jw = data[k].match(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
      if (jw) return jw[0];
    }
  }
  return null;
}

/** Bóc mảng item_id từ mọi kiểu response */
function extractIds(data) {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') {
    const m = data.match(/\d{5,12}/g);
    return m ? [...new Set(m)] : null;
  }

  let arr = null;
  if (Array.isArray(data)) {
    arr = data;
  } else if (typeof data === 'object') {
    const keys = ['items', 'wishlist', 'wish_list', 'wishlist_items',
                  'data', 'list', 'result', 'item_ids', 'itemIds', 'ids'];
    for (const k of keys) {
      if (Array.isArray(data[k])) { arr = data[k]; break; }
    }
    if (!arr) {
      for (const n of ['data', 'result', 'payload', 'wishlist']) {
        if (data[n]) {
          const t = extractIds(data[n]);
          if (t) return t;
        }
      }
    }
    if (!arr) return null;
  }
  if (!arr) return null;

  const out = new Set();
  for (const it of arr) {
    let v = null;
    if (typeof it === 'string' || typeof it === 'number') v = String(it);
    else if (it && typeof it === 'object') {
      v = String(it.item_id ?? it.itemId ?? it.itemid ?? it.itemID ?? it.id ?? it.ID ?? it.item ?? '');
    }
    if (v && /^\d{5,12}$/.test(v)) out.add(v);
  }
  return [...out];
}

/** Gọi API thật (server-side, không bị CORS) */
async function callUpstream(pathname, params, method = 'GET', body = null) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${API_BASE}${pathname}${qs ? '?' + qs : ''}`;

  const opts = {
    method,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 WishlistProxy/1.0'
    }
  };
  if (method === 'POST' && body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  opts.signal = controller.signal;

  try {
    const res  = await fetch(url, opts);
    const text = await res.text();
    clearTimeout(timer);

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return { ok: res.ok, status: res.status, url, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, url, data: null, error: err.message };
  }
}

/* =========================================================
   API 1: /proxy  — proxy tổng quát
   VD: /proxy?path=/add-wish&token=xxx&item_ids=1,2,3
   ========================================================= */

app.all('/proxy', async (req, res) => {
  const pathname = req.query.path;
  if (!pathname) return res.status(400).json({ error: 'Thiếu tham số ?path=' });

  const params = { ...req.query };
  delete params.path;

  const method = req.method === 'POST' ? 'POST' : 'GET';
  const body   = method === 'POST' ? req.body : null;

  const result = await callUpstream(pathname, params, method, body);

  res.status(result.ok ? 200 : (result.status || 502)).json({
    ok: result.ok,
    status: result.status,
    upstreamUrl: result.url,
    data: result.data,
    error: result.error || null
  });
});

/* =========================================================
   API 2: /api/login — tự dò endpoint login để lấy JWT
   POST { uid, password, customEndpoint? }
   ========================================================= */

const LOGIN_CANDIDATES = [
  '/login', '/api/login', '/auth', '/api/auth',
  '/token', '/api/token', '/signin', '/api/signin',
  '/user/login', '/api/user/login'
];

app.post('/api/login', async (req, res) => {
  const { uid, password, customEndpoint } = req.body || {};
  if (!uid || !password) {
    return res.status(400).json({ error: 'Thiếu uid hoặc password' });
  }

  const attempts = [];
  if (customEndpoint) attempts.push(customEndpoint);
  attempts.push(...LOGIN_CANDIDATES);

  const results = [];

  for (const pathname of attempts) {
    // Thử GET trước
    let r = await callUpstream(pathname, { uid, password }, 'GET');
    results.push({ path: pathname, method: 'GET', status: r.status });

    if (r.ok) {
      const token = extractToken(r.data);
      if (token) {
        return res.json({
          success: true,
          token,
          via: `GET ${pathname}`,
          raw: r.data,
          attempts: results
        });
      }
    }

    // Thử POST nếu GET không được
    r = await callUpstream(pathname, {}, 'POST', { uid, password });
    results.push({ path: pathname, method: 'POST', status: r.status });

    if (r.ok) {
      const token = extractToken(r.data);
      if (token) {
        return res.json({
          success: true,
          token,
          via: `POST ${pathname}`,
          raw: r.data,
          attempts: results
        });
      }
    }
  }

  res.status(404).json({
    success: false,
    error: 'Không tìm thấy endpoint login nào trả JWT',
    attempts: results
  });
});

/* =========================================================
   API 3: /api/wishlist — tự dò endpoint lấy wishlist
   POST { token?, uid?, password?, customEndpoint? }
   ========================================================= */

const WISHLIST_CANDIDATES = [
  '/get-wishlist', '/get-wish', '/wishlist', '/list-wish',
  '/api/wishlist', '/api/get-wishlist', '/api/get-wish',
  '/user/wishlist', '/me/wishlist', '/get'
];

app.post('/api/wishlist', async (req, res) => {
  const { token, uid, password, customEndpoint } = req.body || {};

  let auth;
  if (token) auth = { token };
  else if (uid && password) auth = { uid, password };
  else return res.status(400).json({ error: 'Cần token hoặc (uid + password)' });

  const attempts = [];
  if (customEndpoint) attempts.push(customEndpoint);
  attempts.push(...WISHLIST_CANDIDATES);

  const results = [];

  for (const pathname of attempts) {
    const r = await callUpstream(pathname, auth, 'GET');
    results.push({ path: pathname, status: r.status, ok: r.ok });

    if (r.ok) {
      const ids = extractIds(r.data);
      if (ids !== null) {
        return res.json({
          success: true,
          via: pathname,
          items: ids,
          count: ids.length,
          raw: r.data,
          attempts: results
        });
      }
    }
  }

  res.status(404).json({
    success: false,
    error: 'Không tìm thấy endpoint wishlist nào',
    attempts: results
  });
});

/* =========================================================
   API 4: /api/health — kiểm tra server sống
   ========================================================= */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    server: 'wishlist-proxy',
    version: '1.0.0',
    upstream: API_BASE,
    time: new Date().toISOString()
  });
});

/* =========================================================
   START
   ========================================================= */

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ✅ WISHLIST PROXY ĐANG CHẠY                 ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🌐 Mở trình duyệt: http://localhost:${PORT}   ║`);
  console.log(`║  📡 Upstream: ${API_BASE.slice(0, 30)}...  ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
