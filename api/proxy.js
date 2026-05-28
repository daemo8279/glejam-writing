// api/proxy.js — Vercel Serverless Function
// Anthropic API 키를 서버에서만 보관하고 Claude API를 중계합니다.
// Vercel 대시보드 > Settings > Environment Variables 에서
// ANTHROPIC_API_KEY 를 설정해 주세요.

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-access-password');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[proxy] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  let body;
  try {
    // Vercel은 Content-Type: application/json 요청을 자동 파싱함
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await anthropicRes.json();
    return res.status(anthropicRes.status).json(data);

  } catch (err) {
    console.error('[proxy] Anthropic API 호출 실패:', err);
    return res.status(502).json({ error: 'Upstream API error: ' + err.message });
  }
}
