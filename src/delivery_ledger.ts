import { createHash } from 'node:crypto';
import { z } from 'zod';

export const enrollmentBody = z.object({
  email: z.string().email(), inviteCode: z.string().min(16).max(200),
}).strict();

export const eventBody = z.object({
  eventId: z.string().uuid(), shipmentId: z.string().uuid(),
  kind: z.enum(['dispatched', 'delivered', 'exception', 'resolved']),
  proof: z.object({ contentBase64: z.string().min(4).max(140000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), mediaType: z.literal('application/pdf') }).strict().optional(),
  reason: z.enum(['address_review', 'temperature_review', 'recipient_absent']).optional(),
}).strict();
export type DeliveryEvent = z.infer<typeof eventBody>;
export type ShipmentState = 'dispatched' | 'delivered' | 'exception';

export class DecisionRejection extends Error {}

export function nextState(current: ShipmentState | undefined, event: DeliveryEvent): ShipmentState {
  if (event.kind !== 'delivered' && event.proof) throw new DecisionRejection('Proof belongs to delivery');
  if (event.kind !== 'exception' && event.reason) throw new DecisionRejection('Reason belongs to exception');
  if (event.kind === 'dispatched' && current === undefined) return 'dispatched';
  if (event.kind === 'exception' && current === 'dispatched' && event.reason) return 'exception';
  if (event.kind === 'resolved' && current === 'exception') return 'dispatched';
  if (event.kind === 'delivered' && current === 'dispatched' && event.proof) return 'delivered';
  throw new DecisionRejection('Shipment transition rejected');
}

export class DeliveryLedger {
  states = new Map<string, ShipmentState>();
  receipts = new Map<string, { fingerprint: string; result: { shipmentId: string; state: ShipmentState; proofSha256?: string } }>();
  proofs = new Map<string, Buffer>();

  record(event: DeliveryEvent) {
    const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const prior = this.receipts.get(event.eventId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new DecisionRejection('Event identifier already used');
      return prior.result;
    }
    const state = nextState(this.states.get(event.shipmentId), event);
    const proof = event.proof ? Buffer.from(event.proof.contentBase64, 'base64') : undefined;
    if (proof && !proof.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new DecisionRejection('Expected PDF header');
    const proofSha256 = proof ? createHash('sha256').update(proof).digest('hex') : undefined;
    const result = { shipmentId: event.shipmentId, state, proofSha256 };
    if (proof && proofSha256) this.proofs.set(proofSha256, proof);
    this.states.set(event.shipmentId, state);
    this.receipts.set(event.eventId, { fingerprint, result });
    return result;
  }
}
