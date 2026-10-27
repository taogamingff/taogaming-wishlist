const {
  callUpstream, extractIds, toSafeString,
  setCors, getBody
} = require('./_utils');

const WISHLIST_CANDIDATES = [
  '/get-wishlist', '/get-wish', '/wishlist', '/list-wish',
  '/api/wishlist', '/api/get-wishlist', '/api/get-wish',
  '/user/wishlist', '/me/wishlist', '/get'
];

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Dùng POST' });
  }

  const body = getBody(req);
  const token = (body.token || '').toString().trim();
  const uid = (body.uid || '').toString().trim();
  const password = (body.password || '').toString().trim();
  const customEndpoint = (body.customEndpoint || '').toString().trim();

  let auth;
  if (token) auth = { token };
  else if (uid && password) auth = { uid, password };
  else return res.status(400).json({ success: false, error: 'Cần token hoặc (uid + password)' });

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
