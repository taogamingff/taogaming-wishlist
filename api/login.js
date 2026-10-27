const utils = require('./_utils.js');

const LOGIN_CANDIDATES = [
  '/login', '/api/login', '/auth', '/api/auth',
  '/token', '/api/token', '/signin', '/api/signin',
  '/user/login', '/api/user/login'
];

module.exports = async function handler(req, res) {
  utils.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Dùng POST' });
  }

  const body = utils.getBody(req);
  const uid = String(body.uid || '').trim();
  const password = String(body.password || '').trim();
  const customEndpoint = String(body.customEndpoint || '').trim();

  if (!uid || !password) {
    return res.status(400).json({ success: false, error: 'Thiếu uid hoặc password' });
  }

  const attempts = [];
  if (customEndpoint) attempts.push(customEndpoint);
  for (let i = 0; i < LOGIN_CANDIDATES.length; i++) attempts.push(LOGIN_CANDIDATES[i]);

  const results = [];

  for (let i = 0; i < attempts.length; i++) {
    const pathname = attempts[i];

    // Thử GET
    let r = await utils.callUpstream(pathname, { uid: uid, password: password }, 'GET');
    results.push({ path: pathname, method: 'GET', status: r.status, ok: r.ok });
    if (r.ok) {
      const token = utils.extractToken(r.data);
      if (token) {
        return res.json({
          success: true,
          token: token,
          via: 'GET ' + pathname,
          attempts: results
        });
      }
    }

    // Thử POST
    r = await utils.callUpstream(pathname, {}, 'POST', { uid: uid, password: password });
    results.push({ path: pathname, method: 'POST', status: r.status, ok: r.ok });
    if (r.ok) {
      const token = utils.extractToken(r.data);
      if (token) {
        return res.json({
          success: true,
          token: token,
          via: 'POST ' + pathname,
          attempts: results
        });
      }
    }
  }

  return res.status(404).json({
    success: false,
    error: 'Không tìm thấy endpoint login nào trả JWT',
    attempts: results
  });
};
