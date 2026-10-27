// api/proxy.js — Vercel Serverless Function (Node.js)
export default async function handler(req, res) {
    // 1. Thiết lập CORS headers cho phép mọi nguồn gọi đến
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Xử lý preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Chỉ chấp nhận phương thức POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { uid, password, action, item_id, items } = req.body;

        // Kiểm tra dữ liệu đầu vào tối thiểu
        if (!uid || !password) {
            return res.status(400).json({ error: 'Missing uid or password' });
        }

        // 2. Endpoint API gốc
        const TARGET_URL = 'https://clientbp.ppmainecoonghj.com/EhangeWishListItem';

        // 3. Chuẩn bị body gửi đến API gốc
        //    (Cấu trúc này có thể cần điều chỉnh tùy theo yêu cầu thực tế của server)
        const payload = {
            uid: uid,
            password: password,
            action: action || 'get',
            item_id: item_id || null,
            items: items || []
        };

        // 4. Gọi API gốc với các header cần thiết
        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Header quan trọng giúp vượt qua firewall của Free Fire
                'User-Agent': 'GarenaMSDK/4.0.19P10(I2404 ;Android 15;en;US;)',
                'Accept': 'application/json',
                'X-Unity-Version': '2018.4.11f1', // Có thể cần thiết
                // Nếu bạn có token JWT, có thể thêm vào đây:
                // 'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        // 5. Lấy dữ liệu trả về (dạng text để an toàn, sau đó thử parse JSON)
        const responseText = await response.text();
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = { raw: responseText };
        }

        // 6. Trả kết quả về cho client (kèm status code gốc)
        return res.status(response.status).json(responseData);

    } catch (error) {
        // Xử lý lỗi kết nối (ví dụ: timeout, DNS)
        console.error('Proxy error:', error);
        return res.status(500).json({ error: 'Proxy internal error', details: error.message });
    }
          }
