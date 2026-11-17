# 号脉 · How Am I

**给每一次执行号脉。**  
Lightweight runtime signals and short-lived diagnostics for the Mira Worker Workforce.

> **Status: V1 receiving Worker deployed to Cloudflare production (2026-11-17).** Synthetic HMAC ingress and controlled Observability run-ID lookup were verified against Cloudflare. **No actual Reporter or streaming pipeline is connected.** Account billing and actual retention are not independently reconciled; source deployment is not the same as full V1 acceptance.

## V1

The **first reporting source** is the trusted Reporter for the [Mira External Worker](https://github.com/uichat-mira/.github). It collects bounded, structured execution milestones and sanitized failure signals so that short-lived diagnostic events can supplement the authoritative GitHub engineering evidence.

- `POST /v1/events` — HMAC-authenticated, bounded JSON batches from trusted Reporter jobs only.
- `GET /health` — minimal service health without private metadata.
- Storage: the receiving Cloudflare Workers Free instance emits structured **Workers Logs**. No D1, R2, KV, DO, Queue or private server for V1.
- **Zero incremental Cloudflare infrastructure cost** is a required gate. Paid Worker execution models are permitted by the upstream contract and accounted for separately.
- GitHub Issues, Actions, Candidate/Verify/Delivery Artifacts and Draft PRs remain the authoritative execution/delivery record.
- Controlled Workers Observability REST Query API **successfully retrieved a synthetic event by Run ID**; programmatic public querying remains disabled. Billing-plan and effective retention evidence remain pending.

**Out of scope for V1:** general application logs, a public log search endpoint, arbitrary AppID registration, full terminal/prompt capture, direct mobile/desktop telemetry, and unverified tool-level live streaming.

**Future only:** authorized temporary reporting sources for time-bounded online debugging. They are not active or implemented.

## Architecture & work ownership

[Organization V1 Technical Contract](https://github.com/uichat-mira/.github/blob/main/docs/engineering/how-am-i-reporter-workforce-v1.md) — canonical scope, event schema, HMAC signing, isolation, source of truth, future expansion and acceptance gates.

[External Worker Recovery](https://github.com/uichat-mira/.github/blob/main/docs/governance/external-worker-recovery.md) — source of truth for cross-run continuation, not a state store owned by 号脉.

[Control Room](https://github.com/uichat-mira/control-room) — future read-only consumer; its public API must never expose the high-permission Cloudflare Observability token or private raw logs.

## Current POC state

The source-level **ingest/query feasibility POC** implements T1/T2 validation of HMAC, schema and sensitive-field rejection plus T3 real Workers-runtime behavior. Reproduce with `npm ci && npm run check`. See [docs/poc.md](docs/poc.md) for the endpoint contract, synthetic local fixture and maintainer-owned T4 procedure.

T4/T5: A controlled synthetic batch reached the real Cloudflare Worker, its structured event was queryable by Run ID, and the production valid request consumed **2 ms CPU**. The active endpoint is [how-am-i.dangjingtao.workers.dev](https://how-am-i.dangjingtao.workers.dev/health); deployed Worker version `3f3f11cc-5dfa-4bbb-839e-070dce89a29f` originated from source commit `dfc11e5`. The transient test Worker was deleted. **No real Reporter is connected** and account billing/retention have not been proved. See [OPS-030 T4/T5 evidence](https://github.com/uichat-mira/how-am-i/issues/2) and [docs/poc.md](docs/poc.md).

## Development policy

- Default integration branch: `dev`. Promotion route: `feat/* → dev → test → prod`.
- Read [AGENTS.md](AGENTS.md) and current [Mira Organization instructions](https://github.com/uichat-mira/.github/blob/main/AGENTS.md).
- Do not commit credentials, prompts, raw execution logs or real user data.
- Deployment, production-secret management and launch are separate evidence-based tasks.
- Local development and verification commands are documented in [docs/poc.md](docs/poc.md).

© Contributors. Public visibility does **not** imply an open-source license grant; a license may be selected as an explicit follow-up.
