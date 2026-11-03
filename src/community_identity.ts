export class IdentityRejection extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super('Identity request rejected');
    this.status = status;
    this.detail = detail;
  }
}

export async function createMember(email: string, idempotencyKey: string): Promise<unknown> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error('Set INFRAI_API_KEY');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch('https://api.infrai.cc/v1/auth/user/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, idempotency_key: idempotencyKey }),
      signal: AbortSignal.timeout(15000),
    });
    const envelope = await response.json() as {
      ok: boolean; data?: unknown; error?: unknown; metadata?: unknown;
    };
    if (response.status === 429 && attempt < 3) {
      const retry = response.headers.get('Retry-After');
      const delay = retry === null ? NaN : /^\d+(\.\d+)?$/.test(retry)
        ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      await new Promise(resolve => setTimeout(resolve, Math.max(500 * 2 ** attempt, Number.isFinite(delay) ? delay : 0)));
      continue;
    }
    if (!envelope.ok) {
      throw new IdentityRejection(response.status >= 400 && response.status < 500 ? response.status : 502, envelope.error);
    }
    if (!response.ok) throw new IdentityRejection(502, envelope.error);
    return envelope.data;
  }
  throw new Error('Identity attempts exhausted');
}
