/**
 * 글잼 라이팅 · Anthropic API 프록시 (Vercel Serverless Function)
 *
 * Vercel에 배포하여 Anthropic API 호출을 중계합니다.
 * API 키는 Vercel의 환경 변수에 안전하게 저장됩니다.
 *
 * ============================================================
 * 배포 전 설정 (Vercel 대시보드)
 * ============================================================
 *
 * Project Settings → Environment Variables
 *   - ANTHROPIC_API_KEY: sk-ant-api03-...
 *   - ACCESS_PASSWORD: 팀 공유 비밀번호 (선택)
 *   - ALLOWED_ORIGIN: https://your-site.vercel.app (선택, 쉼표로 다중)
 *
 * ============================================================
 * 파일 위치
 * ============================================================
 * 프로젝트 루트에 api/proxy.js로 배치:
 *   your-repo/
 *     ├── index.html
 *     └── api/
 *         └── proxy.js   ← 이 파일
 *
 * 배포 후 엔드포인트: https://your-site.vercel.app/api/proxy
 */

export default async function handler(req, res) {
  // -------- CORS 헤더 --------
  const corsHeaders = buildCorsHeaders(req);
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  // -------- 프리플라이트 --------
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // -------- 메서드 검증 --------
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { type: 'method_not_allowed', message: '이 엔드포인트는 POST만 지원합니다.' }
    });
  }

  // -------- Origin 검증 (선택) --------
  const origin = req.headers.origin || req.headers.referer || '';
  if (process.env.ALLOWED_ORIGIN && origin) {
    const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim());
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed === '*') return true;
      return origin.startsWith(allowed);
    });
    if (!isAllowed) {
      return res.status(403).json({
        error: { type: 'forbidden', message: '허용되지 않은 출처에서의 요청입니다.' }
      });
    }
  }

  // -------- 비밀번호 검증 (선택) --------
  if (process.env.ACCESS_PASSWORD) {
    const password = req.headers['x-access-password'];
    if (password !== process.env.ACCESS_PASSWORD) {
      return res.status(401).json({
        error: { type: 'unauthorized', message: '접근 비밀번호가 올바르지 않습니다.' }
      });
    }
  }

  // -------- API 키 확인 --------
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: {
        type: 'config_error',
        message: 'ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다. Vercel 대시보드를 확인하세요.'
      }
    });
  }

  // -------- 요청 본문 --------
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch (e) {
      return res.status(400).json({
        error: { type: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }
      });
    }
  }

  if (!body || !body.model || !body.messages) {
    return res.status(400).json({
      error: { type: 'invalid_request', message: 'model과 messages 필드는 필수입니다.' }
    });
  }

  // 토큰 상한 (과도한 요금 발생 방지)
  if (body.max_tokens && body.max_tokens > 4000) {
    body.max_tokens = 4000;
  }

  // -------- Anthropic API 호출 --------
  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const respText = await anthropicResponse.text();

    res.status(anthropicResponse.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(respText);
  } catch (err) {
    return res.status(502).json({
      error: { type: 'upstream_error', message: 'Anthropic API 연결 실패: ' + err.message }
    });
  }
}

// ============================================================
// Helpers
// ============================================================

function buildCorsHeaders(req) {
  const origin = req.headers.origin || '';
  let allowOrigin = '*';

  if (process.env.ALLOWED_ORIGIN) {
    const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim());
    if (allowedOrigins.includes(origin)) {
      allowOrigin = origin;
    } else if (allowedOrigins.includes('*')) {
      allowOrigin = '*';
    } else {
      allowOrigin = allowedOrigins[0] || '*';
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-access-password',
    'Access-Control-Max-Age': '86400',
  };
}

// Vercel 페이로드 상한을 올리기 위한 설정
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // 이미지 base64 수용
    },
  },
};
