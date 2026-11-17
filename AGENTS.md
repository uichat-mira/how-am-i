# How Am I — Repository Instructions

This is the public source repository for **号脉 (How Am I)**, a lightweight telemetry intake service for Mira's worker execution.

## Mandatory upstream instructions

1. Read the **current** [Organization AGENTS.md](https://github.com/uichat-mira/.github/blob/main/AGENTS.md) before decisions or modifications. Do not rely on remembered policy.
2. Read the applicable Issue / PR contract and the canonical [How Am I / Reporter / Worker Workforce V1 technical contract](https://github.com/uichat-mira/.github/blob/main/docs/engineering/how-am-i-reporter-workforce-v1.md).
3. Inspect the actual code, Cloudflare configuration and deployed evidence before claims of support, availability or successful tests.

## Local boundaries

- The repository is **public**. Never commit account IDs treated as confidential, HMAC secrets, provider/GitHub/Cloudflare tokens, raw event logs, real prompts, credentials or private run content. Use Cloudflare secrets and trusted GitHub Actions secrets for runtime credentials.
- V1 **only** accepts a trusted Mira External Worker Reporter. Other short-lived production-debug reporters are a reserved future use case, **not V1 scope**.
- V1 infrastructure must add **zero Cloudflare spend**. The model used by actual Worker execution may be paid through an already-authorized provider, tracked separately.
- Preserve authority separation: GitHub Issue/Actions/Artifact/PR own work and delivery facts; this service supplies time-limited diagnostic projections only. Model-controlled shells must not receive Reporter write secrets.
- Do not implement a generic ingestion registry, public events query, business-app logging, storage database, live stream or deployment without a specific contract and proportionate runtime evidence.
- Follow `feat/* → dev → test → prod`. Creation of a public repository does not authorize deployment, promotion, release or automation-based dispatch.
- For changes to HMAC/auth, schema, trust labels, retention, public API or costs, include deterministic T1/T2 and actual Workers-runtime T3; prove externally dependent claims at the required T4/T5 layer.
- If documented Cloudflare Free/query/API permission behavior differs from deployed reality, state the gap and request an explicit product decision rather than silently adopting paid services or leaking high-permission API tokens.

Do not duplicate the canonical Organization product contract in this repository. This file records only repository-specific operating boundaries.
