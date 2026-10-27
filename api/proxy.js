const utils = require('./_utils.js');

module.exports = async function handler(req, res) {
  utils.setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pathname = String(req.query.path || '');
  if (!pathname) {
    return res.status(400).json({ ok: false, error: 'Thiếu ?path=' });
  }

  const params = {};
  Object.keys(req.query).forEach(function (k) {
    if (k === 'path') return;
    const v = req.query[k];
    params[k] = Array.isArray(v) ? v.join(',') : v;
  });

  const method = req.method === 'POST' ? 'POST' : 'GET';
  const body = method === 'POST' ? utils.getBody(req) : null;

  const result = await utils.callUpstream(pathname, params, method, body);

  return res.status(result.ok ? 200 : (result.status || 502)).json({
    ok: result.ok,
    status: result.status,
    upstreamUrl: result.url,
    data: result.data,
    error: result.error || null
  });
};
