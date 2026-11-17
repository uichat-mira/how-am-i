# 号脉 V1 Cloudflare Free POC

This document describes the receive-only POC and records the Cloudflare live **synthetic** T4/T5 evidence. One production Worker is deployed, but there is **no live trusted Reporter**; production source deployment does not imply full V1 acceptance.

## Non-claims

- No production deployment or Cloudflare resource is created by this repository's checks.
- No Cloudflare, Reporter or provider secret is required for `npm ci && npm run check`.
- `202 Accepted` means the request was validated and structured log emission was attempted. It does **not** mean the event was persisted, indexed, queryable, or delivered exactly once.
- T4 synthetic live ingest/query and CPU have been measured, but full account billing-plan/cost reconciliation and effective retention remain open. No real Reporter credentials or private events have been connected.

## Endpoints

### `GET /health`

Returns only:

```json
{ "status": "ok", "service": "how-am-i", "schema": "haomai.telemetry.v1" }
```

No source identity, secret, account metadata, request log or event data is returned.

### `POST /v1/events`

Accepts HTTPS JSON only in a deployed Cloudflare environment. Query strings are rejected. Local `wrangler dev` serves HTTP on `127.0.0.1` for development only. The request is authenticated with HMAC-SHA-256 before any event field is trusted.

Limits:

| Limit | Value |
| --- | --- |
| Raw request body | 32 KiB |
| Events per batch | 16 |
| Individual event JSON | 2 KiB |
| Timestamp drift | +/-90 seconds |
| App identity | `mira-worker-reporter` only |

Accepted event kinds:

`pipeline.enrolled`, `worker.started`, `worker.stopped`, `worker.failed`, `candidate.captured`, `candidate.unavailable`, `verify.passed`, `verify.failed`, `delivery.draft_pr_created`, `delivery.failed`, `recovery.detected`, `recovery.failed`, `run.finished`.

Accepted event fields are limited to the canonical sample plus an optional uppercase `error_code`:

`event_id`, `occurred_at`, `kind`, `level`, `repository`, `issue_number`, `run_id`, `run_attempt`, `stage`, `outcome`, `evidence_ref` (`type` + digit `id` only), `error_code`.

Unknown fields are rejected. This is how V1 rejects client `trust_class`/`app_id` claims, prompts, raw logs, stdout/stderr, headers, authorization material, tool trajectories, free-text summaries and arbitrary metadata. `evidence_ref` does not accept URLs in V1; only bounded type/id pairs are accepted.

The receiver adds `received_at`, resolved `app_id = mira-worker-reporter` and `trust_class = trusted_pipeline` itself. `run_id` remains a string. Each validated event is emitted as one structured `console.log` object for Workers Logs.

Response semantics:

| Status | Meaning |
| --- | --- |
| `202` | Validated and log emission attempted; log-only, not persisted, not exactly once |
| `400` | Malformed JSON, invalid schema/fields/kinds, invalid UTF-8 or query string |
| `401` | Missing/invalid app identity, timestamp window, nonce or signature |
| `413` | Body above 32 KiB or an event above 2 KiB |
| `415` | Content type is not `application/json` |
| `503` | Secret binding missing or log emission threw |

A failed log sink returns `503` and never a false `202`. Earlier events in a batch may already have been logged before a later emission throws; retry is not exactly-once.

## HMAC identity

Headers:

- `X-Haomai-App-Id: mira-worker-reporter`
- `X-Haomai-Timestamp`: Unix seconds, 10 digits
- `X-Haomai-Nonce`: 16-128 characters from `A-Z a-z 0-9 . _ ~ -`
- `X-Haomai-Signature`: lowercase or uppercase 64-character HMAC-SHA-256 hex

Canonical signing input:

```text
v1
POST
/v1/events
<TIMESTAMP>
<NONCE>
<SHA256(raw request body bytes) as lowercase hex>
```

The signature covers the raw request bytes, not a re-serialized JSON value. The Worker recomputes the digest and compares MACs with a constant-time byte comparison. The secret comes only from the `HAOMAI_HMAC_SECRET` Worker binding.

V1 has no nonce store. A captured request can be replayed inside the 90-second window. `event_id` supports read-side diagnostics only; it does not provide storage-level exactly-once behavior and must not gate financial, authorization or delivery effects.

## Local development

```bash
npm ci
printf 'HAOMAI_HMAC_SECRET=local-development-only-change-me\n' > .dev.vars
npm run dev
```

`.dev.vars` is gitignored and must contain only a disposable local value. Never put a production Reporter secret in a model-controlled shell, a committed file or a public fixture.

In another local shell with the same disposable secret:

```bash
HAOMAI_HMAC_SECRET=local-development-only-change-me npm run fixture
curl http://127.0.0.1:8787/health
```

`npm run fixture` reads `fixtures/synthetic-batch.json`, signs the exact bytes with the current timestamp and a random nonce, and prints a ready-to-run `curl` command. The fixture is synthetic: repository `uichat-mira/cloud-auth`, Issue `123`, Run `44000000000`; it contains no prompt, transcript, source, model output or user data.

## Verification

```bash
npm ci
npm run check
```

`npm run check` runs TypeScript static checks and Vitest. The tests use `@cloudflare/vitest-pool-workers`, so test files execute in the actual `workerd` Workers runtime rather than a Node mock.

Coverage mapping:

- **T1/T2**: RFC SHA-256/HMAC vectors, canonical signing input, method/path/timestamp/nonce/body tamper, wrong secret, unauthorized app identity, stale timestamp, missing headers, oversized body/event, unknown kinds/fields, client trust claims, prompt/log/header fields, URL/path-traversal-shaped values, max batch size, invalid UTF-8, sanitized log content, no secret echo.
- **T3**: real Workers runtime `GET /health`, valid `202`, invalid HTTP requests, repeated identical request accepted twice (documenting no nonce store / exactly-once), logged structured object fields and `503` logger-failure behavior.
- **T4**: not covered by this repository's checks. See below.

The local toolchain pins `compatibility_date` to `2026-11-17`, matching the pinned `workerd` test binary. Raising it requires a deliberate toolchain update, not only a config edit.

## Verified Cloudflare T4/T5 deployment record — 2026-11-17

This section records a small **synthetic** test, not general load, account billing assurance or Reporter acceptance. Source code tested and deployed: `dfc11e55232a2a428ae07bad29e6825ad8ff3306` through `dev → test → prod`. GitHub Actions `Mira Gate` was green on every environment branch.

| Evidence | Actual observed result |
| --- | --- |
| T4 temporary test Worker | `how-am-i-test`, then **deleted** |
| T4 signed ingest / invalid signature | HTTP `202` / `401` |
| T4 account Workers Observability API, filtered synthetic Run ID `44000000000` | 1 matching structured event |
| T4 CPU | Valid `202` 4 ms; invalid `401` 1 ms |
| T5 production health / signed ingest / missing HMAC | HTTP `200` / `202` / `401` |
| T5 production Query API | 1 matching structured event for synthetic Run ID |
| T5 CPU | Valid `202` 2 ms |
| Production endpoint | https://how-am-i.dangjingtao.workers.dev/health |
| Cloudflare active deployment | `0ec9d016-61ed-4cae-8148-36ca3eb32170` |
| Active Worker version | `3f3f11cc-5dfa-4bbb-839e-070dce89a29f` at 100% |
| Cloudflare resources | Only production `how-am-i` Worker remains; no D1/R2/KV/DO/Queue/SaaS added |

**Unresolved evidence:** the authorized Cloudflare connection can deploy Workers and query Observability, but Billing Read for account subscriptions returned HTTP 403; actual incremental bill cannot be verified from this connection. Effective account retention and sustained CPU under realistic load were not measured. No incremental paid Cloudflare resource was deliberately enabled, but that is not proof of the future bill. The repository cannot promise fully accepted Free-plan operation until this is reconciled.

**Security observation:** Cloudflare's own invocation records captured the *custom HMAC signature request header*, although the application's structured event did not. Treat Observability query permission as sensitive, avoid exporting raw platform request logs, and review/redact this behavior before distributing Reporter credentials. There is no deployed Reporter and the local disposable smoke-signing material was deleted; the reporter integration must securely rotate/distribute the HMAC secret.

The authoritative observed evidence and open gates are recorded in [OPS-030](https://github.com/uichat-mira/how-am-i/issues/2). This section must not be read as a complete Worker Workforce or TV acceptance.

## Trusted-maintainer T4 procedure

T4 must run in an isolated trusted shell by a maintainer, not in the model shell. Use a disposable synthetic event only.

1. Confirm the target is the **Cloudflare Workers Free** plan and that no paid observability, storage, queue or database product will be enabled.
2. In the trusted shell, set `HAOMAI_HMAC_SECRET` with `npx wrangler secret put HAOMAI_HMAC_SECRET` for the target Worker. Do not print it, commit it, or pass it to a model process.
3. Deploy the reviewed candidate with `npx wrangler deploy`. Deployment requires separate authorization from this POC implementation.
4. From the trusted shell, sign `fixtures/synthetic-batch.json` with `HAOMAI_HMAC_SECRET=<trusted value> npm run fixture` and send the request to the deployed Worker. Record the HTTP status and `received_at`.
5. Query Workers Logs in the Cloudflare dashboard for `how-am-i` filtering `run_id = "44000000000"`, then try the Workers Observability REST Query API (`POST /accounts/{account_id}/workers/observability/telemetry/query`) if the account permits it.
6. Record, without publishing tokens or confidential account IDs:
   - Worker version/deployment and request status;
   - whether the event is queryable by `run_id`, and observed query latency;
   - actual API permission required (current docs say `Workers Observability Write`, which is not a low-privilege public-read token);
   - invocation CPU time and log event count for the synthetic request;
   - retention visible in the account and the account-shared Free log budget;
   - observed incremental Cloudflare cost, expected to be zero.
7. If query permission, retention, CPU or cost cannot be proven on the Free plan, record the exact gate and stop. Do not silently enable paid observability, add a database, or publish a high-permission token to a public API.

T4/T5 synthetic ingest and controlled Query API checks have now been observed. Do **not** extrapolate that to billing, effective retention, real Reporter connectivity, throughput, public search APIs, exactly-once delivery, or production readiness of the full Workforce/TV product.
