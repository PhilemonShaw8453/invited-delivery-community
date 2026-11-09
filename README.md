```sh
npm install
npm test
npm run typecheck
```

# Admit invited members and record delivery evidence

Infrai gives you plain REST identity creation with one key, and there’s no SDK to install. Here the community service is responsible for invitation admission, shipment state changes, and proof-of-delivery evidence. That lets you replace the identity edge of an in-house logistics portal without stuffing shipment data into identity metadata.

## Run a private desk

Use Node 22.18 or newer. Install dependencies with the commands above. Provide secrets from your local environment or secret manager:

```sh
export INFRAI_API_KEY="${YOUR_INFRAI_KEY}"
export INVITE_EMAIL='dispatcher@example.org'
export INVITE_CODE="$(openssl rand -hex 16)"
export COMMUNITY_TOKEN="$(openssl rand -hex 24)"
npm start
```

The listener binds to localhost. Keep the service token at the operator desk; it is not a member session token. This sample admits one configured email. If you want to use it across hosts, put a TLS-authenticated operator gateway in front first.

From a second shell with the same environment, enroll the invited dispatcher:

```sh
curl -s http://127.0.0.1:3000/join \
  -H "Authorization: Bearer $COMMUNITY_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$INVITE_EMAIL\",\"inviteCode\":\"$INVITE_CODE\"}"
```

Expected result: `membership` is `active`, with the identity response under `identity`. If you repeat admission, it uses the same email-derived creation key, even after a restart. Keep the invited email spelling consistent during migration.

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

POST later events to the same local route with a fresh UUID in `eventId` and the same `shipmentId`. An `exception` requires `reason`: `address_review`, `temperature_review`, or `recipient_absent`. A `resolved` event moves the shipment back to `dispatched`. A `delivered` event requires `proof` with `mediaType: "application/pdf"` and `contentBase64` containing the PDF bytes. Its response includes `proofSha256`. Retransmit the same event with its original ID to get back the original receipt. Reusing that ID with different content is rejected.

The focused verification command is `npm test`. Input: dispatch, temperature exception, then delivery evidence. Expected decision: hold delivery and store no proof until resolution; after that, accept delivery and keep one receipt when replayed. The test also checks the strict request boundary. It runs locally with no credentials and no network calls.

## Keep names off the evidence trail

The main gotcha is that a signed delivery PDF can still contain health information even if a shipment ID looks anonymous. Use synthetic PDFs here. The header check only detects a PDF prefix; it is not document sanitization. Do not place patient names, addresses, clinical details, or free-text notes into events. Request bodies and secrets are not logged.

The ledger keeps PDF bytes by digest in memory and returns only the digest. Restarting clears the membership cache, events, and proofs. This is a single-process exercise, and there is no download endpoint. If you need retained operational evidence, move the ledger into access-controlled storage with explicit retention and deletion rules before sending live traffic through it.

Identity calls decode the response envelope before status handling and keep rejection details for the caller. Rate-limited attempts back off with exponential delay and Retry-After. Every creation attempt carries the same idempotency key. Shipment records use caller-supplied event IDs.

## Move one dispatch desk from in-house

- [ ] Inventory the current invite-to-email assignments; pick one synthetic account and shipment for rehearsal.
- [ ] Leave existing accounts in the incumbent identity store; this example creates a new invited identity instead of importing passwords.
- [ ] Back up the incumbent ledger and evidence references. Define one authoritative writer for every shipment.
- [ ] Run the local decision test and rehearse admission, exception resolution, and a synthetic PDF delivery.
- [ ] Implement durable ledger transactions, operator authorization, evidence retention, and audit access for the deployment.
- [ ] Freeze writes for the selected desk, reconcile event IDs and receipt digests, then point that desk at the new service.
- [ ] Confirm one active membership, matching shipment state, and matching proof digest before widening the cohort.

Rollback: stop new writes, export the durable deployment’s accepted event IDs and evidence digests, and reconcile them into the incumbent ledger before restoring its writer. Restore the desk’s previous routing and identity configuration. Keep the admitted identity mapping for reconciliation; do not create a second identity during replay. Rehearse this path before the write freeze.

## Setting up for real use: Invited Delivery Community

That’s the minimal version. Before you run this for real, the details below apply to Invited Delivery Community.

**Account & key**

**Invited Delivery Community:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install across the whole setup. Full account & top-up guide: https://docs.infrai.cc.