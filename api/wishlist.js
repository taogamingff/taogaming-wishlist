const utils = require('./_utils.js');

const WISHLIST_CANDIDATES = [
  '/get-wishlist', '/get-wish', '/wishlist', '/list-wish',
  '/api/wishlist', '/api/get-wishlist', '/api/get-wish',
  '/user/wishlist', '/me/wishlist', '/get'
];

module.exports = async function handler(req, res) {
  utils.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Dùng POST' });
  }

  const body = utils.getBody(req);
  const token = String(body.token || '').trim();
  const uid = String(body.uid || '').trim();
  const password = String(body.password || '').trim();
  const customEndpoint = String(body.customEndpoint || '').trim();

  let auth;
  if (token) {
    auth = { token: token };
  } else if (uid && password) {
    auth = { uid: uid, password: password };
  } else {
    return res.status(400).json({ success: false, error: 'Cần token hoặc (uid + password)' });
  }

  const attempts = [];
  if (customEndpoint) attempts.push(customEndpoint);
  for (let i = 0; i < WISHLIST_CANDIDATES.length; i++) attempts.push(WISHLIST_CANDIDATES[i]);

  const results = [];

  for (let i = 0; i < attempts.length; i++) {
    const pathname = attempts[i];
    const r = await utils.callUpstream(pathname, auth, 'GET');
    results.push({ path: pathname, status: r.status, ok: r.ok });

    if (r.ok) {
      const ids = utils.extractIds(r.data);
      if (ids !== null) {
        return res.json({
          success: true,
          via: pathname,
          items: ids,
          count: ids.length,
          attempts: results
        });
      }
    }
  }

  return res.status(404).json({
    success: false,
    error: 'Không tìm thấy endpoint wishlist nào',
    attempts: results
  });
};
