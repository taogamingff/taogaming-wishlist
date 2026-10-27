/* Helper dùng chung — file bắt đầu bằng _ nên Vercel KHÔNG tạo route */
const API_BASE = 'https://danger-wishlist-manager.vercel.app';

function toSafeString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Error) return v.message || 'Error';
  if (typeof v === 'object') {
    if (typeof v.message === 'string') return v.message;
    if (typeof v.error === 'string') return v.error;
    if (typeof v.msg === 'string') return v.msg;
    try {
      const s = JSON.stringify(v);
      if (s && s !== '{}' && s !== '[]') return s;
    } catch (e) {}
    return 'Lỗi không xác định';
  }
  return String(v);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return req.body;
}

async function callUpstream(pathname, params, method, body) {
  method = method || 'GET';
  const qs = new URLSearchParams(params || {}).toString();
  const url = API_BASE + pathname + (qs ? '?' + qs : '');

  const opts = {
    method,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 WishlistProxy/3.0'
    }
  };
  if (method === 'POST' && body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 12000);
  opts.signal = ctrl.signal;

  try {
    const r = await fetch(url, opts);
    const txt = await r.text();
    clearTimeout(timer);
    let data;
    try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
    return { ok: r.ok, status: r.status, url, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, url, data: null, error: toSafeString(err) };
  }
}

function looksLikeToken(s) {
  if (typeof s !== 'string') return false;
  s = s.trim();
  if (s.length < 15) return false;
  if (/\s/.test(s)) return false;
  return true;
}

function extractToken(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    const jwt = data.match(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
    if (jwt) return jwt[0];
    if (looksLikeToken(data)) return data.trim();
    return null;
  }
  if (typeof data !== 'object') return null;

  const keys = ['token', 'jwt', 'access_token', 'accessToken', 'id_token', 'auth', 'authToken'];
  for (let i = 0; i < keys.length; i++) {
    if (looksLikeToken(data[keys[i]])) return data[keys[i]].trim();
  }
  const nested = ['data', 'result', 'payload', 'user', 'session', 'auth'];
  for (let i = 0; i < nested.length; i++) {
    if (data[nested[i]] && typeof data[nested[i]] === 'object') {
      const t = extractToken(data[nested[i]]);
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

function extractIds(data) {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') {
    const m = data.match(/\d{5,12}/g);
    return m ? Array.from(new Set(m)) : null;
  }

  let arr = null;
  if (Array.isArray(data)) {
    arr = data;
  } else if (typeof data === 'object') {
    const keys = ['items', 'wishlist', 'wish_list', 'wishlist_items',
                  'data', 'list', 'result', 'item_ids', 'itemIds', 'ids'];
    for (let i = 0; i < keys.length; i++) {
      if (Array.isArray(data[keys[i]])) { arr = data[keys[i]]; break; }
    }
    if (!arr) {
      for (let i = 0; i < ['data', 'result', 'payload', 'wishlist'].length; i++) {
        const n = ['data', 'result', 'payload', 'wishlist'][i];
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
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    let v = null;
    if (typeof it === 'string' || typeof it === 'number') {
      v = String(it);
    } else if (it && typeof it === 'object') {
      const cand = it.item_id ?? it.itemId ?? it.itemid ?? it.itemID ?? it.id ?? it.ID ?? it.item;
      if (cand != null) v = String(cand);
    }
    if (v && /^\d{5,12}$/.test(v)) out.add(v);
  }
  return Array.from(out);
}

module.exports = {
  API_BASE: API_BASE,
  toSafeString: toSafeString,
  setCors: setCors,
  getBody: getBody,
  callUpstream: callUpstream,
  extractToken: extractToken,
  extractIds: extractIds
};
