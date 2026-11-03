import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryLedger, eventBody } from '../src/delivery_ledger.ts';

test('exception blocks delivery until resolved; delivery replay preserves receipt', () => {
  const ledger = new DeliveryLedger();
  const shipmentId = '00000000-0000-4000-8000-000000000001';
  const event = (n: number, fields: object) => eventBody.parse({
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, shipmentId, ...fields,
  });
  ledger.record(event(1, { kind: 'dispatched' }));
  ledger.record(event(2, { kind: 'exception', reason: 'temperature_review' }));
  const delivery = event(4, { kind: 'delivered', proof: {
    contentBase64: Buffer.from('%PDF-1.7\nreceipt').toString('base64'), mediaType: 'application/pdf',
  } });
  assert.throws(() => ledger.record(delivery), /transition rejected/);
  assert.equal(ledger.proofs.size, 0);
  ledger.record(event(3, { kind: 'resolved' }));
  const result = ledger.record(delivery);
  assert.equal(result.state, 'delivered');
  assert.equal(ledger.record(delivery), result);
  assert.equal(ledger.proofs.size, 1);
  assert.throws(() => ledger.record({ ...delivery, kind: 'dispatched', proof: undefined }), /identifier already used/);
});

test('request boundary rejects personal notes and absent event identifiers', () => {
  assert.equal(eventBody.safeParse({ kind: 'exception', notes: 'patient name' }).success, false);
});
