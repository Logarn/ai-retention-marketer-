# Worklin AI Handoff Context

Use this file to start a new Codex/chat session with enough context to continue Worklin AI without rereading the whole prior thread.

Last updated: 2026-05-04

## Product Summary

Worklin AI is an agent-first retention operating system for Shopify/DTC brands.

The app helps lifecycle/CRM teams turn Shopify data, Klaviyo data, brand knowledge, campaign history, playbooks, and performance memory into:

- product intelligence
- campaign plans
- design-ready creative briefs
- QA/preflight results
- approved Klaviyo draft campaigns
- lifecycle flow coverage and recommendations
- campaign and flow audit insights
- later: segment audits, full retention audits, action plans, scheduled checks, and guarded execution

Important naming note:

- The old product name was Oscar.
- Do not use Oscar in product copy, PR descriptions, comments, docs, or new code.
- Use Worklin AI / Worklin.

## Latest Main Status

Current expected local repo state:

```text
branch: main
remote: origin/main
status: main is up to date with origin/main
latest local main commit: 3d4bfd3 Add campaign audit v0
latest merged PR: PR #34 Campaign Audit v0
pending handoff work: WORKLIN_CONTEXT_HANDOFF.md may be modified and unstaged when the user asks for handoff maintenance
stash: approval-gate-v0-wip still exists and must not be touched unless explicitly requested
```

Official repo:

```text
https://github.com/Logarn/ai-retention-marketer-
```

Local repo path:

```text
/Users/admin/Documents/Codex/2026-04-28/github-plugin-github-openai-curated-main/worklin-ai-git
```

Current stack:

- Next.js App Router
- Prisma 7
- PostgreSQL
- Local seeded data
- Shopify/local normalized data
- Klaviyo read and draft integrations
- Vercel target later

## Current Architecture Spine

Worklin now has a backend-first audit and agent spine:

```text
/agent Chat
  -> RAG Context Layer
  -> LLM Provider Router
  -> LLM Intent Parser
  -> Deterministic Command Router
  -> Tool Registry
  -> Campaign Workflow
       Planner -> Playbook-aware Brief Generator -> QA -> Approval Intent -> Klaviyo Draft Creation
  -> Lifecycle Flow Workflow
       Klaviyo Flow Read -> Flow Detection -> Flow Planner -> Flow Detail Read -> Flow Audit
  -> Product Intelligence
       Shopify/local normalized Product, Order, OrderItem, Customer, CustomerEvent data
       -> Product Performance Intelligence
  -> Campaign Intelligence
       Klaviyo Campaign Metadata Read -> Klaviyo Performance Read when configured -> Campaign Audit
  -> Shared Audit Layer
       Audit Insight Framework -> ranked insights, evidence, caveats, recommended actions, chart hints
```

The audit strategy is:

```text
Product truth -> campaign truth -> flow truth -> segment truth -> lifecycle placement -> prioritized actions
```

This matters because Worklin should not jump from raw Klaviyo data to generic recommendations. Useful audits need product truth, asset truth, audience truth, evidence, confidence, caveats, and executive-friendly summaries before recommending action.

## Current Safety Rules

Non-negotiable safety posture:

- No scheduling.
- No sending.
- Klaviyo flow reads are read-only.
- Klaviyo campaign metadata reads are read-only.
- Klaviyo campaign/flow/segment performance reads are read-only.
- Klaviyo campaign creation is draft-only.
- Klaviyo flow creation/update/delete/schedule/send does not exist yet.
- `KLAVIYO_DRAFT_ONLY=true` is required for Klaviyo write-adjacent behavior.
- Agent approval means draft creation only, never send/schedule.
- LLM interprets; deterministic router validates and executes.
- LLM output must never directly trigger Klaviyo drafts or external actions.
- Failed-QA briefs are held.
- Warning briefs are held unless explicitly included.
- Provider keys, Klaviyo keys, Shopify keys, database URLs, and GitHub tokens stay server-only and must never be printed or returned.
- Read routes should return safe JSON and caveats instead of crashing when config, scopes, or data are missing.

Current Klaviyo write surface:

- Worklin can create real Klaviyo templates and draft campaigns from approved QA-passed briefs.
- Worklin must not send or schedule campaigns.
- Worklin must not create duplicate drafts for the same brief when a local `KlaviyoDraft` already exists.

Current Klaviyo read surfaces:

- `GET /api/klaviyo/flows`
- `GET /api/klaviyo/flows/[flowId]`
- `POST /api/klaviyo/performance`
- `GET /api/klaviyo/campaigns`

All of these are read-only.

## Current Main Includes

Earlier foundation layers:

- Campaign Memory
- Planner v0
- Brief Generator v0
- Plan -> Brief UI v0
- QA Engine v0 with Brain/Brand checks
- QA UI v0
- Agent Orchestrator v0
- WorkflowRun persistence
- Agent Output Canvas v0
- Klaviyo Draft Creation v0
- Approval Intent -> Auto Draft v0
- Playbook Engine v0
- Tool Registry v0
- Agent Command Router v0
- RAG Context Layer v0
- Context-Aware Command Router v1
- Agent Chat Integration v0
- LLM Provider Router v0
- LLM Intent Parser v0
- Playbook-aware Brief Generation v0
- Klaviyo Flow Read + Detection v0
- Flow Planner v0
- Flow Planner Agent Command Integration v0
- Klaviyo Flow Detail Read v0
- Klaviyo Performance Read v0

Latest audit/intelligence layers:

- Product Performance Intelligence v0
- Audit Insight Framework v0
- Flow Audit v0
- Expanded Flow Playbook Catalog v0
- Campaign Audit v0

## Recently Merged PRs

### PR #34: Campaign Audit v0

Status: completed and merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/34
```

Latest main commit after merge:

```text
3d4bfd3 Add campaign audit v0
```

Adds:

- `lib/klaviyo-campaigns.ts`
- `lib/campaigns/audit-campaigns.ts`
- `GET /api/klaviyo/campaigns`
- `POST /api/campaigns/audit`

Behavior:

- Reads recent Klaviyo campaign metadata where config/scopes allow.
- Normalizes campaign id, name, status, channel, subject/message label, created/updated/send timestamps, draft/archive/delete state, audience/list/segment relationships, and message metadata when available.
- Uses channel-filtered Klaviyo campaign reads because Klaviyo requires a campaign channel filter.
- Audits campaigns using metadata, campaign playbooks, Product Performance Intelligence, and Klaviyo Performance Read when available.
- Uses campaign playbooks such as VIP Early Access, Product Spotlight, At-risk Winback, and No-discount Education.
- Identifies theme and subject-line signals such as FAQ/objection handling, gift/self-gift, product spotlight, generic broad blasts, VIP/early access, product/story, emoji/no emoji, and plain/human subject style.
- Produces standardized Audit Insight Framework insights with evidence, confidence, severity, caveats, recommended actions, and chart hints.
- If `KLAVIYO_CONVERSION_METRIC_ID` or reporting access is unavailable, the audit does not fail. It returns metadata/product/playbook-based insights plus caveats.
- If no campaigns are available, the audit returns a safe empty audit with caveats.

Safety:

- Read-only campaign metadata reads.
- Read-only performance reads.
- No Klaviyo campaign creation/update/delete in this feature.
- No scheduling.
- No sending.
- No schema changes.
- No UI.

Verification:

```bash
npm run build
GET /api/klaviyo/campaigns?limit=20&includeDrafts=true -> 200
POST /api/campaigns/audit with {} -> 200
POST /api/campaigns/audit with {"timeframe":"last_365_days"} -> 200
GET /api/products/intelligence still works
POST /api/flows/audit still works
POST /api/klaviyo/performance still returns safe behavior when config/scopes are unavailable
GET /api/klaviyo/flows still works
GET /api/klaviyo/drafts still works
Confirmed no Klaviyo draft/campaign/flow counts changed
Staged secret scan
```

### PR #33: Expanded Flow Playbook Catalog v0

Status: completed and merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/33
```

Adds/expands flow playbooks for:

- `collection_abandon`
- `cross_sell`
- `post_purchase_pre_delivery`
- `post_purchase_post_delivery`
- `transactional`
- `back_in_stock`
- `review`
- `sunset`
- `price_drop`
- `low_inventory`
- `birthday`
- `loyalty`
- `subscription`
- `cdp_aa`

Keeps existing core playbooks:

- `welcome_series`
- `site_abandon`
- `browse_abandon`
- `cart_abandon`
- `checkout_abandon`
- `replenishment`
- `winback`

Behavior:

- Expands the lifecycle flow catalog beyond the original core seven.
- Adds category/detail-level concepts so Worklin can distinguish core, secondary, conditional, and infrastructure playbooks.
- Prevents conditional or infrastructure playbooks from being treated as missing core flows.
- Lets Flow Planner expose secondary, conditional, and infrastructure opportunities without making the output noisy.
- Lets Flow Audit map existing Klaviyo flows to the expanded catalog.
- Placeholder/partial playbooks are audited only as far as the known safe structure allows, with caveats when needed.

Safety:

- Read-only only.
- No Klaviyo flow creation.
- No scheduling.
- No sending.
- No schema changes.

### PR #32: Flow Audit v0

Status: completed and merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/32
```

Adds:

- `lib/flows/audit-flow.ts`
- `POST /api/flows/audit`

Behavior:

- Audits real Klaviyo flows using Flow Read, Flow Detail Read, Flow Detection, Flow Planner, Flow Playbooks, Product Performance Intelligence, Klaviyo Performance Read when available, and Audit Insight Framework helpers.
- Supports auditing one `flowId` or auditing detected active flows with `auditAll=true`.
- Reads trigger type, actions, conditional splits, time delays, send-email actions, message names, subject lines, template IDs, and available content metadata.
- Maps flows to Worklin playbooks where possible.
- Compares structure against playbook expectations such as sequence, timing, target audience, content suggestions, offer rules, QA risks, and key metric.
- Produces scores, summaries, standardized insights, findings, chart hints, caveats, and next actions.
- Handles image-heavy or unavailable email content by marking content understanding as limited rather than pretending to read the full creative.
- If performance config such as `KLAVIYO_CONVERSION_METRIC_ID` is missing, the audit continues with structural/playbook evidence and caveats.

Safety:

- Read-only only.
- No Klaviyo flow creation.
- No flow updates/deletes.
- No scheduling.
- No sending.
- No schema changes.
- No UI.

### PR #31: Audit Insight Framework v0

Status: completed and merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/31
```

Adds:

- `lib/audits/types.ts`
- `lib/audits/insights.ts`
- `POST /api/audits/insights/test`

Shared audit vocabulary:

- insight type: `build`, `fix`, `scale`, `audit`, `classify`, `cleanup`, `monitor`, `pause`, `protect`
- severity: `good`, `opportunity`, `warning`, `issue`, `critical`, `unknown`
- confidence: `strong`, `directional`, `weak`
- domain: `product`, `campaign`, `flow`, `segment`, `lifecycle`, `deliverability`, `creative`, `offer`, `revenue`
- evidence type: `metric`, `sample_size`, `playbook`, `structure`, `performance`, `product`, `segment`, `content`, `caveat`

Insight shape:

```text
id
title
summary
domain
insightType
severity
confidence
priorityScore
evidence
caveats
recommendedActions
affectedEntities
chartHints
createdAt
```

Helpers:

- `createAuditInsight`
- `rankAuditInsights`
- `groupAuditInsightsByDomain`
- `summarizeAuditInsights`
- `createChartHint`
- `normalizeConfidence`
- `normalizeSeverity`

Behavior:

- Gives future Worklin audits one shared language for findings.
- Supports chart-ready outputs through `chartHints`.
- Test route returns deterministic seeded insights for missing Checkout Abandon, weak Welcome structure, FAQ/objection campaigns, unknown Customer Thank You flow, stale drafts, and high-performing recovery flows.
- Test/helper normalization accepts simple string recommended actions and converts them into action objects.

Safety:

- Deterministic.
- No schema changes.
- No UI.
- No external APIs.
- No Klaviyo writes.

### PR #30: Product Performance Intelligence v0

Status: completed and merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/30
```

Adds:

- `lib/products/product-performance-intelligence.ts`
- `GET /api/products/intelligence`

Behavior:

- Uses existing normalized local `Product`, `Order`, `OrderItem`, `Customer`, and `CustomerEvent` data.
- Does not call Shopify APIs directly.
- Classifies products into:
  - revenue anchors
  - hidden gems
  - add-on boosters
  - replenishment candidates
  - fix candidates
- Produces lifecycle placement suggestions:
  - welcome hero
  - welcome hidden gems
  - browse abandon
  - cart/checkout add-ons
  - post-purchase cross-sell
  - VIP
  - winback
- Uses deterministic evidence such as revenue, order volume, AOV, order efficiency, replenishment days, repeat-purchase signals, and product view data when reliable.
- If product view data is missing or unreliable, it does not fake precision. It returns caveats and relies more on revenue/order/AOV/replenishment signals.
- If Shopify-derived data is missing, it returns caveats explaining that Shopify sync is required for full product intelligence.

Safety:

- Read-only local analytics.
- No schema changes.
- No Shopify API calls.
- No external APIs.
- No LLM required.
- No UI.

## Current Stable Roadmap

1. Segment / Audience Audit v0
2. Klaviyo Metric Discovery / Performance Setup v0
3. Retention Audit Workflow v0
4. Audit Canvas / Visual Summary v0
5. Audit -> Action Plan v0
6. Durable Approval State v0
7. Results Ingestion + Learning Loop
8. Tool Execution Runtime v0
9. Action Log v0
10. Skill Registry / Skill Runner v0
11. Web Research Tool v0
12. Cron Jobs / Scheduled Checks v0
13. Heartbeats / Proactive Recommendation Queue
14. Segment/Profile Sync
15. Flow Definition Builder
16. Send/Schedule Execution
17. BYOK / AI Settings
18. Nano Banana / Visual Layer
19. Sub-agents / Child Workflows

Roadmap notes:

- Skills should be defined later through a Q&A session where Steve explains his expert process and Worklin converts it into repeatable skills.
- Build future features closer to 80% useful v0s, not ultra-thin slices, while preserving safety.
- Audit outputs should be chart/visual-ready for founders/CMOs, not giant walls of text.
- Segment/Audience Audit should come next because campaign and flow audits need audience truth before Retention Audit Workflow v0.
- Klaviyo Metric Discovery / Performance Setup should help discover/select the right conversion metric instead of assuming `KLAVIYO_CONVERSION_METRIC_ID` is already configured.

## Git Workflow Rules

Do:

- Start every feature from latest `main`.
- Run `git status --short --branch` before editing.
- Create a fresh feature branch named as requested, usually `feature/<short-feature-name>`.
- Stage only related files.
- Run `npm run build` before PR.
- Run relevant route/API smoke tests.
- Run a staged secret scan before commit.
- Push the branch and open a draft PR.
- Wait for explicit user approval before merging.
- After merge approval, checkout `main`, pull latest `origin/main`, confirm main is up to date, and delete the local feature branch if safe.

Do not:

- Work directly on `main` for feature work.
- Merge a PR unless the user explicitly says it is approved to merge.
- Commit unrelated files.
- Include `WORKLIN_CONTEXT_HANDOFF.md` in feature PRs unless the user asks for a handoff update.
- Use `git add -A` when unrelated files exist.
- Force push unless explicitly approved.
- Delete/apply/drop stashes unless explicitly requested.
- Revert user changes unless explicitly requested.
- Use destructive commands such as `git reset --hard` unless explicitly approved.

## Local Working Tree Rules

`WORKLIN_CONTEXT_HANDOFF.md` is a tracked repo document. Keep it out of normal feature PRs unless the user explicitly asks for handoff/context maintenance.

There is one known local stash:

```text
stash@{0}: On feature/approval-gate-v0: approval-gate-v0-wip
```

That stash contains unfinished Approval Gate v0 work from before the user pivoted to Approval Intent -> Auto Draft. Do not drop, apply, or inspect it unless the user explicitly asks.

## Database Rules

Use the clean local DB:

```text
worklin_dev_clean
```

Do:

- Use proper Prisma migrations for schema changes.
- Prefer additive migrations.
- Run migration verification when schema changes:

```bash
npx prisma validate --config prisma.config.ts
npx prisma generate --config prisma.config.ts
npx prisma migrate deploy --config prisma.config.ts
```

Do not:

- Mutate or reset the old drifted DB `retention_ai`.
- Use `prisma db push` unless explicitly approved.
- Use `prisma db execute` unless explicitly approved.
- Use `prisma migrate reset` unless explicitly approved.
- Hide drift by making manual database changes.

Known old DB drift symptom:

```text
ERROR: column "storeId" does not exist
```

## API And Error Handling Rules

Do:

- Use defensive validation.
- Use `try/catch` in API routes.
- Return safe JSON.
- Return `400` for bad input/config.
- Return `404` for missing resources.
- Return safe `500` for unexpected server errors.
- Prefer empty arrays/objects and caveats over crashes when data is missing.
- Reuse existing shared helpers when possible.

Do not:

- Leak raw Prisma errors or secrets to clients.
- Assume optional records exist.
- Let malformed JSON or missing data crash an endpoint.
- Break existing routes while adding new ones.

## Testing Rules

Do:

- Run `npm run build` before PR.
- Run relevant API smoke tests.
- If schema changed, run Prisma validate/generate/migrate deploy.
- Start a local dev server when testing API/UI behavior.
- Report skipped tests or environmental blockers.

Known build note:

- `npm run build` may fail in a sandbox because Next/font tries to fetch Google Fonts.
- If that happens, rerun build with network access rather than changing app code.

## Secret And Environment Rules

Do:

- Use env vars from local `.env` only at runtime.
- Keep all API keys server-side.
- Use presence checks rather than printing secret values.
- Before committing, scan staged changes for secrets.

Do not:

- Print API keys or tokens.
- Commit `.env` or `.env.local`.
- Expose Klaviyo, Shopify, OpenAI, Anthropic, Groq, GitHub, or database credentials to the client.
- Put secrets in PR descriptions, logs, screenshots, or final answers.

Suggested staged secret scan:

```bash
git diff --cached > /tmp/worklin-staged.diff
rg -n "(?i)(api[_-]?key|secret|token|password|authorization|bearer|github_pat|ghp_|sk-[A-Za-z0-9])" /tmp/worklin-staged.diff
rg -n '^[+].*(API_KEY|SECRET|TOKEN|PASSWORD|AUTH).*=[[:space:]]*["'\"'][^"'\"']{4,}' /tmp/worklin-staged.diff
```

## Feature Discipline

Worklin should keep moving in useful, safe increments:

- Build backend truth layers before UI polish when the audit engine needs them.
- Keep v0 features deterministic and fallback-based unless live AI is explicitly requested and guarded.
- Use Product Performance Intelligence, Flow Audit, Campaign Audit, and future Segment Audit as reusable substrate for Retention Audit Workflow v0.
- Use Audit Insight Framework for all new audit findings so outputs are ranked, evidenced, caveated, and chart-ready.
- Preserve existing `/agent`, `/agent/workflows`, `/planner`, Klaviyo, product, flow, campaign, and performance routes while adding new features.
- Do not add scheduling, sending, autopilot, external live actions, PDF ingestion, Slack automation, or Klaviyo flow creation until explicitly requested.
