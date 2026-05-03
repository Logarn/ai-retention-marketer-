# Worklin AI Handoff Context

Use this file to start a new Codex/chat session with enough context to continue Worklin AI without rereading the whole prior thread.

Last updated: 2026-05-04

## Product Summary

Worklin AI is an autonomous retention marketer for Shopify/DTC brands.

The app helps lifecycle/CRM teams turn Shopify data, Klaviyo data, brand knowledge, campaign history, and performance memory into:

- campaign plans
- design-ready creative briefs
- QA/preflight results
- approved Klaviyo draft campaigns
- lifecycle flow coverage and recommendation plans
- later: flow creation, scheduling, Slack, deeper agent autonomy, and gated autopilot

Important naming note:

- The old product name was Oscar.
- Do not use Oscar in product copy or implementation notes.
- Use Worklin AI / Worklin.

## Final Chat 3 Handoff Snapshot

This is the current handoff state after the Chat 3 build sequence.

Current local status:

```text
branch: main
remote: origin/main
status: main is up to date with origin/main
latest local main commit: c5e921c Klaviyo Performance Read v0 (#28)
pending work: WORKLIN_CONTEXT_HANDOFF.md modified and unstaged
stash: approval-gate-v0-wip still exists and has not been touched
```

Merged Chat 3 PRs:

- PR #21: LLM Provider Router v0
- PR #22: LLM Intent Parser v0
- PR #23: Playbook-aware Brief Generation v0
- PR #24: Klaviyo Flow Read + Detection v0
- PR #25: Flow Planner v0
- PR #26: Flow Planner Agent Command Integration
- PR #27: Klaviyo Flow Detail Read v0
- PR #28: Klaviyo Performance Read v0

Current architecture spine:

```text
/agent Chat
  -> RAG Context Layer
  -> LLM Provider Router
  -> LLM Intent Parser
  -> Deterministic Command Router
  -> Tool Registry
  -> Campaign Workflow: Planner -> Playbook-aware Brief Generator -> QA -> Approval Intent -> Klaviyo Draft Creation
  -> Lifecycle Flow Workflow: Klaviyo Flow Read -> Flow Detection -> Flow Planner -> Agent Command Response
  -> Performance Read Layer: Klaviyo campaign/flow/segment reporting reads for future audits
```

Current safety rules:

- Klaviyo campaign creation is draft-only.
- No scheduling.
- No sending.
- Klaviyo flow reads are read-only.
- Klaviyo performance reads are read-only.
- No Klaviyo flow creation, update, delete, schedule, or send behavior exists yet.
- LLM interprets; deterministic router executes.
- LLM output must never directly trigger Klaviyo drafts or external actions.
- Agent approval means draft creation only, never send/schedule.
- Failed-QA briefs are held. Warning briefs are held unless explicitly included.
- Provider keys and Klaviyo keys stay server-only and must never be printed or returned.

Audit strategy lesson:

Worklin audits should follow the real retention audit structure:

```text
Product truth -> campaign truth -> flow truth -> segment truth -> lifecycle placement -> prioritized actions
```

This matters because Worklin should not jump directly from raw Klaviyo data to generic recommendations. A serious retention audit starts by understanding what the product actually is, what campaigns have actually done, what flows actually exist and contain, which segments/audiences matter, where each asset sits in the customer lifecycle, and only then recommends prioritized action.

Stable next roadmap:

1. Product Performance Intelligence v0
2. Audit Insight Framework v0
3. Flow Audit v0
4. Campaign Audit v0
5. Segment/Audience Audit v0
6. Retention Audit Workflow v0
7. Tool Execution Runtime v0
8. Action Log v0
9. Web Research Tool v0
10. Results Ingestion + Learning Loop
11. Heartbeats / Scheduled Checks
12. Durable Approval State
13. Sub-agents / Child Workflows

## Current Product Spine

The product now has a clear backend spine:

1. Local data foundation
   - Seeded Prisma/Postgres data for customers, campaigns, segments, products, Brain/brand guidance, and memory.
   - Clean local DB should be `worklin_dev_clean`.

2. Campaign Memory
   - Stores campaign results, segments, subject lines, revenue, and lessons.
   - Gives planning a durable memory layer.

3. Playbook Engine
   - Static, typed lifecycle and campaign playbooks.
   - Planner can attach `playbookId` and `playbookName` to matching recommendations.

4. Tool Registry
   - Static metadata registry of agent-callable Worklin tools.
   - Defines tool names, descriptions, categories, permission levels, risk levels, approval requirements, and backing routes.
   - Now includes `flows.recommend` as a read-only flow planning tool.

5. RAG Context Layer
   - Deterministic, non-vector context retrieval for agent commands.
   - Pulls from Brand Brain/profile/rules, Campaign Memory, playbooks, recent workflows, referenced workflow runs, Klaviyo drafts, briefs, and plans.

6. LLM Provider Router
   - Server-only provider abstraction for future AI-assisted Worklin features.
   - Supports Groq/Grok, OpenRouter, Gemini, DeepSeek, Mistral, Cohere, Eden AI, and mock fallback.
   - Provides `generateText`, `generateJson`, and `generateStructured`.
   - Existing AI/Groq routes remain preserved; this layer is opt-in for new features.

7. LLM Intent Parser
   - Server-only parser that can interpret messy chat into structured Worklin intents.
   - Uses the LLM Provider Router when available and deterministic parsing as fallback.
   - Builds RAG context before parsing when useful.
   - Important safety boundary: the LLM interprets; the deterministic command router validates and executes.

8. Planner
   - Creates saved `CampaignPlan` and `CampaignPlanItem` records.
   - Uses local data, Campaign Memory, Brain context where available, constraints, and playbooks.

9. Brief Generator
   - Turns a plan item into a saved structured `CampaignBrief` with sections.
   - Deterministic and local-first.
   - Now uses plan item playbook metadata when available to shape brief sections, guidance, and metadata.

10. QA Engine
   - Runs deterministic checks on briefs before they move toward Klaviyo.
   - Includes Brain/brand guideline checks.

11. Agent Orchestrator
   - Runs Plan -> Brief -> QA from one user request.
   - Persists output in `WorkflowRun`.

12. Context-Aware Agent Command Router
   - Maps natural-language commands to existing Worklin tools/workflows.
   - Supports planning workflows, approval/draft creation, workflow list/detail, playbook list, and safe clarification.
   - Builds deterministic context before routing valid command requests.
   - Optionally consults the LLM Intent Parser before routing.
   - Still owns validation and execution; LLM output never executes tools directly.
   - Includes compact context summaries in command responses.

13. Agent Chat Integration
   - `/agent` now routes normal typed messages through `POST /api/agent/command`.
   - Command router responses are saved into the existing chat history.
   - Workflow links open `/agent/workflows?workflowId=...`.
   - Document upload still uses the existing `/api/agent/chat` stream path.

14. Agent Canvas
   - `/agent/workflows` lets a user run and reopen saved workflows.
   - Existing `/agent` experience must remain preserved.
   - Query-param workflow links can open a referenced workflow directly.

15. Klaviyo Draft Creation
   - Creates real Klaviyo templates and draft campaigns from Worklin briefs.
   - Draft-only. Never schedules or sends.

16. Approval Intent -> Auto Draft
   - User approval phrases can create Klaviyo drafts for eligible QA-passed briefs in a completed workflow.
   - Duplicate, warning, failed, ambiguous, send, and schedule cases are guarded.

17. Klaviyo Flow Read + Detection
   - Reads real Klaviyo flows from the connected demo account through Klaviyo's `/flows` API.
   - Maps detected flows to Worklin lifecycle flow playbooks such as welcome, site abandon, browse abandon, cart abandon, checkout abandon, replenishment, and winback.
   - Returns covered/detected flows, unknown flows, missing core flows, and draft/inactive flows.
   - Read-only only. No Klaviyo flow creation, updates, deletion, scheduling, or sending.

18. Flow Planner
   - Backend-only recommendation engine on top of Klaviyo Flow Read + Detection and Worklin flow playbooks.
   - Recommends lifecycle flow actions:
     - `build`
     - `audit`
     - `finish_or_activate`
     - `monitor_replacement`
     - `consolidate`
     - `classify`
     - `ignore_or_cleanup`
   - Distinguishes active covered flows, missing core flows, draft/inactive mapped candidates, replacement candidates, duplicate active flows, unknown meaningful-trigger flows, and unconfigured/stale drafts.
   - Persists successful recommendations as `WorkflowRun` type `flow-recommendation` on a best-effort basis.
   - Read-only only. It does not create Klaviyo flows yet.

19. Flow Planner Agent Command Integration
   - Agent intent parsing and deterministic command routing now recognize lifecycle-flow audit/planning requests.
   - Routes phrases such as "Audit my flows", "What lifecycle flows are missing?", "Recover abandoned checkouts", and "Increase repeat purchases with flows" to the existing Flow Planner.
   - Keeps `show recent workflows`, workflow detail, campaign planning, approval, and send/schedule refusal behavior intact.
   - Returns `intent: recommend_flows`, `tool: flows.recommend`, context summary, and Flow Planner result buckets.

20. Klaviyo Flow Detail Read
   - Adds read-only deeper flow detail fetching for existing Klaviyo flows.
   - Supports `GET /api/klaviyo/flows/[flowId]`.
   - `GET /api/klaviyo/flows?includeDetails=true` can include normalized flow details when needed.
   - Normalizes actions, messages, channel/type, timing/delay where available, subject/name/status where available, created/updated, and safe relationship/detail fields.
   - Read-only only. No Klaviyo flow creation, updates, deletion, scheduling, or sending.

21. Klaviyo Performance Read
   - Adds a read-only performance data layer for Klaviyo campaign, flow, and ID-scoped segment reporting.
   - Supports `POST /api/klaviyo/performance`.
   - Uses Klaviyo values-report endpoints where available:
     - `/api/flow-values-reports`
     - `/api/campaign-values-reports`
     - `/api/segment-values-reports`
   - Normalizes report rows into `id`, `name`, `type`, `channel`, `timeframe`, `statistics`, `rawAvailable`, `missingMetrics`, and `source`.
   - Uses request `conversionMetricId` first, then `KLAVIYO_CONVERSION_METRIC_ID` when flow/campaign conversion statistics require it.
   - Read-only only. No CSV downloads, scheduling, sending, or Klaviyo writes.

What this means:

```text
/agent Chat -> Context -> LLM Intent Parser -> Deterministic Command Router -> Agent Workflow -> Plan -> Briefs -> QA -> Approval Intent -> Klaviyo Drafts
                                                          \
                                                           -> Flow Planner -> Klaviyo Flow Read/Detection/Detail -> Worklin Flow Recommendations
                                                           -> Klaviyo Performance Read -> Future Retention Audits
```

The product can now accept chat commands in `/agent`, retrieve useful local context, optionally interpret messy user language through an LLM parser, route structured intents through deterministic guardrails, produce campaign recommendations, generate briefs, preflight them, save the workflow, reopen workflow links in the canvas, and create real Klaviyo draft campaigns under guardrails.

Worklin can also read the connected Klaviyo account's existing lifecycle flows, map them to Worklin flow playbooks, detect covered/missing/unknown/draft flow states, fetch deeper flow details, and recommend which lifecycle flows to build, audit, finish, classify, consolidate, monitor, or clean up. This flow layer is strictly read-only for now.

Worklin can now read normalized Klaviyo campaign/flow/segment performance data for future audit features. Performance reads are also strictly read-only.

## Repository

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
- Vercel target later

## Current Local State

At the time this handoff was written:

```text
branch: main
remote: origin/main
status: main is up to date after merging PR #28
latest pulled commit: c5e921c Klaviyo Performance Read v0 (#28)
pending work: WORKLIN_CONTEXT_HANDOFF.md modified and unstaged
```

`WORKLIN_CONTEXT_HANDOFF.md` is now a tracked repo document. Keep it out of normal feature PRs unless the user explicitly asks for a handoff/context update.

There is also one local stash:

```text
stash@{0}: On feature/approval-gate-v0: approval-gate-v0-wip
```

That stash contains unfinished Approval Gate v0 work from before the user pivoted to Approval Intent Auto Draft. Do not drop or apply it casually. If resuming Approval Gate, inspect it carefully and expect possible conflicts with newer merged work.

## Non-Negotiable Rules

This section is the most important part of the handoff. A fresh Codex/chat session should follow these rules before doing any work.

### Product And Naming Rules

Do:

- Use the product name `Worklin AI` or `Worklin`.
- Treat Worklin as an autonomous retention marketer for Shopify/DTC brands.
- Keep humans in control through approvals and safe review steps.
- Prefer incremental feature-by-feature delivery.
- Test locally before asking the user to test.
- Keep the scope tight to the requested feature.

Do not:

- Use the old name `Oscar` in UI copy, PR descriptions, comments, docs, or new code.
- Build the full autonomous agent when the user asks for a narrow v0 feature.
- Add scheduling, sending, or autopilot behavior unless explicitly requested.
- Add UI unless the user asks for UI or it is clearly part of the requested feature.
- Rewrite large parts of the app to solve a small issue.

Why:

Worklin is being built step by step. The user wants each feature tested locally, deployed/merged safely, and only then expanded.

### Git Workflow Rules

Do:

- Always work from latest `main`.
- Always create a new feature branch for a new feature.
- Use branch names exactly like the user requests, usually:

```text
feature/<short-feature-name>
```

- Commit with a clear message.
- Push the feature branch.
- Open a draft PR unless the user asks for ready-for-review.
- Include verification steps in every PR description.
- Wait for the user to explicitly approve merge.
- After merge approval:
  - mark draft PR ready if needed
  - merge
  - checkout `main`
  - pull latest `main`
  - delete the local feature branch if safe

Do not:

- Work directly on `main`.
- Merge a PR unless the user explicitly says something like `approved to merge`.
- Force push unless the user explicitly approves it.
- Commit unrelated files.
- Use `git add -A` when the worktree has unrelated/untracked files.
- Delete local files or folders unless explicitly requested.
- Delete or apply stashes unless explicitly requested.
- Revert user changes unless explicitly requested.

Why:

The user is using PRs as the safety boundary. Every feature must be reviewable, testable, and reversible.

### Local Working Tree Rules

Do:

- Start with `git status --short --branch`.
- Notice untracked or unrelated files.
- Stage only files related to the current feature.
- Do not include `WORKLIN_CONTEXT_HANDOFF.md` in product feature PRs unless the user asks for a handoff/context update.
- Preserve the stash `approval-gate-v0-wip` unless the user asks to resume or delete it.

Do not:

- Include `WORKLIN_CONTEXT_HANDOFF.md` in feature PRs unless specifically asked.
- Touch `.env`, `.env.local`, `node_modules`, `.next`, logs, cache files, or local DB files.
- Clean the worktree aggressively.
- Use destructive commands like `git reset --hard` or `git checkout -- <file>` unless explicitly approved.

Why:

There may be local-only files and WIP from earlier feature pivots. Losing them would damage continuity.

### Secret And Environment Rules

Do:

- Use env vars from local `.env` only at runtime.
- Keep all API keys server-side.
- Use presence checks rather than printing secret values.
- Before committing, scan staged changes for secrets.
- Confirm `.env` and `.env.local` are ignored/untracked when relevant.

Do not:

- Print API keys or tokens.
- Commit `.env` or `.env.local`.
- Commit placeholder files with real credentials.
- Expose Klaviyo, Shopify, OpenAI, Anthropic, Groq, GitHub, or database credentials to the client.
- Put secrets in PR descriptions, logs, screenshots, or final answers.

Staged secret scan:

```bash
git diff --cached > /tmp/worklin-staged.diff
rg -n "(?i)(api[_-]?key|secret|token|password|authorization|bearer|github_pat|ghp_|sk-[A-Za-z0-9])" /tmp/worklin-staged.diff
rg -n '^[+].*(API_KEY|SECRET|TOKEN|PASSWORD|AUTH).*=[[:space:]]*["'\"'][^"'\"']{4,}' /tmp/worklin-staged.diff
```

Why:

This repo uses live/local integrations. Accidentally committing a key would be a serious security issue.

### Database Rules

Do:

- Use the clean local DB:

```text
worklin_dev_clean
```

- Use proper Prisma migrations for schema changes.
- Prefer additive migrations.
- Run migration verification when schema changes:

```bash
npx prisma validate --config prisma.config.ts
npx prisma generate --config prisma.config.ts
npx prisma migrate deploy --config prisma.config.ts
```

- Stop and report if drift appears.
- Explain any model/table mismatch before proposing a fix.

Do not:

- Mutate or reset the old drifted DB `retention_ai`.
- Use `prisma db push` unless explicitly approved.
- Use `prisma db execute` unless explicitly approved.
- Use `prisma migrate reset` unless explicitly approved.
- Drop, rename, or destructively alter tables/columns without calling it out first.
- Hide drift by making manual database changes.

Known old DB drift symptom:

```text
ERROR: column "storeId" does not exist
```

Why:

The project previously had migration drift. The clean migration path is now part of the project discipline.

### Klaviyo Rules

Do:

- Keep Klaviyo behavior draft-only.
- Require `KLAVIYO_DRAFT_ONLY=true`.
- Check QA and local eligibility before creating drafts.
- Persist draft IDs in `KlaviyoDraft`.
- Confirm created Klaviyo campaigns are still `Draft`.
- Confirm `scheduledAt` and `sendTime` are null when doing real Klaviyo verification.
- Treat Klaviyo flow read/detail endpoints as read-only.
- Treat Klaviyo performance/reporting endpoints as read-only.

Do not:

- Send a campaign.
- Schedule a campaign.
- Create, update, delete, schedule, or send Klaviyo flows.
- Build autopilot scheduling unless explicitly requested.
- Print Klaviyo API keys.
- Expose Klaviyo API calls client-side.
- Create duplicate drafts for the same brief when a local `KlaviyoDraft` already exists.

Why:

Worklin is currently safe in draft-only mode. Human review remains required before anything gets near scheduling/sending.

### Approval And Agent Rules

Do:

- Treat agent approval commands as permission to create drafts only.
- Require clear workflow context for workflow-level approval.
- Use `WorkflowRun` records to identify the relevant plan/brief/QA outputs.
- Draft only QA-passed briefs by default.
- Hold warning briefs unless the user explicitly says to include warnings.
- Always hold failed-QA briefs.
- Refuse send/schedule language with a clear draft-only explanation.
- Use the Tool Registry as the metadata source for future agent-callable actions.
- Use the RAG Context Layer for deterministic context retrieval when command behavior needs brand/playbook/memory/workflow context.
- Use the LLM Intent Parser only to classify and structure user intent.
- Keep execution controlled by the deterministic command router and tool/permission guardrails.
- Treat provider failures, missing keys, invalid LLM output, and low-confidence parser results as normal deterministic fallback cases.

Do not:

- Treat `send it` or `schedule it` as permission to send/schedule.
- Create drafts for failed-QA briefs.
- Create drafts for ambiguous approval when no workflow is referenced.
- Create duplicate drafts on repeated approval.
- Execute `external_live_action` tools.
- Treat context retrieval as permission to act externally.
- Treat LLM parser output as permission to create drafts, schedule, send, or call external systems.

Why:

This is the current guardrail layer that lets Worklin act quickly without becoming unsafe.

### API And Error Handling Rules

Do:

- Use defensive validation.
- Use `try/catch` in API routes.
- Return safe JSON.
- Return `400` for bad input.
- Return `404` for missing resources.
- Return safe `500` for unexpected server errors.
- Prefer empty arrays/objects over crashes when data is missing.
- Reuse existing shared helpers when possible.

Do not:

- Leak raw Prisma errors or secrets to clients.
- Assume optional records exist.
- Let malformed JSON or missing data crash an endpoint.
- Break existing routes while adding new ones.

Why:

The dashboard and agent UI depend on API stability. A single crashing route can break large parts of the app.

### Testing Rules

Do:

- Run `npm run build` before PR.
- Run relevant API smoke tests.
- If schema changed, run Prisma validate/generate/migrate deploy.
- Start local dev server when testing API/UI behavior.
- Stop local dev server after tests if it is no longer needed.
- Report any skipped test or environmental issue.

Do not:

- Claim a route works without testing it when a local test is feasible.
- Ignore build failures.
- Change code to work around sandbox-only network failures unless the code itself is wrong.

Known build note:

- `npm run build` may fail in a sandbox because Next/font tries to fetch Google Fonts.
- If that happens, rerun build with network access rather than changing app code.

Why:

The user tests locally and deploys to Vercel. Build and API smoke tests reduce churn.

### Frontend/UI Rules

Do:

- Preserve existing `/agent`, `/agent/workflows`, and `/planner` behavior.
- Keep UI changes simple and scoped.
- Add loading, empty, and error states when building UI.
- Use existing app styling/components where possible.

Do not:

- Replace an existing module unless the user explicitly asks.
- Break `/planner` while working on `/agent`.
- Add large UI surfaces when the requested feature is backend-only.
- Make `/planner` more crowded without a clear product reason.

Known UI debt:

- `/planner` works but is crowded. Later simplify with spacing, hierarchy, and progressive disclosure.

Why:

One previous PR accidentally replaced `/agent` and destabilized `/planner`. Avoid repeating that pattern.

### Scope Rules

Do:

- Keep v0 features deterministic and fallback-based unless the user explicitly asks for live AI.
- Prefer local seeded data and existing Prisma data.
- Be creative only where it improves the requested architecture.

Do not:

- Add new live LLM-dependent execution paths unless explicitly requested and guarded.
- Let LLM output bypass deterministic routing, approvals, QA, or Klaviyo draft-only rules.
- Add PDF ingestion until explicitly requested.
- Add Klaviyo flow creation until explicitly requested.
- Add Slack automation until explicitly requested.
- Add schema changes unless they are truly needed.

Why:

The product is intentionally being built in thin, testable layers.

## Current Main Status

Current expected repo state:

- `main` includes PR #12 through PR #28.
- The most recent merged layers are PR #26 Flow Planner Agent Command Integration, PR #27 Klaviyo Flow Detail Read v0, and PR #28 Klaviyo Performance Read v0.
- Local `main` has been pulled after PR #28.
- Latest pulled commit: `c5e921c Klaviyo Performance Read v0 (#28)`.
- Local feature branches through `feature/klaviyo-performance-read-v0` were safely deleted after merge when their diffs were present on `main`.
- There is no active feature branch unless a new chat creates one.
- `WORKLIN_CONTEXT_HANDOFF.md` is tracked; update it only when the user asks for handoff/context maintenance.
- The local stash `approval-gate-v0-wip` still exists and should not be touched casually.

Main now includes:

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

Current safety posture:

- Worklin can create real Klaviyo draft campaigns.
- Worklin must not schedule or send.
- Worklin can read real Klaviyo flows.
- Worklin can fetch read-only normalized Klaviyo flow details.
- Worklin can fetch read-only normalized Klaviyo campaign/flow/segment performance reports.
- Worklin can map real Klaviyo flows to Worklin flow playbooks.
- Worklin can recommend lifecycle flow build/audit/finish/classify/consolidate/cleanup actions.
- Flow work is read-only only. Worklin must not create, update, delete, schedule, or send Klaviyo flows yet.
- Performance/reporting work is read-only only. Worklin must not mutate Klaviyo objects while reading performance.
- Agent approval means draft creation only.
- Failed-QA briefs are held.
- Warning briefs are held unless explicitly included.
- Natural-language commands are deterministic and must clarify when intent is ambiguous.
- LLM intent parsing can interpret messy language, but it does not execute tools.
- Safety rule: LLM interprets; deterministic router validates and executes.
- Provider router calls are server-only; provider keys must never be exposed to clients or logs.
- Missing/failed providers and malformed LLM output must safely fall back.
- Context retrieval is deterministic and local-data-only; there are no embeddings/vector DB/LangChain/LangGraph dependencies yet.
- `/agent` chat commands now use the context-aware command router while preserving chat history.
- `/agent/workflows?workflowId=...` opens linked workflows in the existing canvas.
- The next feature should start from `main` with a fresh `feature/<short-feature-name>` branch.

## Recently Merged PRs

### PR #28: Klaviyo Performance Read v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/28
```

Adds:

- `lib/klaviyo-performance.ts`
- `POST /api/klaviyo/performance`
- `.env.example` placeholder `KLAVIYO_CONVERSION_METRIC_ID=""`

Behavior:

- Adds a read-only Klaviyo performance data layer for future audits.
- Supports `flow`, `campaign`, and ID-scoped `segment` report requests.
- Uses Klaviyo Reporting API values-report endpoints where available:
  - `/api/flow-values-reports`
  - `/api/campaign-values-reports`
  - `/api/segment-values-reports`
- Supports audit windows:
  - `last_30_days`
  - `last_90_days`
  - `last_365_days`
  - `lifetime` as provider-capped historical context
  - `custom`
- Normalizes report rows into:
  - `id`
  - `name`
  - `type`
  - `channel`
  - `timeframe`
  - `statistics`
  - `rawAvailable`
  - `missingMetrics`
  - `source`
- Uses request `conversionMetricId` first, then `KLAVIYO_CONVERSION_METRIC_ID` when conversion reporting requires it.
- Missing conversion metric for flow/campaign reports returns safe `400`.

Safety:

- Read-only only.
- No Klaviyo writes.
- No CSV downloads in v0.
- No scheduling.
- No sending.
- No schema changes.
- No UI.

Verification run for PR #28:

```bash
npm run build
POST /api/klaviyo/performance with invalid type returns safe 400
POST /api/klaviyo/performance with flow last_365_days returns safe 400 when conversion metric is missing
POST /api/klaviyo/performance with campaign last_365_days returns safe 400 when conversion metric is missing
POST /api/klaviyo/performance with flow last_30_days returns safe 400 when conversion metric is missing
GET /api/klaviyo/flows still works
GET /api/klaviyo/flows/[flowId] still works
POST /api/flows/recommend still works
Confirm Klaviyo flow count unchanged
Confirm Klaviyo draft count unchanged
Staged secret scan
```

### PR #27: Klaviyo Flow Detail Read v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/27
```

Adds/updates:

- Extends `lib/klaviyo-flows.ts` with read-only flow detail/action/message helpers.
- Adds `GET /api/klaviyo/flows/[flowId]`.
- Adds optional `includeDetails=true` support to `GET /api/klaviyo/flows`.

Behavior:

- Fetches deeper detail for existing Klaviyo flows.
- Normalizes:
  - flow id/name/status/trigger
  - actions
  - messages
  - channel/type where available
  - timing/delay where available
  - subject/name/status where available
  - created/updated
  - safe definition/relationship detail where useful
- Missing flow returns `404`.
- Missing/invalid config returns safe `400`.
- `401`/`403` permission issues return safe `400` with a flows-read permission message.

Safety:

- Read-only only.
- No Klaviyo flow creation.
- No Klaviyo flow updates or deletes.
- No scheduling.
- No sending.
- No schema changes.
- No UI.

Verification run for PR #27:

```bash
npm run build
GET /api/klaviyo/flows still works
GET /api/klaviyo/flows/[realFlowId] returns normalized detail
Fake flow id returns 404 or safe provider error
POST /api/flows/detect still works
POST /api/flows/recommend still works
Confirm Klaviyo draft count unchanged
Confirm Klaviyo flow count unchanged
Staged secret scan
```

### PR #26: Flow Planner Agent Command Integration v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/26
```

Adds/updates:

- Adds/updates the `recommend_flows` intent path.
- Updates LLM intent parser classification for lifecycle flow audit/planning language.
- Updates `POST /api/agent/command` so flow recommendation requests call the existing Flow Planner.
- Preserves existing Tool Registry metadata for `flows.recommend`.

Behavior:

- Routes these examples to Flow Planner:
  - "Audit my flows"
  - "What lifecycle flows are missing?"
  - "What flows should I build next?"
  - "What should I fix in Klaviyo flows?"
  - "Recover abandoned checkouts"
  - "Increase repeat purchases with flows"
  - "What automations should this brand have?"
- Does not confuse flow requests with:
  - "show recent workflows" -> workflow list
  - "open this workflow" -> workflow detail
  - "plan campaigns" -> Plan -> Brief -> QA
- Flow command responses include:
  - `intent: recommend_flows`
  - `tool: flows.recommend`
  - `contextSummary`
  - Flow Planner `recommendations`
  - `coveredFlows`
  - `missingCoreFlows`
  - `unknownFlows`
  - `summary`
  - `workflowId` when persisted

Safety:

- Flow Planner remains read-only.
- No Klaviyo writes.
- No flow creation.
- No scheduling.
- No sending.
- Send/schedule language remains refused.
- Approval behavior does not change.
- No schema changes.
- No UI changes.

Verification run for PR #26:

```bash
npm run build
POST /api/agent/intent with flow audit/planning examples
POST /api/agent/intent with recent workflow, campaign planning, and send examples
POST /api/agent/command with flow audit/planning examples
POST /api/agent/command with recent workflow and send examples
Confirm flow requests route to /api/flows/recommend
Confirm recent workflow requests still route to workflow.list
Confirm campaign planning still routes to plan_brief_qa
Confirm send/schedule still refused
Confirm Klaviyo draft and flow counts do not change
Staged secret scan
```

### PR #25: Flow Planner v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/25
```

Adds:

- `lib/flows/recommend-flow-plan.ts`
- `POST /api/flows/recommend`
- `flows.recommend` Tool Registry metadata
- Best-effort `WorkflowRun` persistence with type `flow-recommendation`

Behavior:

- Reads current Klaviyo flows through the existing read-only flow detection layer.
- Uses detected flows, unknown flows, missing core flows, draft/inactive flows, and Worklin flow playbooks.
- Recommends lifecycle flow actions:
  - `build`
  - `audit`
  - `finish_or_activate`
  - `monitor_replacement`
  - `consolidate`
  - `classify`
  - `ignore_or_cleanup`
- Prioritizes checkout/cart recovery, welcome/onboarding, replenishment, winback, and browse/site abandon based on account state and goal text.
- Marks active detected flows as covered instead of missing.
- Classifies draft/inactive flows carefully:
  - Active flow plus mapped draft -> replacement/overhaul candidate.
  - Mapped draft without active flow -> finish-or-activate candidate.
  - Multiple active flows for one playbook -> consolidation audit.
  - Unknown meaningful-trigger flow -> manual classification.
  - Unconfigured/stale draft -> cleanup/ignore candidate.
- Includes confidence and evidence so recommendations do not overstate certainty.

Safety:

- Read-only only.
- No Klaviyo flow creation.
- No Klaviyo flow updates or deletes.
- No scheduling.
- No sending.
- Missing Klaviyo flow read config returns safe `400`.
- No schema changes.
- No UI.

Verification run for PR #25:

```bash
npm run build
POST /api/flows/recommend with empty body
POST /api/flows/recommend with goal "recover abandoned checkouts"
POST /api/flows/recommend with goal "increase repeat purchase"
Confirm active detected flows are not recommended as missing
Confirm draft/inactive/unknown flows are classified with careful actions
Confirm missing core flows are recommended to build
Confirm no Klaviyo drafts or flows are created
Staged secret scan
```

### PR #24: Klaviyo Flow Read + Detection v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/24
```

Adds:

- `lib/klaviyo-flows.ts`
- `lib/flows/detect-existing-flows.ts`
- `GET /api/klaviyo/flows`
- `POST /api/flows/detect`

Behavior:

- Reads real Klaviyo flows from the connected demo account using Klaviyo's `/flows` API.
- Returns useful normalized flow fields:
  - `id`
  - `name`
  - `status`
  - `archived`
  - `created`
  - `updated`
  - `triggerType`
  - `definition` when available
  - action count/actions when available in v0 shape
- Maps Klaviyo flows to Worklin lifecycle flow playbooks:
  - `welcome_series`
  - `site_abandon`
  - `browse_abandon`
  - `cart_abandon`
  - `checkout_abandon`
  - `replenishment`
  - `winback`
- Returns `detectedFlows`, `unknownFlows`, `missingCoreFlows`, `draftOrInactiveFlows`, and a summary.

Safety:

- Read-only only.
- No Klaviyo flow creation.
- No Klaviyo flow updates or deletes.
- No scheduling.
- No sending.
- Requires `KLAVIYO_DRAFT_ONLY=true` as part of flow-read config.
- Missing config or missing `flows:read` access returns safe JSON.
- Secrets are never returned.

Verification run for PR #24:

```bash
npm run build
GET /api/klaviyo/flows
POST /api/flows/detect
Confirm detected/missing/unknown/draft flow buckets are returned
Confirm no Klaviyo writes occurred
Staged secret scan
```

### PR #23: Playbook-aware Brief Generation v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/23
```

Adds/updates:

- `app/api/briefs/shared.ts`
- Brief generation resolves `CampaignPlanItem.metadata.playbookId` through `getPlaybookById`
- Compact playbook metadata is written into `CampaignBrief.metadata.playbook`

Behavior:

- Plan item metadata now reaches the brief source metadata path.
- Explicit request payload metadata can still override plan item metadata.
- Campaign playbooks shape subject lines, preview text, angle, sections, CTAs, and design notes.
- Flow playbooks can shape brief sections with sequence/timing guidance without creating Klaviyo flows.
- Brief section structure/order stays compatible with existing UI and QA.
- No-playbook/manual brief generation keeps the existing deterministic fallback shape.

Campaign playbook direction:

- VIP Early Access emphasizes exclusivity, access, gratitude, product clarity, and avoiding unnecessary discounts.
- Product Spotlight emphasizes product value, proof, use case, and clear CTA.
- At-risk Winback emphasizes newness, value, empathy, and controlled reactivation.
- No-discount Education avoids discount framing and leans on teaching, proof, and value.

Safety:

- No schema changes.
- No UI.
- No new Klaviyo behavior.
- No scheduling or sending.
- Fallback deterministic behavior preserved.

Verification run for PR #23:

```bash
npm run build
Generate workflow with "Plan 3 campaigns for next week. No discounts."
Confirm generated briefs include playbook metadata when plan items have playbooks
Confirm sections reflect playbook guidance
Generate a manual/no-playbook brief and confirm fallback still works
Run QA on generated briefs
Confirm no Klaviyo drafts are created unless explicit approval flow is used
Staged secret scan
```

### PR #22: LLM Intent Parser v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/22
```

Adds:

- `lib/agent/intent/types.ts`
- `lib/agent/intent/parse-intent.ts`
- `POST /api/agent/intent`
- Optional parser integration inside `POST /api/agent/command`

Behavior:

- Builds existing RAG context before parsing intent when useful.
- Uses the LLM Provider Router to classify messy user chat into structured Worklin intents.
- Falls back to deterministic parsing when provider keys are missing, providers fail, LLM output is malformed, or parser confidence is too low.
- Produces structured output with:
  - `intent`
  - `confidence`
  - planning parameters such as `campaignCount`, `focus`, and `constraints`
  - workflow/playbook parameters where available
  - safety flags for send/schedule/external/approval requests
  - clarification question and short reasoning summary
- `POST /api/agent/command` can use parser output for intent and planning parameters, but still routes through existing deterministic handlers.

Safety:

- The LLM parser never executes tools directly.
- The safety boundary is: LLM interprets; deterministic router validates and executes.
- Send/schedule requests remain clarify/refusal-safe.
- Approval without `workflowId` still clarifies and surfaces recent eligible workflows.
- No new Klaviyo behavior.
- No scheduling or sending.
- No schema changes.
- No UI.

Verification run for PR #22:

```bash
npm run build
POST /api/agent/intent with:
  "Sales are slow. Put together something for next week without discounting too hard."
  "Looks good, approve the ready ones."
  "What did you make earlier?"
  "Show me flow playbooks."
  "Send it."
  "Help me."
POST /api/agent/command with the same examples
Confirm messy planning creates a local Plan -> Brief -> QA workflow
Confirm approval without workflowId clarifies
Confirm send/schedule remains refused
Confirm Klaviyo draft count does not change unless approval intent + workflowId is explicit
Confirm mock/fallback works
```

### PR #21: LLM Provider Router v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/21
```

Adds:

- Server-only `lib/llm` provider router
- Provider registry and shared router interfaces
- `generateText`
- `generateJson`
- `generateStructured`
- `POST /api/ai/router/test`
- Provider env names in `.env.example`

Provider adapters:

- Existing Groq/Grok integration via existing `groqClient` and `GROQ_MODEL`
- OpenRouter
- Google/Gemini
- DeepSeek
- Mistral
- Cohere
- Eden AI
- Mock fallback

Behavior:

- Default provider comes from `LLM_PROVIDER_DEFAULT`.
- Fallback order comes from `LLM_PROVIDER_FALLBACK_ORDER`.
- Missing provider keys are skipped safely.
- Provider/auth/credits/rate-limit/server failures can fall through to the next provider.
- Mock fallback is used only when `LLM_USE_MOCK_FALLBACK=true` or `provider: "mock"` is explicitly requested.
- Existing AI/Groq/Grok routes were preserved and not rewired.

Safety:

- Server-only.
- API keys are read from env and never returned by the test route.
- No schema changes.
- No UI.
- No agent behavior changes in PR #21.
- No Klaviyo behavior changes.

Verification run for PR #21:

```bash
npm run build
POST /api/ai/router/test with mock text
POST /api/ai/router/test with mock json
POST /api/ai/router/test with invalid provider returns 400
Route handler smoke test with blank provider keys and LLM_USE_MOCK_FALLBACK=true
Existing /api/ai/generate-subject-lines still safely falls back
Existing /api/ai/generate-message still safely falls back
Incomplete /api/ai/generate-message payload returns 400, not 500
Staged secret scan
```

### PR #20: Agent Chat Command Integration v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/20
```

Adds/updates:

- `/agent` chat UI
- `POST /api/agent/sessions/[id]` append-message support
- `/agent/workflows?workflowId=...` direct workflow opening

Behavior:

- Normal typed messages in `/agent` now call `POST /api/agent/command`.
- Command router responses are rendered in the existing chat transcript.
- Command exchanges are saved into existing `ChatSession` / `ChatMessage` history.
- Workflow responses include links to `/agent/workflows?workflowId=...`.
- The workflow canvas opens the referenced workflow when `workflowId` is provided in the URL.
- Context summaries are shown compactly in chat responses when `contextSummary` is present.
- The document upload path still uses the existing `/api/agent/chat` stream behavior.

Safety:

- No schema changes.
- No Klaviyo behavior changes.
- No scheduling or sending.
- `send it` still surfaces the command router's draft-only refusal.
- `/agent` was preserved rather than replaced.
- `/agent/workflows` and `/planner` were checked after the change.

Verification run for PR #20:

```bash
npm run build
Open /agent
Send "Plan 3 campaigns for next week. No discounts."
Confirm chat response, compact context summary, and workflow link
Send "show recent workflows"
Send "show flow playbooks"
Send "send it"
Confirm draft-only refusal
Open the generated /agent/workflows?workflowId=... link
Confirm /planner still loads
```

### PR #19: Context-Aware Command Router v1

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/19
```

Adds/updates:

- `POST /api/agent/command`

Behavior:

- Builds deterministic context from message and optional `workflowId` before routing valid command requests.
- Includes compact `contextSummary` in command responses.
- Uses context-selected playbooks for playbook requests.
- Preserves no-discount, VIP, flow, and campaign signals for planning requests.
- Approval commands use `workflowId` when provided.
- Approval language without `workflowId` clarifies and includes recent eligible completed workflows.
- Delegates approval execution to the existing draft-only approval command.

Safety:

- No schema changes.
- No UI.
- No new Klaviyo behavior.
- No scheduling or sending.
- Send/schedule language remains refused.
- Duplicate approval still skips existing local `KlaviyoDraft` records.
- Deterministic routing only; no live AI required.

Verification run for PR #19:

```bash
npm run build
POST /api/agent/command with "Plan 3 campaigns for next week. No discounts."
POST /api/agent/command with "approved" without workflowId
POST /api/agent/command with "approved" and a valid workflowId
Repeat approval for the same workflow to confirm duplicate drafts are skipped
POST /api/agent/command with "show flow playbooks"
POST /api/agent/command with "send it"
POST /api/agent/command with "help me"
```

### PR #18: RAG Context Layer v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/18
```

Adds:

- `lib/agent/context/types.ts`
- `lib/agent/context/build-context.ts`
- `POST /api/agent/context`

Behavior:

- Builds a structured context package for agent commands from existing local Worklin data.
- Includes Brand Brain/profile/rules when available.
- Includes Campaign Memory insights.
- Includes relevant playbooks based on message keywords.
- Includes recent `WorkflowRun` records.
- Includes a referenced `WorkflowRun` when `workflowId` is provided.
- Includes recent `KlaviyoDraft` records for approval/draft/Klaviyo-related prompts.
- Includes relevant recent briefs/plans where useful.
- Returns `missing` entries for unavailable optional sources instead of crashing.
- Returns `404` only when a provided `workflowId` does not exist.
- Returns `400` for empty/invalid messages.

Retrieval examples:

- `Plan a welcome flow` -> includes `welcome_series`.
- `Create no discount VIP campaigns` -> includes `vip_early_access` and `no_discount_education`.
- `Approve the latest Klaviyo drafts` -> includes recent workflows, draft records, and relevant briefs.

Important constraints:

- No schema changes.
- No UI.
- No external APIs.
- No live AI.
- No LangChain, LangGraph, vector DB, or embeddings.

Verification run for PR #18:

```bash
npm run build
POST /api/agent/context with "Plan a welcome flow"
POST /api/agent/context with "Create no discount VIP campaigns"
POST /api/agent/context with "Approve the latest Klaviyo drafts"
POST /api/agent/context with a valid workflowId
POST /api/agent/context with a fake workflowId
POST /api/agent/context with an empty message
```

### PR #17: Agent Command Router v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/17
```

Adds:

- `POST /api/agent/command`

Supported deterministic intents:

- `plan_brief_qa`
- `approve_workflow`
- `list_workflows`
- `get_workflow`
- `list_playbooks`
- `clarify`

Behavior:

- Routes natural-language user messages to existing Worklin APIs/workflows.
- Uses Tool Registry metadata where useful.
- Calls Plan -> Brief -> QA workflow for planning requests.
- Calls approval command for clear approval phrases when workflow context exists.
- Lists or opens `WorkflowRun` records.
- Lists playbooks.
- Refuses send/schedule language and explains draft-only mode.
- Clarifies ambiguous messages instead of guessing dangerously.

Safety:

- No schema changes.
- No UI.
- No scheduling.
- No sending.
- No new Klaviyo behavior.
- Deterministic routing only; no live AI required.

### PR #16: Tool Registry v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/16
```

Adds:

- `lib/agent/tools/types.ts`
- `lib/agent/tools/registry.ts`
- `GET /api/agent/tools`
- `GET /api/agent/tools/[name]`

Registered tools:

- `workflow.planBriefQa`
- `workflow.approveAndCreateDrafts`
- `klaviyo.createDraftFromBrief`
- `playbooks.list`
- `playbooks.get`
- `memory.getCampaignInsights`
- `workflow.list`
- `workflow.get`
- `brain.readBrandContext`

Tool metadata includes:

- name
- description
- category
- input/output description
- permission level
- approval requirement
- risk level
- current status
- backing route or handler reference

Permission levels:

- `read`
- `generate`
- `external_draft`
- `external_live_action`

No tool execution runtime was added in PR #16. This is registry metadata only.

### PR #14: Playbook Engine v0

Merged into `main`.

URL:

```text
https://github.com/Logarn/ai-retention-marketer-/pull/14
```

Adds:

- `lib/playbooks/types.ts`
- `lib/playbooks/campaigns.ts`
- `lib/playbooks/flows.ts`
- `lib/playbooks/index.ts`
- `GET /api/playbooks`
- `GET /api/playbooks/[id]`
- `GET /api/playbooks?type=flow`
- `GET /api/playbooks?type=campaign`
- Light Planner metadata integration: matching plan items get `playbookId` and `playbookName`.

Flow playbooks:

- `welcome_series`
- `site_abandon`
- `browse_abandon`
- `cart_abandon`
- `checkout_abandon`
- `replenishment`
- `winback`

Campaign playbooks:

- `vip_early_access`
- `product_spotlight`
- `at_risk_winback`
- `no_discount_education`

Verification run for PR #14:

```bash
npm run build
GET /api/playbooks
GET /api/playbooks/welcome_series
GET /api/playbooks?type=flow
GET /api/playbooks?type=campaign
POST /api/agent/workflows/plan-brief-qa
```

Agent workflow smoke test confirmed plan item metadata included playbooks for:

- `VIP early access` -> `vip_early_access`
- `Product spotlight` -> `product_spotlight`
- `At-risk winback` -> `at_risk_winback`

No schema changes in PR #14.

### PR #13: Approval Intent Auto Draft v0

Merged into `main`.

Adds:

- `POST /api/agent/commands/approve-workflow`
- `lib/klaviyo-draft-service.ts`
- Shared draft creation service used by:
  - `POST /api/klaviyo/drafts/from-brief`
  - `POST /api/agent/commands/approve-workflow`

Behavior:

- Detects approval phrases:
  - `approved`
  - `looks good`
  - `go ahead`
  - `approve these`
  - `approve the ready ones`
  - `ship the drafts`
- Requires a completed `plan-brief-qa` `WorkflowRun`.
- Creates Klaviyo drafts for eligible briefs in the workflow.
- Eligible means:
  - brief belongs to that workflow
  - latest QA is `passed`
  - no local `KlaviyoDraft` already exists for that brief
- Warning briefs are held unless the user explicitly says `include warnings`.
- Failed QA briefs are never drafted.
- Duplicate approval does not duplicate drafts.
- If user says `send` or `schedule`, route refuses and explains draft-only mode.

Real Klaviyo drafts were created during testing and verified as:

- Klaviyo status `Draft`
- `scheduledAt: null`
- `sendTime: null`

Nothing was scheduled or sent.

### PR #12: Klaviyo Draft Creation v0

Merged into `main`.

Adds:

- `KlaviyoDraft` Prisma model
- Migration: `20260503093000_add_klaviyo_drafts`
- `lib/klaviyo-drafts.ts`
- `POST /api/klaviyo/drafts/from-brief`
- `GET /api/klaviyo/drafts`

Behavior:

- Loads a `CampaignBrief` and sections.
- Checks latest QA.
- Creates Klaviyo HTML template.
- Creates Klaviyo email campaign draft.
- Fetches campaign message.
- Assigns template to campaign message.
- Persists returned Klaviyo IDs in `KlaviyoDraft`.
- Draft only. Never schedules or sends.

Required local `.env` keys:

```text
KLAVIYO_API_KEY
KLAVIYO_API_REVISION
KLAVIYO_TEST_AUDIENCE_ID
KLAVIYO_FROM_EMAIL
KLAVIYO_FROM_NAME
KLAVIYO_REPLY_TO_EMAIL
KLAVIYO_DRAFT_ONLY=true
```

Do not print these values. Do not commit `.env`.

### PR #11: Agent Output Canvas v0

Merged into `main`.

Adds/repairs:

- Agent canvas page at `/agent/workflows`
- Preserves original `/agent` module
- Uses:
  - `POST /api/agent/workflows/plan-brief-qa`
  - `GET /api/agent/workflows`
  - `GET /api/agent/workflows/[id]`

Important history:

- First pass accidentally replaced/broke `/agent` and affected `/planner`.
- It was repaired before merge.
- `/agent` should continue to show original agent module.
- `/agent/workflows` is the workflow canvas.

### WorkflowRun Persistence

Merged before PR #11.

Adds:

- `WorkflowRun` model
- `GET /api/agent/workflows`
- `GET /api/agent/workflows/[id]`
- `POST /api/agent/workflows/plan-brief-qa` now persists workflow runs.

### Agent Orchestrator v0

Merged before WorkflowRun persistence.

Adds:

- `POST /api/agent/workflows/plan-brief-qa`

Behavior:

- Runs Plan -> Brief -> QA from one request.
- Uses deterministic local logic.
- Does not require live AI keys.
- Does not require Shopify/Klaviyo credentials.
- No Klaviyo execution in this route.

## Core Modules Already Built

### Campaign Memory Module

Purpose:

Store campaign performance so future planning can learn from past sends, segments, angles, subject lines, revenue, and notes.

Model:

- `CampaignMemory`

Routes:

- `POST /api/memory/ingest`
- `GET /api/memory/campaigns`
- `GET /api/memory/insights`

### Playbook Engine v0

Purpose:

Give Worklin a structured, typed library of campaign and lifecycle flow playbooks that Planner and future Flow Builder features can reference.

Files:

- `lib/playbooks/types.ts`
- `lib/playbooks/campaigns.ts`
- `lib/playbooks/flows.ts`
- `lib/playbooks/index.ts`

Routes:

- `GET /api/playbooks`
- `GET /api/playbooks/[id]`
- `GET /api/playbooks?type=flow`
- `GET /api/playbooks?type=campaign`

Flow playbooks:

- `welcome_series`
- `site_abandon`
- `browse_abandon`
- `cart_abandon`
- `checkout_abandon`
- `replenishment`
- `winback`

Campaign playbooks:

- `vip_early_access`
- `product_spotlight`
- `at_risk_winback`
- `no_discount_education`

Planner integration:

- Matching plan items now get `playbookId` and `playbookName` in metadata.
- This is metadata-only; no Klaviyo flow creation yet.

### Tool Registry v0

Purpose:

Give Worklin a structured internal map of what the agent can do, what each action requires, what risk level applies, and whether approval is required.

Files:

- `lib/agent/tools/types.ts`
- `lib/agent/tools/registry.ts`

Routes:

- `GET /api/agent/tools`
- `GET /api/agent/tools/[name]`

Registered tools:

- `workflow.planBriefQa`
- `workflow.approveAndCreateDrafts`
- `klaviyo.createDraftFromBrief`
- `playbooks.list`
- `playbooks.get`
- `memory.getCampaignInsights`
- `workflow.list`
- `workflow.get`
- `brain.readBrandContext`
- `flows.recommend`

Important:

- This started as registry metadata only.
- `flows.recommend` now points at the read-only flow recommendation route, but there is still no general-purpose tool execution runtime.
- Use it as the source of truth for future agent runtime/permission work.

### Agent Command Router v0

Purpose:

Map natural-language user requests to existing Worklin tools/workflows in a deterministic, safe way.

Route:

- `POST /api/agent/command`

Supported intents:

- `plan_brief_qa`
- `approve_workflow`
- `list_workflows`
- `get_workflow`
- `list_playbooks`
- `clarify`

Safety behavior:

- Approval intent can create Klaviyo drafts only when workflow context is clear.
- Send/schedule language is refused.
- Ambiguous commands return clarification instead of guessing.
- There are no live AI calls in the router.

### Context-Aware Command Router v1

Purpose:

Make `POST /api/agent/command` retrieve deterministic local context before deciding or executing a route.

Route:

- `POST /api/agent/command`

Behavior:

- Builds a RAG Context Layer package for every valid command request.
- Includes compact `contextSummary` in responses.
- Uses provided `workflowId` to load referenced workflow context and route approval safely.
- Clarifies approval language without workflow context and returns recent eligible workflows.
- Uses context-selected playbooks for playbook list requests.
- Preserves no-discount, VIP, flow, and campaign signals for planning workflows.
- Keeps send/schedule refusals intact.

Important:

- Execution is still deterministic and guarded.
- The optional LLM Intent Parser can classify/structure intent, but it does not execute tools.
- If parser output is unavailable, invalid, or low-confidence, deterministic parsing/routing remains the fallback.
- No scheduling or sending.
- No new Klaviyo behavior.

### RAG Context Layer v0

Purpose:

Build a small deterministic context package for Worklin agent commands without LangChain, LangGraph, embeddings, or a vector database.

Files:

- `lib/agent/context/types.ts`
- `lib/agent/context/build-context.ts`

Route:

- `POST /api/agent/context`

Context sources:

- Brand Brain/profile/rules
- Campaign Memory insights
- relevant playbooks
- recent `WorkflowRun` records
- referenced `WorkflowRun`
- recent `KlaviyoDraft` records
- recent CampaignBriefs/plans when useful

Retrieval rules:

- Flow keywords like welcome/cart/checkout/winback/replenishment include matching flow playbooks.
- Campaign keywords like VIP/product/at-risk/no discount include matching campaign playbooks.
- Approval/draft/Klaviyo language includes recent workflows and Klaviyo drafts.
- Explicit `workflowId` includes that workflow or returns `404` if missing.
- Missing optional sources are listed in `missing` rather than treated as fatal.

### Agent Chat Integration v0

Purpose:

Connect the existing `/agent` chat UI to the context-aware command router without replacing the original module.

Files:

- `app/agent/page.tsx`
- `app/api/agent/sessions/[id]/route.ts`
- `components/agent/agent-workflow-canvas.tsx`

Behavior:

- Normal typed `/agent` chat messages call `POST /api/agent/command`.
- Command router responses are displayed in the chat transcript.
- Command responses are saved into existing chat history.
- Workflow responses include links to `/agent/workflows?workflowId=...`.
- `/agent/workflows?workflowId=...` opens the referenced workflow in the existing workflow canvas.
- Compact context summary text appears when the command response includes `contextSummary`.
- Document upload still uses the existing `/api/agent/chat` stream path.

Important:

- No schema changes.
- No Klaviyo behavior changes.
- No scheduling or sending.
- `/agent`, `/agent/workflows`, and `/planner` should remain stable.

### LLM Provider Router v0

Purpose:

Provide a server-only LLM abstraction so future Worklin features can switch between providers without being locked to one API.

Files:

- `lib/llm/types.ts`
- `lib/llm/router.ts`
- `lib/llm/index.ts`
- `lib/llm/providers/*`

Route:

- `POST /api/ai/router/test`

Provider support:

- Existing Groq/Grok through the existing Groq SDK integration
- OpenRouter
- Google/Gemini
- DeepSeek
- Mistral
- Cohere
- Eden AI
- Mock fallback

Router interface:

- `generateText`
- `generateJson`
- `generateStructured`

Behavior:

- `LLM_PROVIDER_DEFAULT` selects the first provider.
- `LLM_PROVIDER_FALLBACK_ORDER` controls fallback order.
- Missing API keys are skipped safely.
- Provider/auth/credits/rate-limit/server errors can fall through to the next provider.
- `LLM_USE_MOCK_FALLBACK=true` enables mock fallback when all configured providers fail.
- Explicit `provider: "mock"` returns mock output for tests.

Provider env names:

- `GROQ_API_KEY` is preserved for the existing Groq integration.
- `OPENROUTER_API_KEY` / `OPENROUTER_DEFAULT_MODEL`
- `GEMINI_API_KEY` / `GEMINI_DEFAULT_MODEL`
- `DEEPSEEK_API_KEY` / `DEEPSEEK_DEFAULT_MODEL`
- `MISTRAL_API_KEY` / `MISTRAL_DEFAULT_MODEL`
- `COHERE_API_KEY` / `COHERE_DEFAULT_MODEL`
- `EDENAI_API_KEY` / `EDENAI_DEFAULT_PROVIDER` / `EDENAI_DEFAULT_MODEL`

Important:

- Server-only.
- Never expose API keys.
- Existing AI/Groq routes are preserved and not automatically rewired.
- No agent behavior changed in PR #21.
- No schema, UI, or Klaviyo behavior changes.

### LLM Intent Parser v0

Purpose:

Interpret messy Worklin chat into structured intents while keeping execution controlled by deterministic routing.

Files:

- `lib/agent/intent/types.ts`
- `lib/agent/intent/parse-intent.ts`

Route:

- `POST /api/agent/intent`

Output shape:

- `intent`
- `confidence`
- `parameters`
- `safety`
- `clarificationQuestion`
- `reasoningSummary`

Supported intents:

- `plan_brief_qa`
- `approve_workflow`
- `list_workflows`
- `get_workflow`
- `list_playbooks`
- `clarify`

Behavior:

- Builds RAG context before parsing when useful.
- Uses the LLM Provider Router when provider configuration is available.
- Falls back to deterministic parsing when providers fail, keys are missing, output is invalid, or confidence is low.
- Can pass structured planning parameters such as `campaignCount`, `focus`, and `constraints` into the deterministic command route.
- `POST /api/agent/command` can consult the parser before routing.

Safety:

- LLM interprets; deterministic router executes.
- The parser never executes tools directly.
- The parser never creates Klaviyo drafts directly.
- Send/schedule requests classify into clarify/refusal-safe behavior.
- Approval without workflow context still clarifies.
- No new Klaviyo behavior, scheduling, sending, schema changes, or UI.

### Planner Module v0

Purpose:

Answer: "What campaign should Worklin recommend next?"

Models:

- `CampaignPlan`
- `CampaignPlanItem`

Routes:

- `POST /api/planner/generate`
- `GET /api/planner/plans`
- `GET /api/planner/plans/[id]`

Shared logic:

- `app/api/planner/shared.ts`

Behavior:

- Deterministic and explainable.
- Uses local customer, segment, campaign, product, Campaign Memory, and Brain context where available.
- Supports constraints like:
  - `no discounts`
  - `include one VIP campaign`
- Plan item metadata includes playbook data when a recommendation matches a known playbook.

Planner validation errors were polished:

- `startDate must be a valid date string.`
- `endDate must be a valid date string.`
- `campaignCount must be a positive whole number.`

### Brief Generator v0

Purpose:

Turn a `CampaignPlanItem` or manual campaign input into a structured email creative brief.

Models:

- `CampaignBrief`
- `CampaignBriefSection`

Routes:

- `POST /api/briefs/generate`
- `GET /api/briefs`
- `GET /api/briefs/[id]`
- `PATCH /api/briefs/[id]`
- `PATCH /api/briefs/[id]/sections/[sectionId]`

Shared logic:

- `app/api/briefs/shared.ts`

Brief sections:

- hero
- intro/story
- product callout
- education/proof
- CTA
- design notes

### Plan -> Brief UI v0

Route:

- `/planner`

Capabilities:

- Generate campaign plan.
- Display plan summary and items.
- Generate briefs from plan items.
- List/view briefs.
- Edit brief status and CTA.
- Edit section heading/body.

Known UI debt:

- `/planner` works but feels crowded.
- Later simplify layout, spacing, hierarchy, and progressive disclosure.

### QA Engine v0

Model:

- `BriefQaCheck`

Routes:

- `POST /api/qa/briefs/[briefId]/run`
- `GET /api/qa/briefs/[briefId]`

Shared logic:

- `app/api/qa/shared.ts`

QA checks include:

- subject lines exist
- preview texts exist
- CTA exists
- sections exist
- hero section exists
- CTA section exists
- design notes exist
- no empty section bodies
- no discount language when no-discount applies
- risky/spammy words
- excessive punctuation/caps
- missing primary product for product/VIP/cross-sell/upsell campaign types
- Brain/brand forbidden terms
- Brain caution terms
- required Brain/compliance phrases if present

### QA UI v0

Merged earlier.

Adds QA visibility to `/planner` brief detail:

- Run QA button
- latest status
- score
- issues
- warnings
- passed checks
- recommended next action
- brand compliance metadata

## Database Context

Old local DB:

```text
retention_ai
```

Known drift symptom:

```text
ERROR: column "storeId" does not exist
```

Do not mutate or reset `retention_ai`.

Use clean local dev DB:

```text
worklin_dev_clean
```

Local `.env` should point to:

```text
DATABASE_URL="postgresql://admin@localhost:5432/worklin_dev_clean"
```

Database safety rules:

- Never use `prisma db push` unless explicitly approved.
- Never use `prisma db execute` unless explicitly approved.
- Never use `prisma migrate reset` unless explicitly approved.
- Use proper migrations for schema changes.
- Prefer additive migrations.
- Do not drop/rename/destructively alter existing data without explicit discussion.

Standard verification before PR when schema might be involved:

```bash
npx prisma validate --config prisma.config.ts
npx prisma generate --config prisma.config.ts
npx prisma migrate deploy --config prisma.config.ts
npm run build
```

For no-schema features, at minimum:

```bash
npm run build
```

Note:

- `npm run build` may need network access because Next/font fetches Google fonts.
- If the sandbox blocks Google Fonts, rerun build with network escalation rather than changing code.

## Git Workflow Rules

The user wants Codex to own the full Git workflow for every feature.

Before coding:

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-feature-name>
```

After coding:

1. Run relevant Prisma/build/API checks.
2. Stage only intended files.
3. Scan staged diff for secrets.
4. Commit with a clear message.
5. Push the branch.
6. Open a draft PR.
7. Do not merge until the user explicitly says approval to merge.

Never:

- work directly on `main`
- force push unless explicitly approved
- commit `.env`, `.env.local`, `node_modules`, `.next`, logs, local DB/cache files, or secrets
- commit API keys, GitHub tokens, Shopify tokens, Klaviyo keys, OpenAI keys, Anthropic keys, Groq keys, or credential-like values

Suggested staged secret scan:

```bash
git diff --cached > /tmp/worklin-staged.diff
rg -n "(?i)(api[_-]?key|secret|token|password|authorization|bearer|github_pat|ghp_|sk-[A-Za-z0-9])" /tmp/worklin-staged.diff
rg -n '^[+].*(API_KEY|SECRET|TOKEN|PASSWORD|AUTH).*=[[:space:]]*["'\"'][^"'\"']{4,}' /tmp/worklin-staged.diff
```

After a user says a PR is approved to merge:

1. Mark PR ready if it is draft.
2. Merge PR.
3. Checkout `main`.
4. Pull latest `main`.
5. Delete the local feature branch if safe.
6. Do not delete unrelated stashes/files.

## Useful Local Commands

Start app:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Prisma:

```bash
npx prisma validate --config prisma.config.ts
npx prisma generate --config prisma.config.ts
npx prisma migrate deploy --config prisma.config.ts
```

Common API smoke checks:

```bash
curl -s http://127.0.0.1:3000/api/customers
curl -s http://127.0.0.1:3000/api/planner/plans
curl -s http://127.0.0.1:3000/api/briefs
curl -s http://127.0.0.1:3000/api/klaviyo/drafts
curl -s http://127.0.0.1:3000/api/klaviyo/flows
curl -s http://127.0.0.1:3000/api/playbooks
curl -s http://127.0.0.1:3000/api/agent/tools
```

Generate agent workflow:

```bash
curl -s -X POST http://127.0.0.1:3000/api/agent/workflows/plan-brief-qa \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Plan 3 retention campaigns for next week. No discounts. Include one VIP campaign.",
    "startDate": "2026-05-18",
    "endDate": "2026-05-24",
    "campaignCount": 3,
    "focus": "repeat purchase",
    "constraints": ["no discounts", "include one VIP campaign"]
  }'
```

Approve workflow and create drafts:

```bash
curl -s -X POST http://127.0.0.1:3000/api/agent/commands/approve-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "message": "approved",
    "workflowId": "<workflow-id>"
  }'
```

Route a natural-language command:

```bash
curl -s -X POST http://127.0.0.1:3000/api/agent/command \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Plan 3 campaigns for next week. No discounts."
  }'
```

Build agent context:

```bash
curl -s -X POST http://127.0.0.1:3000/api/agent/context \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create no discount VIP campaigns",
    "limit": 3
  }'
```

Parse agent intent:

```bash
curl -s -X POST http://127.0.0.1:3000/api/agent/intent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Sales are slow. Put together something for next week without discounting too hard."
  }'
```

Test LLM provider router with mock:

```bash
curl -s -X POST http://127.0.0.1:3000/api/ai/router/test \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Say hello from Worklin in one sentence.",
    "mode": "text",
    "provider": "mock"
  }'
```

Detect and recommend lifecycle flows:

```bash
curl -s -X POST http://127.0.0.1:3000/api/flows/detect

curl -s -X POST http://127.0.0.1:3000/api/flows/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "recover abandoned checkouts"
  }'
```

## Klaviyo Safety

Klaviyo work is currently draft-only.

Rules:

- Never schedule.
- Never send.
- Do not expose or print API keys.
- Do not commit `.env`.
- Require `KLAVIYO_DRAFT_ONLY=true`.
- Klaviyo flow APIs are read-only only. Do not create, update, delete, schedule, or send flows.

Draft creation APIs:

- `POST /api/klaviyo/drafts/from-brief`
- `GET /api/klaviyo/drafts`
- `POST /api/agent/commands/approve-workflow`

Read-only flow APIs:

- `GET /api/klaviyo/flows`
- `POST /api/flows/detect`
- `POST /api/flows/recommend`

Testing has confirmed real campaigns created in Klaviyo remain:

- status `Draft`
- `scheduledAt: null`
- `sendTime: null`

## Stable Next Roadmap

These are the recommended next layers after PR #28. Do them one feature at a time, each on its own branch and PR.

### 1. Product Performance Intelligence v0

Why it matters:

- Retention audits need product truth before channel recommendations.
- Worklin has Shopify sync/data foundation, but it still needs a focused layer that identifies product winners, repeat-purchase products, replenishable products, margin/offer sensitivity where available, and product-level risk.
- This should feed campaign, flow, and segment audit decisions.

Recommended scope:

- Build a backend-only product performance reader/normalizer using existing Shopify/local data.
- Return best sellers, repeat-purchase signals, product cohorts where available, replenishment candidates, and products with weak or missing proof.
- Keep it deterministic and read-only.
- No schema changes unless absolutely necessary.

### 2. Audit Insight Framework v0

Why it matters:

- Worklin now has campaign drafts/workflows, playbooks, flows, flow details, and performance reads.
- It needs a shared audit model for turning raw facts into evidence-backed findings.
- This prevents each audit route from inventing its own output shape.

Recommended scope:

- Add shared types for audit facts, findings, severity, confidence, evidence, recommendation, owner, and next action.
- Implement deterministic scoring helpers.
- Keep LLM usage optional and interpretive only.
- No UI in v0.

### 3. Flow Audit v0

Why it matters:

- Worklin can read flows, detect coverage, fetch details, and recommend build/audit/classify actions.
- Next, it should inspect what is inside a lifecycle flow and identify real audit issues.

Recommended scope:

- Use Flow Read + Detection, Flow Detail Read, Flow Planner, flow playbooks, and performance reads.
- Audit triggers, filters, timing, sequence, message coverage, offer usage, QA risks, and performance where available.
- Output evidence-backed findings and prioritized next actions.
- Read-only only. No Klaviyo flow creation yet.

### 4. Campaign Audit v0

Why it matters:

- Worklin can generate plans/briefs and read Klaviyo campaign performance, but it does not yet audit historic campaigns against product truth, playbook methodology, or performance.

Recommended scope:

- Use Klaviyo campaign performance plus Campaign Memory and playbooks.
- Identify offer overuse, weak product framing, underperforming segments, missed lifecycle moments, and creative/CTA patterns.
- Output findings and prioritized campaign recommendations.
- No scheduling or sending.

### 5. Segment/Audience Audit v0

Why it matters:

- Retention strategy depends on who receives what.
- Worklin needs a safe way to evaluate audience coverage, suppression, lifecycle placement, and segment usefulness.

Recommended scope:

- Use existing local segments/customer data and Klaviyo segment performance where supported.
- Classify core audiences such as VIP, new customer, lapsed, at-risk, replenishment, browse/cart/checkout intent, and non-buyer subscriber.
- Identify missing, stale, overlapping, or risky segment logic.
- Read-only only.

### 6. Retention Audit Workflow v0

Why it matters:

- Product, campaign, flow, and segment audits should converge into one coherent retention audit workflow.
- The workflow should follow the real audit structure:

```text
Product truth -> campaign truth -> flow truth -> segment truth -> lifecycle placement -> prioritized actions
```

Recommended scope:

- Add a backend workflow that gathers audit facts and produces a prioritized retention action plan.
- Persist as a `WorkflowRun` type if straightforward.
- Keep output deterministic/fallback-based.
- Do not create drafts, flows, schedules, or sends from audit output.

### 7. Tool Execution Runtime v0

Why it matters:

- Tool Registry is metadata-first, while command routes still manually execute known paths.
- A small runtime will make tool execution more consistent and auditable.

Recommended scope:

- Add a server-only runtime that reads Tool Registry metadata.
- Enforce permission level, risk level, approval requirement, and read-only/draft-only restrictions.
- Start with read/generate tools.
- Do not execute `external_live_action` tools.

### 8. Action Log v0

Why it matters:

- As Worklin becomes more agentic, the user needs a durable record of what the agent did, suggested, read, drafted, skipped, or refused.

Recommended scope:

- Add a lightweight action log for agent/tool actions.
- Include action type, source, target, permission level, result, safety reason, and timestamps.
- Keep it server-side and safe.
- Schema change may be appropriate here, but only via normal Prisma migration.

### 9. Web Research Tool v0

Why it matters:

- Some audits need external context such as competitor positioning, product education, seasonal timing, or category norms.
- This should be a controlled research tool, not freeform browsing inside execution paths.

Recommended scope:

- Add a read-only research tool with strict inputs and summarized outputs.
- Keep sources/citations where possible.
- Do not let web research trigger external actions.
- Consider Tool Registry integration.

### 10. Results Ingestion + Learning Loop

Why it matters:

- Worklin should learn from what happened after campaigns or flow changes.
- This is how recommendations become less generic over time.

Recommended scope:

- Ingest results into Campaign Memory or a new learning layer.
- Compare plan/brief/playbook intent against actual performance.
- Generate lessons and update future planning context.
- Keep learned output reviewable.

### 11. Heartbeats / Scheduled Checks

Why it matters:

- Eventually Worklin should notice opportunities without the user asking.
- This must come after read-only audits and safety logs are reliable.

Recommended scope:

- Add scheduled read-only checks first.
- Detect stale flows, performance drops, missing lifecycle assets, and draft follow-ups.
- Do not schedule or send campaigns.
- Do not create live Klaviyo flows.

### 12. Durable Approval State

Why it matters:

- Approval intent currently allows guarded draft creation from eligible workflow outputs, but product-level approval state is not yet durable enough.
- Durable approval state should become the checkpoint between QA and any draft/external action.

Recommended scope:

- Add approval status to briefs or a dedicated approval model.
- Add approve/reject endpoints.
- Update draft routes to require durable approval where appropriate.
- Inspect the `approval-gate-v0-wip` stash only if the user asks to resume this work.

### 13. Sub-agents / Child Workflows

Why it matters:

- Larger audits will eventually benefit from specialized workers for product, campaign, flow, segment, and research analysis.
- This should wait until audit framework, tool runtime, and action log are stable.

Recommended scope:

- Keep child workflows bounded and permissioned.
- Require deterministic aggregation and human-readable evidence.
- Do not let sub-agents bypass the router, tool runtime, approval state, or Klaviyo safety rules.

Do not jump straight to:

- scheduling
- sending
- live Klaviyo flow creation
- Slack automation
- full autopilot
- PDF ingestion
- large UI rewrites

Those should wait until approval, QA, draft visibility, flow review, and execution guardrails feel solid.
For flow work specifically, do not jump to live Klaviyo flow creation until read-only detection, recommendations, human review, and approval gates are solid.

## Suggested New Chat Prompt

Paste this into a new chat:

```text
We are working on Worklin AI in:
/Users/admin/Documents/Codex/2026-04-28/github-plugin-github-openai-curated-main/worklin-ai-git

Read WORKLIN_CONTEXT_HANDOFF.md first.

Important:
- Use Worklin, not Oscar.
- Follow the standard feature branch + PR workflow.
- Never commit .env or secrets.
- Never use prisma db push, db execute, or migrate reset unless explicitly approved.
- Use worklin_dev_clean, not the old drifted retention_ai DB.
- PR #28 Klaviyo Performance Read v0 is merged into main.
- Main now includes Tool Registry v0, RAG Context Layer v0, Context-Aware Command Router v1, Agent Chat Integration v0, LLM Provider Router v0, LLM Intent Parser v0, Playbook-aware Brief Generation v0, Klaviyo Flow Read + Detection v0, Flow Planner v0, Flow Planner Agent Command Integration v0, Klaviyo Flow Detail Read v0, and Klaviyo Performance Read v0.
- Current local main commit should be c5e921c Klaviyo Performance Read v0 (#28).
- Safety rule: LLM interprets, deterministic router validates and executes.
- Flow/performance safety rule: read-only only; no Klaviyo flow creation, updates, deletion, scheduling, sending, or performance-side writes.
- Current local main should be up to date with origin/main.
- There is a local stash approval-gate-v0-wip; do not drop or apply it unless I ask.
- WORKLIN_CONTEXT_HANDOFF.md is tracked; do not include it in normal feature PRs unless I ask for a handoff update.

Before starting, run git status and tell me the current branch and pending work.
```
