# Worklin AI Handoff Context

Use this file to start a new Codex/chat session with enough context to continue Worklin AI without rereading the whole prior thread.

Last updated: 2026-05-03

## Product Summary

Worklin AI is an autonomous retention marketer for Shopify/DTC brands.

The app helps lifecycle/CRM teams turn Shopify data, Klaviyo data, brand knowledge, campaign history, and performance memory into:

- campaign plans
- design-ready creative briefs
- QA/preflight results
- approved Klaviyo draft campaigns
- later: flow creation, scheduling, Slack, deeper agent autonomy, and gated autopilot

Important naming note:

- The old product name was Oscar.
- Do not use Oscar in product copy or implementation notes.
- Use Worklin AI / Worklin.

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

4. Planner
   - Creates saved `CampaignPlan` and `CampaignPlanItem` records.
   - Uses local data, Campaign Memory, Brain context where available, constraints, and playbooks.

5. Brief Generator
   - Turns a plan item into a saved structured `CampaignBrief` with sections.
   - Deterministic and local-first.

6. QA Engine
   - Runs deterministic checks on briefs before they move toward Klaviyo.
   - Includes Brain/brand guideline checks.

7. Agent Orchestrator
   - Runs Plan -> Brief -> QA from one user request.
   - Persists output in `WorkflowRun`.

8. Agent Canvas
   - `/agent/workflows` lets a user run and reopen saved workflows.
   - Existing `/agent` experience must remain preserved.

9. Klaviyo Draft Creation
   - Creates real Klaviyo templates and draft campaigns from Worklin briefs.
   - Draft-only. Never schedules or sends.

10. Approval Intent -> Auto Draft
   - User approval phrases can create Klaviyo drafts for eligible QA-passed briefs in a completed workflow.
   - Duplicate, warning, failed, ambiguous, send, and schedule cases are guarded.

What this means:

```text
Prompt -> Agent Workflow -> Plan -> Briefs -> QA -> Approval Intent -> Klaviyo Drafts
```

The product can now produce campaign recommendations, generate briefs, preflight them, save the workflow, and create real Klaviyo draft campaigns under guardrails.

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
status: main is up to date after merging PR #14
latest pulled merge commit: f1f7115 Merge pull request #14 from Logarn/feature/playbook-engine-v0
```

Current local status had one untracked file:

```text
WORKLIN_CONTEXT_HANDOFF.md
```

This file is intentionally local handoff context and has not been committed.

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
- Keep `WORKLIN_CONTEXT_HANDOFF.md` untracked unless the user asks to commit it.
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

Do not:

- Send a campaign.
- Schedule a campaign.
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

Do not:

- Treat `send it` or `schedule it` as permission to send/schedule.
- Create drafts for failed-QA briefs.
- Create drafts for ambiguous approval when no workflow is referenced.
- Create duplicate drafts on repeated approval.

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

- Add live LLM dependencies for deterministic backend foundations.
- Add PDF ingestion until explicitly requested.
- Add Klaviyo flow creation until explicitly requested.
- Add Slack automation until explicitly requested.
- Add schema changes unless they are truly needed.

Why:

The product is intentionally being built in thin, testable layers.

## Current Main Status

Current expected repo state:

- `main` includes PR #12, PR #13, and PR #14.
- Local `main` has been pulled after PR #14.
- Local branch `feature/playbook-engine-v0` was safely deleted.
- There is no active feature branch unless a new chat creates one.
- `WORKLIN_CONTEXT_HANDOFF.md` remains untracked/local unless the user approves committing it.
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

Current safety posture:

- Worklin can create real Klaviyo draft campaigns.
- Worklin must not schedule or send.
- Agent approval means draft creation only.
- Failed-QA briefs are held.
- Warning briefs are held unless explicitly included.
- The next feature should start from `main` with a fresh `feature/<short-feature-name>` branch.

## Recently Merged PRs

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
curl -s http://127.0.0.1:3000/api/playbooks
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

## Klaviyo Safety

Klaviyo work is currently draft-only.

Rules:

- Never schedule.
- Never send.
- Do not expose or print API keys.
- Do not commit `.env`.
- Require `KLAVIYO_DRAFT_ONLY=true`.

Draft creation APIs:

- `POST /api/klaviyo/drafts/from-brief`
- `GET /api/klaviyo/drafts`
- `POST /api/agent/commands/approve-workflow`

Testing has confirmed real campaigns created in Klaviyo remain:

- status `Draft`
- `scheduledAt: null`
- `sendTime: null`

## Updated Next Recommended Features

These are the most logical next steps after PR #14. Do them one feature at a time, each on its own branch and PR.

### 1. Approval Gate v0

Why it matters:

- PR #13 lets approval intent create drafts from a completed workflow, but formal brief-level approval is not fully merged as a durable product layer.
- Worklin needs an explicit approval state before a brief is considered ready for Klaviyo draft creation.

Recommended scope:

- Add `approvalStatus`, `approvedAt`, and `approvedBy` to `CampaignBrief`, or add a small approval model if cleaner.
- Add:
  - `POST /api/briefs/[id]/approve`
  - `POST /api/briefs/[id]/reject`
- Update Klaviyo draft creation to require approved briefs by default.
- Keep failed QA blocked unless an explicit override is provided.

Important:

- There is an old local stash named `approval-gate-v0-wip`.
- Inspect it before starting, but do not blindly apply it because main has moved forward.

### 2. Playbook-Aware Brief Generation

Why it matters:

- Planner now attaches playbook metadata, but Brief Generator does not yet deeply use the playbook sequence, timing, content suggestions, offer rules, or QA risks.

Recommended scope:

- When generating a brief from a plan item with `metadata.playbookId`, load the matching playbook.
- Use playbook content suggestions to shape sections.
- Use playbook offer rules to avoid discounts or require soft offers.
- Add playbook references into brief metadata for QA and future UI.

### 3. Flow Planner v0

Why it matters:

- PR #14 added flow playbooks but no flow planning or Klaviyo flow creation.
- This is the natural bridge from campaign recommendations to lifecycle automation recommendations.

Recommended scope:

- Add backend-only route like `POST /api/flows/recommend`.
- Use current flow playbooks to recommend which lifecycle flows a brand should build or audit.
- Return trigger, audience, timing, sequence, required data, and risks.
- No Klaviyo flow creation yet.

### 4. Playbook UI v0

Why it matters:

- Playbooks are currently API-only.
- A simple internal UI would help review, trust, and iterate on playbook content.

Recommended scope:

- Add `/playbooks`.
- List campaign and flow playbooks.
- Detail page or drawer for one playbook.
- Keep it read-only.

### 5. Planner UI Polish

Why it matters:

- `/planner` works but feels crowded.
- It will become more important as playbook metadata, QA, approvals, and draft creation become visible.

Recommended scope:

- Improve spacing, hierarchy, and progressive disclosure.
- Separate plan generation, brief editing, QA, and draft actions more clearly.
- Avoid rebuilding the entire page.

### 6. Klaviyo Draft UI v0

Why it matters:

- Klaviyo draft creation is backend-capable, but the user needs a safe way to trigger and inspect drafts from the UI.

Recommended scope:

- Add draft creation action to approved, QA-passed brief detail.
- Show existing `KlaviyoDraft` records.
- Make draft-only mode visually obvious.
- Never add schedule/send buttons.

### 7. Workflow Run History Polish

Why it matters:

- `WorkflowRun` persistence exists and `/agent/workflows` can reopen runs.
- The user will need clearer history and comparison as more workflows accumulate.

Recommended scope:

- Improve recent workflow list.
- Add status/type filters.
- Add better empty/error states.
- Add clear links to plan, briefs, QA, and drafts when available.

Do not jump straight to:

- scheduling
- sending
- live Klaviyo flow creation
- Slack automation
- full autopilot
- PDF ingestion
- large UI rewrites

Those should wait until approval, QA, draft visibility, and playbook-aware generation feel solid.

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
- PR #14 Playbook Engine v0 is merged into main.
- Current local main should be up to date with origin/main.
- There is a local stash approval-gate-v0-wip; do not drop or apply it unless I ask.
- WORKLIN_CONTEXT_HANDOFF.md is local/untracked unless I explicitly ask to commit it.

Before starting, run git status and tell me the current branch and pending work.
```
