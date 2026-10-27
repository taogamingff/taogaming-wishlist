// api/proxy.js — Vercel Serverless Function (Node.js)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { uid, password, action, item_id, items } = req.body;
    if (!uid || !password) return res.status(400).json({ error: 'Missing uid or password' });

    try {
        // BƯỚC 1: Lấy JWT Token từ API trung gian (ví dụ: kaifcodec)
        // Bạn có thể thay bằng endpoint JWT API khác nếu muốn.
        const jwtApiUrl = `https://kaifcodec-freefire-jwt-generator-api.hf.space/api/token?uid=${uid}&password=${password}`;
        const jwtRes = await fetch(jwtApiUrl, { method: 'GET' });
        
        if (!jwtRes.ok) {
            return res.status(502).json({ 
                error: 'Failed to generate JWT token', 
                detail: `JWT API returned ${jwtRes.status}` 
            });
        }
        const jwtData = await jwtRes.json();
        const token = jwtData.token; 
        if (!token) return res.status(502).json({ error: 'No token in JWT response' });

        // BƯỚC 2: Gọi API Wishlist với JWT Token (có retry)
        const TARGET_URL = 'https://clientbp.ppmainecoonghj.com/EhangeWishListItem';
        const payload = { uid, action: action || 'get', item_id: item_id || null, items: items || [] };

        let lastStatus = 503;
        for (let attempt = 1; attempt <= 3; attempt++) {
            const response = await fetch(TARGET_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, // Gửi JWT token
                    'User-Agent': 'GarenaMSDK/4.0.19P10(I2404 ;Android 15;en;US;)',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            lastStatus = response.status;
            if (response.status === 503 && attempt < 3) {
                // Chờ 1s, 2s trước khi thử lại (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); 
                continue;
            }
            const responseText = await response.text();
            let responseData;
            try { responseData = JSON.parse(responseText); } 
            catch { responseData = { raw: responseText }; }
            return res.status(response.status).json(responseData);
        }
        
        // Nếu hết 3 lần vẫn 503
        return res.status(lastStatus).json({ 
            error: 'Server returned 503 after 3 retries. It might be under maintenance or blocking the request.' 
        });

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ error: 'Proxy internal error', details: error.message });
    }
}
