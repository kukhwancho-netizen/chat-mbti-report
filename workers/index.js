/**
 * 멘탈제갈량 상세 리포트 결제 승인 서버 (Cloudflare Workers)
 *
 * 배포 절차:
 *   1. Cloudflare 계정 가입(형님) → wrangler 로그인
 *   2. 토스페이먼츠 가입 → 시크릿 키 발급
 *   3. wrangler secret put TOSS_SECRET_KEY  (시크릿 키 붙여넣기)
 *   4. wrangler deploy
 *   5. index.html의 WORKERS_URL에 배포 URL 주입
 *
 * 엔드포인트:
 *   POST /payments/confirm  { paymentKey, orderId, amount }
 *     - 토스페이먼츠 /v1/payments/confirm 호출(Basic Auth)
 *     - amount === 500 검증(위변조 방지)
 *     - 승인 성공 시 결제 영수증(paidAt, orderId, amount) 반환
 *
 * 원칙: 대화 텍스트·출생 정보를 이 서버에서 저장·요청하지 않는다(결제 검증만).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(request, env) });
    }
    if (url.pathname === "/payments/confirm" && request.method === "POST") {
      try {
        const body = await request.json();
        const { paymentKey, orderId, amount } = body;
        if (!paymentKey || !orderId) return json(request, env, { ok: false, error: "missing fields" }, 400);
        if (amount !== 500) return json(request, env, { ok: false, error: "amount mismatch" }, 400);

        const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(env.TOSS_SECRET_KEY + ":"),
            "Content-Type": "application/json",
            "Idempotency-Key": orderId
          },
          body: JSON.stringify({ paymentKey, orderId, amount })
        });
        const result = await res.json();
        if (!res.ok) return json(request, env, { ok: false, error: result.message || "confirm failed", code: result.code }, 400);
        if (result.totalAmount !== 500) return json(request, env, { ok: false, error: "amount mismatch after confirm" }, 400);

        return json(request, env, {
          ok: true,
          orderId: result.orderId,
          approvedAt: result.approvedAt,
          receiptUrl: result.receipt ? result.receipt.url : null
        }, 200);
      } catch (e) {
        return json(request, env, { ok: false, error: e.message }, 500);
      }
    }
    return json(request, env, { ok: false, error: "not found" }, 404);
  }
};

function cors(request, env) {
  // ALLOWED_ORIGIN 환경변수(배포 도메인) 설정 권장 — 미설정 시 "*"(데모)
  const originHeader = request ? request.headers.get("Origin") : null;
  const origin = (env && env.ALLOWED_ORIGIN) || "*";
  return {
    "Access-Control-Allow-Origin": originHeader && origin === "*" ? originHeader : origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(request, env, obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors(request, env) }
  });
}
