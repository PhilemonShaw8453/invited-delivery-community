import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { createMember, IdentityRejection } from './community_identity.ts';
import { DeliveryLedger, DecisionRejection, enrollmentBody, eventBody } from './delivery_ledger.ts';

function secretEquals(a: string, b: string): boolean {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}
const invite = process.env.INVITE_CODE;
const email = process.env.INVITE_EMAIL;
const token = process.env.COMMUNITY_TOKEN;
if (!invite || invite.length < 16 || !email || !token || token.length < 24 || !process.env.INFRAI_API_KEY) {
  throw new Error('Set INFRAI_API_KEY, INVITE_EMAIL, INVITE_CODE (16+ chars), COMMUNITY_TOKEN (24+ chars)');
}
const ledger = new DeliveryLedger();
let member: unknown;
let enrolled = false;
let pending: Promise<unknown> | undefined;

createServer(async (request, response) => {
  const send = (status: number, value: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  };
  try {
    if (!secretEquals(request.headers.authorization ?? '', `Bearer ${token}`)) return send(401, { error: 'Authentication required' });
    if (request.method !== 'POST' || !['/join', '/shipment-events'].includes(request.url ?? '')) return send(404, { error: 'Route not found' });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += Buffer.byteLength(chunk);
      if (size > 150000) return send(413, { error: 'Request too large' });
      chunks.push(Buffer.from(chunk));
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.url === '/join') {
      const input = enrollmentBody.parse(body);
      if (!secretEquals(input.inviteCode, invite) || input.email !== email) return send(403, { error: 'Invitation rejected' });
      if (!enrolled) {
        const id = createHash('sha256').update(`logistics-community:${email}`).digest('hex');
        pending ??= createMember(email, id);
        try { member = await pending; enrolled = true; } finally { pending = undefined; }
      }
      return send(200, { membership: 'active', identity: member });
    }
    if (!enrolled) return send(403, { error: 'Join community first' });
    return send(200, ledger.record(eventBody.parse(body)));
  } catch (error) {
    if (error instanceof IdentityRejection) return send(error.status, { error: error.detail });
    if (error instanceof ZodError || error instanceof SyntaxError) return send(400, { error: 'Invalid request body' });
    if (error instanceof DecisionRejection) return send(409, { error: error.message });
    return send(502, { error: 'Request could not complete' });
  }
}).listen(3000, '127.0.0.1', () => console.log('Community service on http://127.0.0.1:3000'));
