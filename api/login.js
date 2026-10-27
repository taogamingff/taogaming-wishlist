const {
  callUpstream, extractToken, toSafeString,
  setCors, getBody
} = require('./_utils');

const LOGIN_CANDIDATES = [
  '/login', '/api/login', '/auth', '/api/auth',
  '/token', '/api/token', '/signin', '/api/signin',
  '/user/login', '/api/user/login'
];

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Dùng POST' });
  }

  const body = getBody(req);
  const uid = (body.uid || '').toString().trim();
  const password = (body.password || '').toString().trim();
  const customEndpoint = (body.customEndpoint || '').toString().trim();

  if (!uid || !password) {
    return res.status(400).json({ success: false, error: 'Thiếu uid hoặc password' });
  }

  const attempts = [];
  if (customEndpoint) attempts.push(customEndpoint);
  attempts.push(...LOGIN_CANDIDATES);

  const results = [];

  for (const pathname of attempts) {
    // GET
    let r = await callUpstream(pathname, { uid, password }, 'GET');
    results.push({ path: pathname, method: 'GET', status: r.status, ok: r.ok });
    if (r.ok) {
      const token = extractToken(r.data);
      if (token) {
        return res.json({
          success: true,
          token,
          via: `GET ${pathname}`,
          attempts: results
        });
      }
    }

    // POST
    r = await callUpstream(pathname, {}, 'POST', { uid, password });
    results.push({ path: pathname, method: 'POST', status: r.status, ok: r.ok });
    if (r.ok) {
      const token = extractToken(r.data);
      if (token) {
        return res.json({
          success: true,
          token,
          via: `POST ${pathname}`,
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
