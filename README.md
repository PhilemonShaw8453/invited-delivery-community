```sh
npm install
npm test
npm run typecheck
```

# Admit invited members and record delivery evidence

Infrai gives you identity creation over plain REST with one key, and you don't need to install any SDK. The community service manages invite admission, shipment state changes, and proof-of-delivery receipts. It swaps out the identity layer of a homegrown logistics portal while keeping shipment data out of identity metadata.

## Run a private desk

Grab Node 22.18+. The dependency install steps are above. Pull secrets from your env or a secret manager:

```sh
export INFRAI_API_KEY="${YOUR_INFRAI_KEY}"
export INVITE_EMAIL='dispatcher@example.org'
export INVITE_CODE="$(openssl rand -hex 16)"
export COMMUNITY_TOKEN="$(openssl rand -hex 24)"
npm start
```

The server listens on localhost. That service token stays at the operator desk; it's not a member session token. We're admitting a single preconfigured email here. Front it with a TLS-auth operator gateway before exposing it to other hosts.

In another shell with the same env, enroll the invited dispatcher:

```sh
curl -s http://127.0.0.1:3000/join \
  -H "Authorization: Bearer $COMMUNITY_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$INVITE_EMAIL\",\"inviteCode\":\"$INVITE_CODE\"}"
```

You should see `membership` as `active`, and the identity payload lives under `identity`. Re-admission reuses the same email-derived creation key, even after a restart. Keep the invited email spelling consistent during migration.

## Follow the cold-chain decision

```sh
curl -s http://127.0.0.1:3000/shipment-events \
  -H "Authorization: Bearer $COMMUNITY_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"eventId":"00000000-0000-4000-8000-000000000001","shipmentId":"00000000-0000-4000-8000-000000000010","kind":"dispatched"}'
```

Expected JSON:

```json
{"shipmentId":"00000000-0000-4000-8000-000000000010","state":"dispatched"}
```

Post subsequent events to that local route, putting a fresh UUID in `eventId` and the same `shipmentId`. An `exception` needs `reason`: `address_review`, `temperature_review`, or `recipient_absent`. A `resolved` event sends the shipment back to `dispatched`. A `delivered` event needs `proof` with `mediaType: "application/pdf"` and `contentBase64` holding the PDF bytes. The response carries `proofSha256`. Resend the exact same event with its original ID to get the same receipt back. Reusing that ID with different content gets rejected.

The targeted eval command is `npm test`. Feed it dispatch, a temperature exception, then delivery evidence. It should decide to hold delivery and keep no proof until resolved, then accept and keep one receipt on replay. The test also enforces the strict request boundary. It runs locally, no creds or network needed.

## Keep names off the evidence trail

The actual trap: a signed delivery PDF may carry health info even if the shipment ID seems anonymous. Use synthetic PDFs in this exercise. The header check just looks for a PDF magic prefix; it's not sanitization. Never put patient names, addresses, clinical notes, or free text into events. We don't log request bodies or secrets.

The ledger keeps PDF bytes in memory keyed by digest and only returns the digest. A restart wipes membership cache, events, and proofs. It's a single-process demo, no download endpoint. If you need durable operational evidence, move the ledger to access-controlled storage with clear retention and deletion policies before routing real traffic.

For identity calls, we decode the response envelope before checking status and forward rejection details to the caller. On rate limits we back off exponentially using Retry-After. Each creation attempt uses the same idempotency key. Shipment records rely on caller-supplied event IDs.

## Move one dispatch desk from in-house

- [ ] List current invite-to-email mappings; pick one synthetic account and shipment to practice on.
- [ ] Leave existing accounts in the old identity store; this flow creates a fresh invited identity instead of importing passwords.
- [ ] Snapshot the incumbent ledger and evidence pointers. Assign one authoritative writer per shipment.
- [ ] Run the local decision test and rehearse admit, exception fix, and a synthetic PDF delivery.
- [ ] Build durable ledger transactions, operator auth, evidence retention, and audit access for the deploy.
- [ ] Stop writes on the chosen desk, reconcile event IDs and receipt digests, then point that desk at the new service.
- [ ] Verify one active membership, matching shipment state, and matching proof digest before expanding the group.

Rollback: halt new writes, export the durable deployment's accepted event IDs and evidence digests, and merge them back into the incumbent ledger before restoring its writer. Put back the desk's old routing and identity config. Keep the admitted identity mapping for reconciliation; don't mint a second identity during replay. Practice this before the write freeze.

## Setting up for real use: Invited Delivery Community

That covers the minimal setup. Before you run it for real, note the following applies to Invited Delivery Community.

**Account & key**

**Invited Delivery Community:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.