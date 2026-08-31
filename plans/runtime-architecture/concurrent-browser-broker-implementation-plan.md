# Concurrent Browser Broker Implementation Plan

## Objective

Enable an assistant running in the concurrent multi-tenant service to perform
real browser work in the user's signed-in Chrome profile through the existing
Chrome extension. The first release is browser-only: it can inspect a page,
navigate, click, type into non-sensitive fields, use a small set of keys,
scroll, wait, and return screenshots or compact page observations. It does not
provide general desktop computer use.

The shared service must not depend on a particular replica, an in-memory
callback, the most recently connected extension, or the browser's active tab.
Every connection, tab lease, command, result, cancellation, and model tool step
is durably and unambiguously scoped to:

`organization -> assistant -> user -> actor -> conversation -> client
installation -> connection generation -> browser session/tab lease`.

The implementation should promote the existing Chrome extension/CDP bridge
into a durable broker subsystem inside `assistant/src/concurrent-runtime/`.
This keeps the first version close to the concurrent run state and Postgres
transaction boundary. It can be extracted into a separately deployed service
later if measured load or independent scaling justifies that boundary.

This is a multi-PR program. Track it with a parent issue and phase-specific
sub-issues. Every PR must be independently deployable, backward compatible,
disabled by default until its phase gate passes, and reversible without
changing an assistant's placement field by hand.

## Relationship To Existing Runtime Plans

This plan extends, and does not replace:

- `plans/runtime-architecture/concurrent-multi-tenant-service-plan.md`, which
  owns the immutable `TenantExecutionContext`, concurrent-safe import boundary,
  Postgres/RLS model, durable runs, leases/fencing, outbox behavior, signed edge
  claims, and deny-by-default capability registry;
- `plans/runtime-architecture/hybrid-pooled-and-dedicated-runtime-plan.md`,
  which owns deterministic placement, capability classification, additive
  operational status, canarying, and migration between shared and dedicated
  runtimes.

Do not duplicate or reopen the generic relational, scheduler, CES, trust,
placement, provisioning, or migration designs in those plans. This plan adds
the identity dimensions, durable delivery semantics, extension protocol, and
bounded model loop required for browser control to become concurrent-safe.

Browser extension control remains dedicated-only until this plan's promotion
gates pass. Deploying tables, routes, or extension code alone is not grounds to
advertise the capability.

## Methodology And Baseline Reviewed

The review covered:

- the concurrent HTTP surface and capability advertisement in
  `assistant/src/concurrent-runtime/http-server.ts`;
- single-call model execution in
  `assistant/src/concurrent-runtime/turn-executor.ts`;
- durable run leasing, conversation serialization, store contracts, and the
  Postgres implementation under `assistant/src/concurrent-runtime/`;
- the initial concurrent schema and its organization/assistant RLS policies in
  `assistant/src/concurrent-runtime/migrations/001-initial-schema.ts`;
- `TenantExecutionContext` in
  `packages/service-contracts/src/tenant-context.ts`;
- the current extension transport, stable installation identity, worker, CDP
  adapter, and dispatcher under `clients/chrome-extension/background/`;
- the dedicated runtime's `HostBrowserProxy`, host-browser result routes,
  process-level event hub, pending interactions, pinned tabs, and browser
  manager;
- the existing conversation-scoped host-access migration and permission model;
- provider support for tool definitions, `tool_use`, and `tool_result` content;
- the session, ownership, snapshot, screenshot, TTL, and human-takeover ideas in
  the separate agent-harness reference supplied during planning.

The companion `vellum-assistant-platform` repository is not present in this
workspace. Before freezing edge routes or shipping a canary, review that repo
for authentication claims, organization selection, assistant proxy routes,
header forwarding, SSE buffering/timeouts, generated clients, feature-flag
Terraform, and deployment compatibility.

Implementation expectations:

- public ingress remains at the gateway/platform edge;
- the edge derives tenant identity from authenticated claims and passes a
  signed internal context; request bodies and model arguments are never
  identity authority;
- all LLM work continues through `getConfiguredProvider(callSite)`;
- new persistence uses idempotent, append-only migrations;
- new contracts are additive and versioned;
- trust stays gateway-owned and credentials stay CES-owned;
- tool guidance lives in the browser tool schema/result framing rather than
  expanding the global system prompt;
- dependencies, if any, are exact-pinned and MIT-compatible;
- tests are scoped by file and the full unscoped test suite is never run.

## Baseline Findings

### The concurrent runtime has the right foundation but no tool loop

The concurrent service already has authenticated tenant context, durable
messages and events, per-conversation ordering, run leases, and Postgres as a
shared source of truth. It currently advertises bounded chat/history behavior,
and `turn-executor.ts` performs one provider call without tools. A browser
command cannot safely be added as an in-memory await inside that function:
the serving replica can disappear while Chrome is acting, and the result may
arrive at another replica.

Browser execution therefore needs a resumable run state machine. The service
must persist the provider's tool-use decision before dispatch, release the run
while it waits, and let any healthy replica resume from a durable tool result.
Releasing the replica lease must not release conversation ordering: the
earliest nonterminal run, including one waiting for Chrome, blocks later runs
in that conversation. The run also retains the non-secret resolved
provider/model configuration and browser tool-schema version with which its
`tool_use` was produced; a resume cannot silently switch models or protocols.

### The existing extension proves local signed-in control is feasible

The Chrome extension already has the required Chrome permissions and can use
`chrome.debugger` to execute CDP methods in the user's real browser profile.
The deployed transport is fetch-based SSE for server-to-extension messages and
HTTP POST callbacks for extension-to-server results. This is a useful base and
does not require a new WebSocket transport.

The current dedicated implementation is not safe to reuse directly in a
concurrent replica:

- `HostBrowserProxy`, pending callbacks, browser contexts, and pinned-tab maps
  are process-local;
- selection can fall back to a recent client, default client, or active tab;
- existing event routing is not scoped by organization, assistant, user,
  actor, client generation, and tab lease together;
- a stable extension installation ID identifies an installation but is not an
  authentication credential;
- the current dispatcher suppresses some late cancellations but does not keep
  a durable completed-action deduplication journal;
- the extension does not persist/replay the generic SSE cursor today, while
  the concurrent `/v1/events` stream defaults to replay from sequence zero;
- the legacy extension activity log can persist raw request parameters and
  response content, which is unsuitable for DOM, screenshots, URLs, and typed
  values on the new path.

The legacy path must keep its existing semantics. The concurrent protocol gets
a separate dispatcher and event discriminator.

### Delivery is at-least-once; browser mutations must be at-most-once

SSE reconnect, proxy retries, process crashes, and result retries make
duplicate delivery normal. A read-only snapshot can be recomputed. A click on
“Submit”, a key press, or typed text cannot be blindly repeated.

The correct contract is not “exactly once.” It is:

- at-least-once command delivery;
- durable deduplication before executing a mutation;
- cached replay of known terminal results;
- `unknown_outcome` when a crash happened after mutation started but before a
  terminal result was durably recorded;
- read-only inspection and user/model reconciliation after an unknown outcome,
  never automatic mutation replay.

### Browser conversation ownership is a prerequisite

The current concurrent conversation/message/event schema is keyed by
organization, assistant, and conversation, and its RLS policies enforce only
organization and assistant. Adding user/actor columns to browser tables would
prevent a command from reaching the wrong Chrome client, but it would not by
itself prevent another actor in the same assistant from reading browser-derived
text later through conversation history or events.

Before any browser tool is exposed, add immutable nullable
`owner_user_id`/`owner_actor_id` ownership to concurrent conversations and
enforce it transitively for their messages, runs, and events. New conversations
populate ownership from authenticated context. Legacy null-owned conversations
retain their current non-browser behavior for backward compatibility but stay
browser-disabled until ownership is established from authoritative platform
evidence or the user starts a new owned conversation. Shared/collaborative
conversations stay browser-disabled until explicit participant, delegation,
revocation, and browser-consent semantics exist.

### Splotch offers useful session concepts, not a deployable broker model

Useful concepts to borrow are long-lived sessions with TTL, explicit
human/agent ownership, compact DOM plus screenshots, document/page epochs,
bounded transient frames, and explicit handoff for login, dialogs, and file
selection.

Do not borrow its process-local session registry, thread-only identity, baked
keys, single-replica assumption, or lack of a durable action journal. Those
choices would recreate replica affinity and cross-tenant ambiguity.

## Scope

### In scope for the first production release

- Chrome extension registration and presence for one selected assistant per
  extension connection.
- An exact client-installation and connection-generation command stream.
- One explicit, conversation-owned browser tab lease per active browser
  session.
- A conversation-scoped host-computer access gate with safe default off.
- A visible extension indicator with Pause/Take over/Resume/Release behavior.
- Versioned high-level browser commands translated to CDP inside the extension.
- Durable run steps, command/action journal, outbox, receipts, results,
  cancellation, deadlines, leases, fencing, and recovery.
- A bounded browser-only provider tool loop.
- Sanitized compact page observations and bounded screenshots.
- Organization, assistant, user, actor, conversation, client, connection,
  session, and action quotas and audit metadata.
- Dedicated-runtime backward compatibility throughout rollout.

### Safe version-one operation allowlist

The protocol should expose semantic operations, not arbitrary CDP methods:

| Operation | Initial rule |
|---|---|
| `status` | Report whether a compatible exact client is connected. |
| `open_session` | Create a new controlled tab by default and return only opaque handles. |
| `navigate` | Permit HTTPS, and HTTP only if product policy explicitly allows it; enforce URL policy before CDP. |
| `snapshot` | Return a compact, redacted DOM/accessibility observation with opaque element references. |
| `screenshot` | Return a bounded image or short-lived encrypted artifact reference. |
| `click` | Require an element reference from the current snapshot/document epoch. |
| `type` | Replace-style entry into a current, non-sensitive editable element; never append by retry. |
| `press_key` | Restrict to a reviewed key allowlist and current tab lease. |
| `scroll` | Bound direction and distance. |
| `select_option` | Require a current element reference and a bounded value. |
| `wait` | Bound duration; it is not a general sleep primitive. |
| `close_session` | Release only the conversation-owned tab lease. |

`hover` can join version one only if it is implemented through the same epoch,
budget, and tab-lease checks without expanding the protocol risk.

### Out of scope for the first release

- General macOS/Windows/Linux desktop computer use.
- Raw CDP, `Runtime.evaluate`, arbitrary JavaScript, or an extension RPC escape
  hatch.
- Listing all tabs, selecting a raw tab ID, attaching to the active tab, or
  falling back to another client.
- Cookie, browser storage, history, clipboard, or credential-store access.
- Password, one-time-code, recovery-code, payment, or other sensitive-field
  entry by the model.
- File upload, download management, browser extension pages, browser settings,
  `file:` URLs, localhost, link-local, or private-network navigation.
- Cloud-hosted browser profiles or manual cloud login.
- Local Playwright/CDP-inspect fallback on a shared replica.
- Unsolicited raw CDP event forwarding.
- Multiple assistants multiplexed over one extension stream.
- Automatic promotion to or provisioning of a dedicated runtime when the
  extension is offline or incompatible.

## Desired Behavior

### End-to-end flow

```text
bounded browser tool loop
  -> persist provider tool-use + browser action + outbox in Postgres
  -> any replica serves exact-client SSE event
  -> authenticated extension durably receipts the action
  -> extension resolves opaque tab lease and executes reviewed CDP
  -> extension durably records a sanitized terminal receipt
  -> idempotent result POST reaches any replica
  -> result transaction makes the owning run runnable
  -> any replica resumes the model from durable run steps
```

No arrow in this flow depends on replica-local memory for correctness.
Postgres is authoritative; in-memory stores are test doubles only.

### Connection and availability

1. The extension authenticates through the existing platform or self-hosted
   edge and selects one assistant.
2. It sends its stable installation ID, interface ID, protocol versions, and
   capabilities to an explicit registration POST.
3. The edge derives organization/user/actor identity, and the broker atomically
   creates or resumes a server-minted connection ID/generation with a
   short-lived connection credential bound to the full identity tuple.
4. Transient SSE reconnect and service-worker restart reuse the same unexpired
   generation through an authenticated resume handshake. Only explicit
   replacement, account/assistant switch, expired resume lease, or failed
   continuity proof creates a newer generation.
5. A newer generation fences the older stream, new receipts/actions, session
   events, cancellations, and tab leases. It may submit only tightly scoped,
   already-persisted terminal evidence for an action that started under the
   superseded generation; it can never execute new work for that generation.
6. The extension opens an exact-client browser-command SSE stream from its last
   durably receipted cursor and renews a bounded presence lease.
7. The browser tool is offered only when the feature gate is enabled and a
   compatible current connection exists for the exact actor/client choice and
   the conversation is immutably owned by that user/actor.

The client choice is authoritative user state, not a server heuristic. When
enabling conversation host access, the user selects one of their compatible
connected installations (or confirms the sole eligible installation). Store
that installation ID on the conversation access grant and bind every session
to it. If zero or multiple installations remain without a stored explicit
choice, browser access fails closed. The UI may show a user-controlled device
label but must not expose or choose by a raw installation ID or last-seen time.

An incompatible extension yields an “extension update required” result. An
offline extension yields a clear “connect your browser extension” result. The
service does not silently select another user's client, another installation,
the active tab, a desktop bridge, or a dedicated runtime.

### Browser session and tab ownership

1. Host access is disabled for a conversation by default.
2. The user enables the existing conversation-scoped host-computer gate.
3. `open_session` creates a new controlled tab and an opaque tab lease. The
   extension alone maps that lease to Chrome's raw tab ID.
4. Every observation is tagged with a document epoch and snapshot ID. Element
   references are valid only for that tab lease, epoch, and snapshot.
5. Navigation, reload, renderer replacement, detach, tab closure, connection
   supersession, and human takeover invalidate stale references.
6. The user can pause/take over. Agent actions are parked while the human owns
   the lease. Resume forces a fresh observation before another mutation.
7. Release, conversation revoke, disconnect, or expiry fences undelivered work,
   requests best-effort cancellation, ends the session, and rejects later
   commands. It does not claim to undo a mutation that already started.

Selecting an existing user tab can be designed later as an explicit extension
UI action. The model must never enumerate or select arbitrary tabs.

### Action lifecycle

The canonical server state machine is:

```text
queued -> delivered -> received -> executing -> succeeded | failed
                                   \-> cancel_requested -> cancelled
queued/delivered/received -------------------------------> expired
executing + lost terminal evidence ----------------------> unknown_outcome
```

Rules:

- `actionId`, operation hash, action sequence, expected document epoch,
  connection generation, and deadline are immutable.
- One mutating action may execute at a time for a tab lease.
- The extension persists `executing` before a mutation and persists the small
  terminal receipt before posting it.
- A duplicate terminal action returns the cached receipt without another CDP
  call.
- A duplicate read-only observation may be recomputed if policy permits.
- A duplicate mutation found in `executing` after an extension restart becomes
  `unknown_outcome` and is not re-executed.
- Cancellation is best effort. It does not undo a click or imply that a started
  action had no effect.
- `cancelled` or `failed` is terminal only when the extension can prove the
  mutation did not take effect or produced the reported failure. If effect is
  uncertain, the terminal state is `unknown_outcome` even when a cancel raced.
- Duplicate identical results return the canonical result with HTTP 200.
  Conflicting terminal hashes return HTTP 409. Stale identity, generation,
  session, or epoch fails closed.

### Model loop

The concurrent turn becomes a small resumable state machine rather than an
instance of the dedicated runtime's full `AgentLoop`:

1. Build the provider request through `getConfiguredProvider("mainAgent")` and
   attach one versioned browser tool definition directly through provider
   `tools` options.
2. Persist the normalized provider response and any `tool_use` block before
   dispatching a browser action.
3. Atomically create the browser action/outbox record and move the run to
   `waiting_for_browser`.
4. Release the replica run lease while preserving same-conversation ordering.
5. When a terminal browser result arrives, persist the normalized tool result,
   mark the run runnable, and notify the scheduler.
6. A healthy replica claims the run and continues the provider conversation
   from durable steps.
7. Stop on final assistant text, cancellation, unavailable browser, user
   takeover, unknown outcome, or configured step/time/observation budgets.

Conversation ordering is database-enforced. Each accepted run gets a monotonic
conversation turn sequence. The claimer locks the conversation row and may
claim only its earliest nonterminal run. `waiting_for_browser` is nonterminal
and blocks queued successors; a terminal cancellation/failure unblocks the
next sequence, while a browser result requeues the same earliest run. A unique
partial invariant prevents two `running`/`waiting_for_browser` owners for one
conversation across replicas.

At first provider execution, persist a non-secret resolved execution snapshot:
provider kind/connection reference, model, inference parameters, profile/config
revision, prompt/tool schema versions, and any compatibility fields required to
continue the provider transcript. Resume uses that frozen snapshot through the
provider abstraction and resolves current credentials from CES; it never
persists a key and never silently switches provider/model. Revoked or
unavailable credentials produce an explicit resumable-run failure.

This is a direct, bounded browser adapter, not a new globally registered Tool
class and not access to bash, skills, local files, or the dedicated browser
manager. If maintainers classify the provider tool schema as a new non-skill
tool registration, obtain the review required by
`assistant/src/tools/AGENTS.md` before implementation.

## Key Changes

### Versioned service contract

Add `packages/service-contracts/src/browser-broker.ts`, export it from the
package index and package export map, and cover it with schema tests.

The version-one contract should contain:

- extension handshake and capability schemas;
- connection registration/heartbeat responses;
- `BrowserCommandV1` as a discriminated union of high-level operations;
- receipt, result, cancellation, session invalidation, and ownership schemas;
- structured error codes including `browser_unavailable`,
  `extension_update_required`, `consent_required`, `stale_connection`,
  `stale_tab_lease`, `stale_document`, `sensitive_field`,
  `user_input_required`, `deadline_expired`, and `unknown_outcome`;
- strict size, count, string, image, and duration bounds.

The transport envelope carries full server-derived scope, run/tool/action IDs,
client installation, connection generation, tab lease, document epoch,
sequence, and deadline. The model's operation input contains no tenant,
client, connection, session, or raw tab identity.

### Durable data model

Create an ordered concurrent-runtime migration registry before adding
`assistant/src/concurrent-runtime/migrations/002-browser-broker.ts`.
`PostgresConcurrentRuntimeStore.initialize()` currently knows only migration
001; it must apply each unapplied migration once, in order, while preserving
the append-only history table.

Migration 002 should add the following logical records. Exact columns can be
refined during implementation, but the ownership keys and invariants are
required.

| Record | Required content and constraints |
|---|---|
| `concurrent_browser_clients` | Full org/assistant/user/actor scope, stable installation ID, interface ID, supported protocol/capabilities, status, last seen. Unique only on the complete ownership tuple plus installation. |
| `concurrent_browser_connections` | Client scope, server connection ID, monotonically increasing generation, short-lived credential/resume digest, lease/heartbeat timestamps, SSE cursor, state. Only one current generation per scoped installation; transient reconnect can resume it. |
| `concurrent_browser_access_grants` | Full scope plus conversation, explicitly selected client installation, safe-default-off host-access state, grant/revoke metadata. Active action authorization additionally binds the grant to a current connection and tab lease. |
| `concurrent_browser_sessions` | Full scope plus conversation, opaque session/tab-lease ID, exact client and connection generation, owner (`agent` or `human`), owner lease, document epoch, current snapshot metadata, state, idle and absolute expiry. No server-selected raw active tab. |
| `concurrent_run_steps` | Full scope, run ID, ordered step index, normalized provider response/tool-use/tool-result, frozen non-secret provider/model/config and prompt/tool-schema versions, state, bounded encrypted/transient observation reference where necessary. Unique run step order and tool-use ID. |
| `concurrent_browser_actions` | Full scope, conversation/run/tool-use/session/client/generation, immutable action ID and sequence, operation and operation hash, replay class, expected epoch, deadline, state, sanitized result/error/postcondition, receipt and terminal timestamps. |
| `concurrent_browser_outbox` | Exact target tuple/connection generation, monotonic delivery sequence, action/event reference, delivery attempts, acknowledged cursor, expiry. It is separate from conversation-wide `concurrent_events`. |

Additional requirements:

- add nullable immutable `owner_user_id` and `owner_actor_id` to
  `concurrent_conversations`; populate them on new writes, preserve legacy null
  rows, and categorically block browser grants/sessions on null, mismatched, or
  shared ownership;
- enforce write-once ownership in the database and repository: an authorized
  legacy ownership-establishment flow may set both null fields together once,
  but no normal update can transfer or clear them;
- make conversation, message, run, and event queries/RLS respect non-null
  conversation ownership so browser-derived final messages and events cannot
  be fetched by another actor in the same organization/assistant;
- enable and force RLS on every new browser table;
- extend transaction-local context setup to set `worklin.user_id` and
  `worklin.actor_id`; browser policies check organization, assistant, user, and
  actor, while existing conversation-family policies conditionally enforce
  non-null ownership and preserve legacy behavior only for null-owned,
  browser-disabled rows;
- keep compound foreign keys and repository predicates even with RLS;
- update the concurrent run-status check constraint for
  `waiting_for_browser` (or a future generic `waiting_for_tool`);
- assign a monotonic per-conversation turn sequence and implement a
  conversation-row-locked claim that admits only the earliest nonterminal run;
  waiting runs block later sequences until resumed or terminal;
- index exact-client pending delivery, current connection, runnable result,
  session expiry, and retention cleanup paths;
- add a durable runnable-run claimer/sweeper so a result committed after a
  replica crash is eventually resumed without relying on the original
  `submitMessage()` call;
- reuse the concurrent runtime's least-privilege durable claim mechanism. Any
  cross-tenant scan must be a narrow claim-only `SECURITY DEFINER` function or
  dedicated worker role; it returns the claimed tenant context and all
  subsequent reads/writes re-enter tenant-scoped transactions. The normal API
  role never receives general RLS bypass;
- store no raw tokens or credentials, and no raw browser content in operational
  logs.

### Broker and edge protocol

Use a separate browser-control stream rather than the conversation-wide
`/v1/events` stream. The logical operations are:

| Operation | Semantics |
|---|---|
| Register/connect/resume | Authenticated POST resumes the same unexpired generation after transient loss or explicitly supersedes it when continuity fails; returns an opaque connection credential and cursor. |
| Heartbeat/disconnect | POST renews or releases the exact connection lease. |
| Browser command SSE | GET reads only outbox rows for the signed full tuple, exact installation, connection ID, and current generation; supports cursor/`Last-Event-ID`. |
| Receipt | POST records durable receipt/start before mutation and conditionally advances action state. |
| Result | POST idempotently commits a terminal result and makes the owning run runnable. |
| Superseded-result recovery | The current authenticated installation may submit a terminal receipt already persisted for its superseded generation; the server accepts only a matching previously started action and grants no stream/action/session authority. |
| Session event | POST records detach, navigation epoch, human ownership, or invalidation for the exact session. |
| Cancel | Outbox event requests best-effort cancellation for the exact action/generation. |

Final URL mounting must preserve both deployment shapes: the self-hosted
gateway namespace and the platform's assistant-nested namespace. The edge
validates the extension's existing auth, derives identity, and forwards signed
claims plus exact client/interface headers. The concurrent service does not
accept a self-asserted organization, user, or actor from JSON.

Connection credentials are short-lived, bound to the complete tuple and
generation, stored in `chrome.storage.session`, and never placed in query
strings or logs. The stable installation ID remains an identifier, not a
secret. A transient reconnect presents the resume credential and retains its
generation; a second live stream for that generation deterministically fences
the older transport. Generation supersession is a security event, not the
ordinary reconnect path.

SSE is at-least-once. The extension advances its cursor only after it has
durably recorded the inbound command. A database notification may reduce
latency, but durable polling/outbox recovery remains the correctness path.

### Extension version-two path

Preserve the current `host_browser_request` dispatcher and result routes for
dedicated assistants. Add a separate broker event discriminator and modules,
keeping `worker.ts` as wiring rather than growing another implementation into
that already large file.

Likely modules:

- `background/browser-broker-dispatcher.ts`;
- `background/browser-action-cache.ts` or
  `background/browser-command-ledger.ts`;
- `background/browser-tab-leases.ts`;
- `background/browser-consent.ts`;
- `background/sse-cursor-store.ts`.

Update `sse-connection.ts`, `client-identity.ts`, and `worker.ts` only for
handshake, cursor, routing, heartbeat, and lifecycle integration.

Extension rules:

- map opaque tab leases to Chrome tab IDs locally;
- never service a broker event with the active tab or a recency fallback;
- translate reviewed semantic operations to a hardcoded CDP allowlist;
- increment/invalidate document epochs on navigation, reload, renderer
  replacement, detach, and closure;
- persist a bounded ledger in `chrome.storage.local` before mutation, obtain
  the server's idempotent receipt acknowledgement, and persist a sanitized
  terminal receipt before callback; if the receipt is not acknowledged, do not
  call CDP;
- retry idempotent callbacks until the server acknowledges the canonical
  result;
- after generation supersession, submit only locally persisted terminal
  receipts through the recovery operation; never revive the old stream, tab
  lease, or action authority;
- persist the scoped cursor in `chrome.storage.local`, keep connection
  credentials in `chrome.storage.session`, and bound ledger/cursor storage by
  TTL and count;
- do not send new broker events through the legacy raw activity logger;
- record only action ID prefix, high-level operation, status, timing, and
  coarse error; never store URL/query, selector text, typed values, DOM,
  screenshots, response content, tokens, or actor identifiers;
- add no Chrome permission beyond the existing `debugger`, `tabs`, `storage`,
  and URL permissions for version one; complete a Chrome Web Store/privacy
  disclosure review before release.

### Safe page representation

The extension produces a compact, bounded, redacted DOM/accessibility view.
Interactive nodes receive opaque element references tied to
`tabLeaseId + documentEpoch + snapshotId`. The server/model does not receive
Chrome tab IDs, backend node IDs, or a reusable cross-page selector.

Before returning an observation:

- remove hidden values and redact password, OTP, payment, recovery, and
  sensitive `autocomplete` fields;
- omit cookies, storage, browser chrome, extension pages, and cross-origin
  secrets;
- wrap page text with the existing untrusted-content treatment so page
  instructions are data, not authority;
- truncate by node count, text bytes, image bytes, and frame count;
- reject privileged schemes and private-network targets in deterministic
  server policy before sending a navigation command;
- enforce the same policy in the extension for direct navigation, link
  targets, redirects, and top-level navigation commits; if reliable
  post-resolution public-network enforcement cannot be proved with the current
  Chrome permissions, keep navigation on an explicit reviewed-origin allowlist
  rather than weakening the boundary;
- return `user_input_required` and transfer ownership to the human for login,
  MFA, CAPTCHA, secret entry, file selection, or other unsupported interaction.

Raw DOM and screenshots are not retained in logs or long-term action rows. If
crash-safe model resumption requires observation content, store only a bounded,
encrypted short-lived payload or object reference and delete it after the run
or retention deadline. Persist sanitized result metadata and content digests
for idempotency.

### Consent, consequential actions, and human takeover

Reuse the permitted conversation-scoped host-computer access gate. Do not add
global allow modes, per-tool trust rules, ten-minute approvals, wildcard
scopes, or persistent “always allow” UI under permission-controls v2.

The browser tool description should instruct the assistant to ask in the
conversation before consequential actions such as send, submit, purchase,
delete, publish, or permission changes. Do not approximate this judgement with
hardcoded string scoring. The deterministic broker enforces identity,
connection, tab, epoch, deadline, URL, sensitive-field, quota, and consent
boundaries; the assistant handles contextual judgement.

Changing the conversation host-access state must use the generic
`sync_changed` invalidation contract so other clients refetch canonical state.
Live action progress remains domain-specific.

### Quotas, observability, and retention

Enforce bounded:

- concurrent sessions and connections per organization/assistant/actor/client;
- queued and in-flight actions per session;
- one mutating action per tab lease;
- model tool rounds, actions, total turn duration, and command deadlines;
- snapshot nodes/text bytes, screenshot dimensions/bytes, result payload size,
  SSE backlog, callback retry, and retained ledger entries;
- connection/session idle and absolute TTL.

Metrics should include current connections, generation changes, queue age,
delivery/receipt/completion latency, cursor lag, action status totals,
dedupe/replay counts, unknown outcomes, stale generation/epoch rejects,
identity/consent/quota rejects, extension versions, run-resume latency, and
cleanup backlog. Correlation uses opaque or hashed tenant/client/action IDs.
Logs and traces exclude URL contents, page text, screenshots, typed values,
tokens, and credentials.

## Implementation Plan

### Phase 0 - Freeze the protocol and safety contract

PR 0A — architecture and threat model:

1. Record the authoritative identity tuple and which edge derives each field.
2. Classify every candidate operation as read-only/recomputable, idempotent, or
   mutating/non-replayable.
3. Freeze the action, connection resume/supersession/recovery, explicit client
   selection, tab-lease, document-epoch, ownership, cancel, and
   unknown-outcome state machines.
4. Document URL/scheme/network policy, sensitive-field policy, data retention,
   untrusted-page handling, and human takeover.
5. Review gateway and companion-platform route/auth requirements.
6. Obtain security and tooling-direction review.

The contract decision must specify that a transient reconnect reuses a valid
generation, that a superseded generation has terminal-result-only recovery,
and that conversation host access stores the user's explicit installation
choice. It must also freeze earliest-nonterminal conversation claiming and the
non-secret provider/tool configuration snapshot required for resumption.

PR 0B — inert contracts and gates:

1. Add versioned Zod contracts and contract tests.
2. Add a deny-by-default `browser_broker_v1` capability identifier and inert
   configuration/kill switch.
3. Add guard tests proving concurrent modules cannot import process-global
   browser manager, host-browser proxy, pending interactions, pinned tabs, or
   local CDP clients, including `assistant/src/browser/operations.ts` and the
   dedicated browser execution stack.
4. Add protocol/state-machine pure unit tests before transport code.

Phase gate:

- security approves the threat model and unknown-outcome semantics;
- companion platform confirms exact auth/header/SSE forwarding design;
- contract tests reject unknown versions, operations, oversized values, and
  model-supplied scope;
- the capability remains unadvertised.

Rollback: remove or disable inert gate use. No runtime or extension behavior
depends on the contracts yet.

### Phase 1 - Build the durable broker foundation

PR 1A — ordered migrations:

1. Replace the migration-001-only initializer with an ordered append-only
   registry and tests for fresh install, 001-to-002 upgrade, idempotent retry,
   partial failure, and immutable migration history.
2. Add migration 002 with browser clients, connections, grants, sessions, run
   steps, actions, outbox, conversation turn sequence, indexes, run status, and
   RLS.
3. Add safe nullable immutable conversation owner fields and transitive
   ownership policies for conversation messages/runs/events. Do not infer an
   owner for legacy rows from a conversation UUID.
4. Set transaction-local user/actor claims and test pooled-connection reset.

PR 1B — store contracts and state machine:

1. Extend `store.ts`, `postgres-store.ts`, `in-memory-store.ts`, and runtime
   types with tenant-required broker methods.
2. Implement conditional state transitions, operation/result hashing,
   idempotent result commits, cursor acknowledgement, session fencing, expiry,
   and retention cleanup.
3. Atomically persist provider tool step, browser action, and outbox event.
4. Implement explicit installation selection on the conversation grant,
   same-generation connection resume, deliberate supersession, and
   terminal-result-only recovery.
5. Add the conversation-row-locked earliest-nonterminal runnable-run claim and
   recovery path; cancellation and terminal failure unblock the next turn.
6. Keep the in-memory implementation as a deterministic contract-test double,
   never a production source of truth.

PR 1C — broker service and internal routes:

1. Add registration, heartbeat, disconnect, exact-client SSE, receipt, result,
   session-event, and cancellation handlers under a focused
   `concurrent-runtime/browser-broker/` module.
2. Authenticate every call against signed scope, exact installation,
   connection ID/generation, conversation, session, and action linkage.
3. Add SSE backpressure, cursor, expiry, and reconnect behavior.
4. Add mechanical recovery and cleanup scheduling without invoking an LLM for
   work that was not user-requested.

Phase gate:

- a two/three-replica integration test enqueues on replica A, serves SSE on B,
  accepts a result on B, and resumes/claims on A or C;
- a full cross-organization/assistant/user/actor/client matrix proves no
  cross-fetch, acknowledgement, cancellation, session event, or result;
- browser-derived history/events from an owned conversation are invisible to a
  different user/actor in the same organization and assistant;
- legacy null-owned and shared conversations cannot acquire a browser grant;
- stale generations and conflicting duplicate results fail closed;
- transient reconnect retains its generation, while superseded generations can
  recover matching terminal evidence but cannot receive or execute work;
- a waiting browser run blocks later runs in the same conversation while other
  conversations continue;
- no model tool or production capability is enabled.

Rollback: disable the broker routes and consumers. Tables and inspectable
records remain; no production extension emits the new protocol.

### Phase 2 - Ship the dormant extension protocol

PR 2A — handshake, cursor, and lifecycle:

1. Advertise supported broker protocol/capabilities in the connection
   handshake.
2. Resume the current unexpired connection generation across transient SSE and
   service-worker loss; create a new generation only under the frozen
   supersession rules.
3. Persist cursor by deployment mode, organization, assistant, installation,
   and connection generation.
4. Advance the cursor only after durable local receipt.
5. Implement heartbeat, deliberate supersession, terminal-receipt recovery,
   and disconnect.

PR 2B — separate dispatcher, tab lease, and ledger:

1. Add the broker dispatcher without changing legacy
   `host-browser-dispatcher.ts` behavior.
2. Add explicit opaque tab leases and no-fallback tab resolution.
3. Add document/snapshot epochs and invalidation.
4. Add the bounded mutation ledger, cached result replay, and
   `unknown_outcome` behavior.
5. Add idempotent result retry and receipt callback.
6. Add sanitized activity storage and sensitive-data absence tests.

PR 2C — user-visible control shell:

1. Add controlled-tab indicator and protocol/version status.
2. Add Pause/Take over/Resume/Release controls.
3. Let the authenticated user choose/confirm this installation for a
   conversation grant; bind the selection server-side and show ambiguity as a
   blocking state.
4. Add clear incompatible/offline/reconnect states.
5. Confirm no manifest permission expansion and update privacy disclosure
   drafts.

Phase gate:

- service-worker restart and network-drop fault injection around each mutation
  boundary produces at most one CDP mutation;
- connection supersession fences the old stream, ledger, callbacks, and tab
  lease while preserving terminal-receipt-only recovery;
- ordinary reconnect does not spuriously supersede a generation or discard a
  known locally persisted terminal result;
- two compatible installations require an explicit stored choice; no
  last-seen/recency rule selects one;
- account/assistant switch cannot reuse another cursor or lease;
- a different actor cannot attach the extension to an owned browser
  conversation even when the conversation ID is known;
- all dedicated host-browser dispatcher tests remain unchanged and green;
- the server capability remains hidden.

Rollback: stop emitting the new event discriminator. The dormant extension
modules remain installed; dedicated assistants continue using the legacy path.

### Phase 3 - Add explicit tab sessions and read-only observations

PR 3A — safe semantic executor:

1. Implement new-tab lease creation, status, snapshot, screenshot, bounded
   wait, and close-session operations.
2. Translate them to a reviewed CDP allowlist inside the extension.
3. Implement compact DOM/accessibility snapshots with opaque references,
   epoch binding, redaction, untrusted-content framing, and size limits.
4. Implement privileged-scheme/private-network rejection and tab/session TTL.

PR 3B — read-only resumable model loop:

1. Add normalized durable run steps and the browser-only provider loop.
2. Freeze the run's non-secret resolved provider/model/config, prompt version,
   and browser tool-schema version before its first provider call and use that
   snapshot on every resume.
3. Offer only status/open/snapshot/screenshot/wait/close to allowlisted test
   tenants.
4. Release the replica lease while waiting and resume the earliest run on any
   replica without releasing conversation ordering.
5. Enforce step, byte, image, command, turn, and cancellation budgets.

Phase gate:

- a real signed-in Chrome tab is opened only after conversation host access;
- observations from two actors/clients cannot cross;
- a replica restart during browser wait resumes from the persisted provider
  step without repeating a completed provider decision;
- changing the active profile/model/tool schema during a wait does not change
  the resumed run; unavailable frozen provider credentials fail explicitly
  rather than silently switching provider;
- password/OTP/payment values, hidden values, and raw browser IDs never reach
  storage, logs, or the model;
- read-only internal canary succeeds before any click/type operation exists.

Rollback: disable the read-only browser tool gate and release active tab
leases. Chat stays available and dedicated behavior is unchanged.

### Phase 4 - Add navigation and interaction mutations

PR 4A — navigation and stale-page protection:

1. Add HTTPS navigation under deterministic URL policy.
2. Increment document epoch and require a new snapshot after navigation.
3. Reject stale element references, redirects to blocked targets, expired
   deadlines, and post-cancel delivery.

PR 4B — reviewed interaction set:

1. Add click, replace-style type, restricted key, scroll, and select-option.
2. Serialize mutating actions per tab lease.
3. Refuse sensitive-field entry and return `user_input_required`.
4. Apply post-action observation and bounded postcondition reporting.
5. Reconcile unknown outcomes with read-only inspection, never automatic
   replay.

PR 4C — human ownership and consequential-action flow:

1. Park agent work during human takeover, login, MFA, CAPTCHA, secret entry,
   file selection, or unsupported browser UI.
2. Force a fresh snapshot before agent resume.
3. Add conversational confirmation guidance for consequential actions in the
   tool definition, without deterministic string heuristics or new persistent
   approval modes.
4. Propagate cancellation and conversation host-access revocation to actions
   and leases.

Phase gate:

- stale epoch and stale connection actions never call CDP;
- click/type crash matrices prove no blind mutation replay;
- user takeover prevents agent actions and does not leak human-entered secrets;
- cancellation/result races have one canonical, auditable terminal state;
- the internal canary completes a non-sensitive form flow in the user's logged-
  in browser with the exact selected client.

Rollback: disable mutating operations while retaining optional read-only
observation. In-flight mutations become cancelled, expired, or inspectable
`unknown_outcome`; never report them as safely undone.

### Phase 5 - Complete edge, web, and extension product integration

1. Add/verify platform and self-hosted gateway proxy routes, auth claims,
   interface/client headers, SSE buffering, timeouts, and callback bodies.
2. Regenerate API specifications and clients from committed sources.
3. Surface compatible connection state, chosen client installation, host-access
   state, human ownership, extension update requirements, and release controls
   without exposing raw identifiers.
4. Emit `sync_changed` for persisted host-access changes and refetch through
   existing clients.
5. Add operational status that distinguishes runtime support, compatible client
   presence, conversation grant, active session, and temporary failure.
6. Add user-facing privacy copy explaining that DOM text/screenshots are sent
   to the assistant/model while Chrome cookies remain in Chrome.
7. Finish Chrome Web Store/privacy disclosure review.

Phase gate:

- cloud and self-hosted end-to-end tests pass through their real proxy shapes;
- logout, org switch, assistant switch, conversation switch, revoke, and
  extension uninstall all release/fence access;
- incompatible/absent extension states are actionable and never trigger an
  implicit placement change;
- existing web, dedicated runtime, and extension behavior has no regression.

Rollback: hide browser controls and close new browser admission. Existing
concurrent chat remains usable.

### Phase 6 - Prove security, recovery, capacity, and operations

1. Run full identity-isolation and malicious-callback matrices.
2. Crash replicas and extension service workers before/after outbox commit,
   SSE delivery, durable receipt, CDP mutation, terminal ledger write, result
   commit, and run wake-up.
3. Test SSE gaps, duplicate/out-of-order delivery, stale cursor, connection
   supersession, callback retry storms, and slow consumers.
4. Test blocked schemes/networks, redirect chains, oversized/malformed
   observations, prompt injection, sensitive fields, and tab replacement.
5. Load-test many organizations, actors, clients, sessions, and waiting runs;
   measure database hot spots, SSE connection cost, queue age, event-loop lag,
   and cleanup throughput.
6. Drill global kill switch, per-cohort disable, drain, cancel, unknown-outcome
   inspection, retention cleanup, backup, and restore.
7. Complete security/privacy review and define production SLOs/alerts from
   measured behavior.

Phase gate:

- zero cross-scope reads, commands, acknowledgements, callbacks, artifacts, or
  metrics labels;
- zero duplicated CDP mutations in the crash/replay suite;
- every ambiguous mutation becomes inspectable `unknown_outcome`;
- kill-switch and restore drills pass;
- latency, queue age, connection density, error rate, and storage growth meet
  agreed thresholds.

Rollback: no external cohort is enabled. Keep the broker gated while retaining
test data for investigation according to retention policy.

### Phase 7 - Canary and promote the capability

1. Deploy inert server and extension support first.
2. Enable an internal synthetic organization with an exact current extension.
3. Canary read-only observation on public test sites.
4. Add navigation, then non-sensitive click/type, one operation class at a
   time after metric and security review.
5. Admit an explicit low-volume external cohort gated by minimum extension and
   protocol version.
6. Advertise `browser_broker_v1`/browser control as concurrent-safe only after
   live-client and phase gates pass.
7. Expand cohorts from measured SLOs and unknown-outcome rate; keep dedicated
   extension behavior unchanged through at least one full rollback window.
8. Update the hybrid capability matrix only after promotion approval.

Rollback:

- stop new browser actions immediately through the global capability gate;
- emit best-effort cancels and release/expire tab leases;
- allow safe result callbacks for already issued actions so outcomes remain
  inspectable;
- mark unfinished started mutations `unknown_outcome`, not `cancelled`, unless
  terminal evidence proves cancellation;
- keep concurrent chat available;
- do not silently provision or route to a dedicated runtime because an
  extension is offline;
- leave the existing dedicated extension path unchanged.

## Public And Internal Interfaces

### Existing behavior to preserve

- Existing cloud and self-hosted extension authentication.
- Existing dedicated `host_browser_request`, host-browser result/event/session
  routes, raw dispatcher behavior, and supported tools.
- Existing concurrent chat, conversation history, cancellation, and SSE.
- Existing public assistant/conversation fields unless changed additively.
- Existing hybrid placement until capability promotion.

### Additive interfaces

- Versioned browser-broker schemas in `@vellumai/service-contracts`.
- Extension handshake fields for broker protocol/capability version.
- Exact browser client connect/heartbeat/disconnect operations.
- Exact-client browser command SSE with durable cursor.
- Idempotent command receipt/result/session-event operations.
- Additive conversation host-access and browser-session status.
- Additive concurrent runtime capability/operational status.
- A browser-only provider tool schema, present only when all gates pass.

Route names are finalized only after gateway and companion-platform review.
If existing host-browser callback paths are retained for compatibility, their
concurrent handlers still require the versioned envelope and full-scope
validation; they must not call the legacy in-memory resolver.

### Configuration

Use bounded configuration with safe defaults for:

- global/cohort capability enablement and emergency kill switch;
- minimum extension and protocol versions;
- connection heartbeat/lease, tab idle/absolute TTL, action deadlines, and
  retention windows;
- per-scope connection/session/action quotas;
- SSE batch/backlog/polling/keepalive limits;
- tool-round/action/time/observation/image budgets;
- allowed schemes, public-network policy, and optional future enterprise
  network policy.

If a new feature flag is added to the root feature-flag registry, ship the
required companion `vellum-assistant-platform` Terraform change in the paired
PR. Never use a deployment environment variable as a per-org entitlement.

## Data Boundary And Security

### Authorization invariants

- The edge-authenticated tuple is authoritative; IDs in model arguments or
  untrusted JSON cannot broaden it.
- Every repository method requires immutable tenant context plus the narrower
  browser scope it operates on.
- Browser-enabled conversations have immutable authenticated user/actor
  ownership, and that ownership is enforced when reading their messages, runs,
  and events as well as when dispatching commands.
- Legacy null-owned and shared conversations are browser-disabled until a
  separately reviewed ownership/delegation flow exists.
- RLS, compound keys, query predicates, connection generation, tab lease,
  epoch, and state transition checks provide defense in depth.
- Missing or ambiguous client/session/connection selection fails closed.
- The conversation grant stores the user's exact client-installation choice;
  the server never derives it from recency or presence ordering.
- A stable installation ID never authenticates a callback.
- A server-minted connection credential never appears in a URL or raw log.
- Old connection generations cannot stream, receipt, act, cancel, post ordinary
  results, or emit session events. The current authenticated installation may
  use the dedicated recovery operation only to submit matching terminal
  evidence already stored for a previously started old-generation action.
- The model never selects organization, actor, client, connection, raw tab,
  or CDP method.

### Privacy invariants

- Chrome cookies and storage remain in Chrome and are not broker outputs.
- Password, OTP, payment, recovery, hidden, and sensitive autocomplete values
  are redacted and not model-typed.
- DOM, screenshot, URL, selectors, typed text, and response content are absent
  from operational logs and extension activity storage.
- Short-lived observation payloads are size-bounded, encrypted at rest, and
  deleted by explicit retention policy.
- Telemetry uses coarse status and opaque correlation.
- Page content is treated as untrusted input, including instructions that ask
  the assistant to reveal data, change policy, or use unsupported tools.

### Threat cases to test explicitly

- Same conversation/client/tab/action IDs under different organizations,
  assistants, users, or actors.
- A second actor in the same organization/assistant reading browser-derived
  history or events by a known conversation ID.
- Two installations for one actor with no explicit client selection.
- Stolen stable client ID without valid user/actor auth.
- Old stream or callback after connection supersession.
- Known terminal evidence stranded by a transient reconnect or deliberate
  generation supersession.
- Multiple compatible installations with no explicit conversation selection.
- Replayed action with changed operation hash.
- Replayed terminal result with changed body.
- Stale element after navigation or human takeover.
- Extension restart after mutation start but before result.
- Malicious page prompt injection and secret-like DOM values.
- Redirect from public HTTPS to localhost/private/privileged target.
- Oversized DOM/screenshot/result and slow SSE consumer.
- Cancellation racing with receipt, mutation, result, tab close, or revoke.

## Test Plan

### Contract and state-machine tests

- Parse every version-one operation and terminal state.
- Reject unknown versions/operations, extra scope fields, invalid IDs,
  oversized strings/images/durations, and malformed discriminators.
- Exercise every legal and illegal action state transition.
- Verify operation/result hashes and identical/conflicting duplicate behavior.
- Verify connection resume versus supersession, terminal-result-only recovery,
  and explicit installation-selection schemas.

### Postgres and isolation tests

- Fresh migration, 001-to-002 upgrade, retry after interruption, and no
  migration reorder/removal.
- RLS plus query-level denial across organization, assistant, user, and actor.
- Immutable owner assignment on new conversations, safe legacy null ownership,
  same-assistant cross-actor denial for owned history/events, and browser denial
  for null-owned/shared conversations.
- Exact client/generation/session/action ownership checks.
- Pooled database connection resets transaction-local identity.
- Partial unique constraints for current connection/active session.
- Atomic run-step/action/outbox commit and result/run-runnable commit.
- Monotonic conversation turn sequencing, earliest-nonterminal claim under
  concurrent replicas, waiting-run blocking, and terminal unblocking.
- Expiry, retention, quota, and sweeper claim races.

### Multi-replica and recovery tests

- Enqueue on A, stream on B, callback on C, resume on A/C.
- Replica crash before and after provider-step persistence.
- Replica crash before and after outbox commit and result commit.
- Result committed without notification is recovered by the runnable sweeper.
- Same conversation remains ordered while a run waits; other conversations
  proceed.
- A later same-conversation run cannot be claimed by any replica until the
  earlier waiting run resumes or becomes terminal.
- Duplicate/out-of-order SSE, cursor gaps, reconnect, backpressure, and stale
  generation.

### Extension tests

- Cursor scope isolation and durable-receipt-before-advance.
- Stable installation plus new connection generation behavior.
- Transient reconnect reuses a generation; deliberate supersession fences new
  work but accepts a matching locally persisted terminal receipt for the old
  action.
- Two eligible installations require an explicit persisted user choice.
- Exact tab lease only; active-tab and arbitrary-tab fallback rejected.
- Navigation/detach/closure increments or expires the document epoch.
- Drop before receipt, after receipt, after mutation start, after terminal
  ledger write, and before result acknowledgement.
- Completed duplicate returns cached result with zero CDP calls.
- Started-without-result mutation returns `unknown_outcome` with zero replay.
- Read-only observation recomputation follows policy.
- Password/OTP/payment typing, privileged URL, localhost, RFC1918, link-local,
  and redirect-to-private are refused.
- Sanitized activity storage contains no URL, selector, typed value, DOM,
  screenshot, response content, token, or actor ID.
- Legacy dedicated host-browser tests remain green.

### Model-loop and user-flow tests

- Tool is absent when capability, client compatibility, presence, or host
  access is missing.
- Provider tool-use is persisted before dispatch and not regenerated after a
  restart.
- Provider/model/inference settings and prompt/tool schema remain pinned when
  the active profile or deployed default changes during browser wait.
- Tool results are paired to the correct persisted tool-use ID.
- Step/action/time/byte/image budgets terminate predictably.
- Offline/update-required/consent-required/user-input-required/unknown-outcome
  produce clear assistant-visible results.
- Human takeover parks the agent and resume requires a fresh snapshot.
- Consequential actions are confirmed conversationally in eval scenarios.
- Prompt injection in page content cannot broaden tool or identity authority.

### Verification commands

Run only files that exist or are added by the corresponding PR. Split commands
further if a package test exceeds the normal bounded runtime.

```powershell
cd packages/service-contracts
bun test src/browser-broker.test.ts
bunx tsc --noEmit

cd ../../assistant
bun test src/concurrent-runtime/auth.test.ts src/concurrent-runtime/http-server.test.ts src/concurrent-runtime/service.test.ts src/concurrent-runtime/postgres-store.test.ts
bun test src/concurrent-runtime/browser-broker/store.test.ts src/concurrent-runtime/browser-broker/service.test.ts src/concurrent-runtime/browser-broker/routes.test.ts src/concurrent-runtime/browser-broker/tool-loop.test.ts
bun test src/__tests__/host-browser-proxy.test.ts src/__tests__/host-browser-routes.test.ts src/__tests__/host-browser-event-routes.test.ts
bunx tsc --noEmit
bun run generate:openapi

cd ../clients/chrome-extension
bun test background/__tests__/sse-connection.test.ts background/__tests__/browser-broker-dispatcher.test.ts background/__tests__/browser-command-ledger.test.ts background/__tests__/browser-tab-leases.test.ts
bun test background/__tests__/host-browser-dispatcher.test.ts background/__tests__/cdp-proxy.test.ts
bun run typecheck
bun run lint

cd ../../gateway
bun test src/http/routes/ipc-runtime-proxy.test.ts
bunx tsc --noEmit
```

Also run the companion platform's scoped proxy/auth/SSE/generated-client tests
after that repository is available.

## Documentation Plan

Update as the corresponding phase ships:

- `ARCHITECTURE.md` with browser broker ownership and data flow;
- concurrent and hybrid runtime docs with capability classification and
  rollback behavior;
- gateway/platform API and authentication documentation;
- extension setup, update requirement, controlled-tab indicator, Pause/Take
  over/Resume/Release, and privacy behavior;
- security threat model, incident playbook, unknown-outcome runbook, retention,
  and audit fields;
- production deployment, SLOs, alerts, dashboards, kill switch, drain, and
  restore procedures;
- Chrome Web Store privacy disclosure and permission rationale.

Do not describe the internal service as a “daemon” in user-facing UI/docs.

## Rollout Plan

### Controls

- Global emergency kill switch.
- Organization/assistant cohort gate.
- Minimum extension/protocol version.
- Operation-class gates: observe, navigate, mutate.
- Exact live-client presence gate.
- Conversation host-access gate.
- Per-scope quotas and circuit breakers.

### Promotion order

1. Contracts and schema, unused.
2. Broker endpoints, unused.
3. Dormant extension support.
4. Internal exact-client transport canary with synthetic commands.
5. Read-only public-site observation.
6. Navigation on public sites.
7. Non-sensitive click/type flows.
8. Small external cohort.
9. Concurrent-safe capability advertisement.
10. Wider cohorts only after SLO and security review.

### Promotion gates

- Zero cross-scope isolation failures.
- Zero duplicate mutations in fault tests.
- Unknown outcomes are rare, observable, and handled safely.
- Exact-client routing has no ambiguity/fallback.
- Connection, cursor, recovery, cleanup, and kill-switch drills pass.
- Extension privacy tests and store disclosure review pass.
- Companion platform and self-hosted gateway compatibility is verified.
- Existing dedicated browser behavior has no regression.
- Latency, error rate, queue age, database/SSE capacity, and retention meet
  agreed SLOs.

## Risks And Guardrails

| Risk | Guardrail |
|---|---|
| Cross-tenant or cross-user command delivery | Full immutable scope, exact connection stream, compound keys, RLS, signed claims, attack matrix |
| Wrong browser installation | User-selected installation persisted on the conversation grant; ambiguity fails closed; no recency/default fallback |
| Reconnect discards or duplicates outcomes | Resume the same valid generation; deliberate supersession fences execution but permits matching terminal-receipt-only recovery |
| Old connection acts after supersession | Monotonic generation and fencing on stream, lease, receipt, ordinary result, event, and cancel |
| Wrong or stale tab | Opaque explicit tab lease, local tab mapping, document/snapshot epoch, no active-tab fallback |
| Duplicate click/type | Durable server action ID plus extension pre-mutation ledger; terminal replay or unknown outcome |
| Replica crash loses model progress | Persisted run steps, waiting state, transactional result wake, durable runnable sweeper |
| Later turn overtakes browser wait | Monotonic conversation sequence and row-locked earliest-nonterminal claim |
| Resume changes provider/tool protocol | Frozen non-secret run execution snapshot and versioned tool schema; no silent provider/model switch |
| Extension crash hides action outcome | Persist start/terminal locally; unknown outcome never auto-replayed |
| Human and agent act simultaneously | Ownership lease, Pause/Take over, parked run, fresh snapshot on resume |
| Credential or private-data exposure | Sensitive-field refusal/redaction, cookies stay local, bounded encrypted observations, sanitized logs |
| Prompt injection from page | Untrusted-content framing, fixed high-level tool schema, deterministic capability/identity policy |
| Intranet/privileged target access | Server and extension URL/scheme/private-network policy, redirect/commit validation, or a reviewed-origin allowlist |
| Unbounded page/tool loop | Step/time/action/image/DOM/backlog quotas, deadlines, cancellation, circuit breakers |
| Existing dedicated regression | Separate event discriminator/dispatcher and unchanged legacy routes/tests |
| Capability advertised too early | Deny-by-default gate, minimum protocol, phase promotion criteria |
| Silent placement surprise | Clear unavailable/update state; no automatic dedicated fallback |
| Sensitive extension activity log | New sanitized logger path plus storage-content regression tests |
| Scope turns into general computer use | Browser-only allowlist and concurrent import guards |

## Acceptance Criteria

- A concurrent assistant can operate one explicitly leased Chrome tab in the
  authenticated user's existing profile without replica affinity.
- Every browser record and request is scoped to organization, assistant, user,
  actor, conversation, client installation, connection generation, session,
  and action as applicable.
- Browser-enabled conversations are immutably owned by the authenticated
  user/actor, and browser-derived messages/runs/events cannot be read by another
  actor in the same assistant; legacy null-owned and shared conversations are
  browser-disabled.
- Two replicas can deliver and complete the same run without an in-memory
  callback, and a third replica can resume it after failure.
- No code path chooses a recent/default client, active tab, raw model-supplied
  tab, local browser, desktop bridge, or dedicated fallback.
- Enabling host access stores the user's explicit client-installation choice;
  multiple eligible installations without a choice fail closed.
- Transient reconnect preserves the current generation and terminal evidence;
  deliberate supersession fences all old-generation execution while allowing
  only matching terminal-receipt recovery.
- The provider's tool decision is durably stored before browser dispatch.
- Same-conversation turns remain strictly ordered while the earliest run waits
  for Chrome, and other conversations continue concurrently.
- A resumed run uses its frozen non-secret provider/model/config and
  prompt/tool-schema versions or fails explicitly; it never silently switches.
- Mutation delivery is at-most-once at the extension: known duplicates replay a
  cached result and ambiguous starts become `unknown_outcome`.
- Duplicate result POSTs are idempotent; conflicting results and stale scope,
  generation, lease, or epoch fail closed.
- Host access defaults off per conversation; revocation immediately blocks new
  actions, fences undelivered work, and requests best-effort cancellation.
- Human takeover parks agent actions, and resume requires a fresh observation.
- Password/OTP/payment entry, privileged/private navigation, raw CDP, arbitrary
  tabs, cookies/storage, upload/download, and general desktop use are absent.
- DOM, screenshots, URLs, selectors, typed values, tokens, and credentials are
  absent from operational logs and new extension activity records.
- Step, time, action, snapshot, image, connection, session, queue, and retention
  limits are enforced.
- Kill switch stops new browser actions while preserving chat and inspectable
  outcomes for issued commands.
- Existing dedicated extension/browser behavior remains operational and its
  regression suite passes.
- Architecture, security, privacy, operations, gateway/platform, extension,
  and user documentation are complete.

## Future Improvements

- Explicit extension-UI selection of an existing tab, with the same opaque
  lease and consent boundaries.
- Organization-managed allowlists for private enterprise origins after a
  separate threat model and policy design.
- File upload/download workflows with explicit human selection and content
  scanning.
- Multi-assistant extension multiplexing with independent authenticated
  connection generations.
- A dedicated broker deployment if connection density or scaling warrants it,
  without changing the durable protocol or ownership model.
- Richer visual grounding and page-diff compression with the same privacy and
  epoch boundaries.
- Additional concurrent-safe browser operations after per-operation security
  review and canarying.

## Assumptions

- The concurrent multi-tenant service foundations from the referenced plan are
  implemented or are implemented in the same dependency order.
- The Chrome extension remains the trusted local execution client and retains
  access to the user's logged-in Chrome session.
- Platform/gateway authentication can derive organization, assistant, user,
  actor, and interface/client binding and can proxy long-lived SSE plus POST
  callbacks.
- Postgres is available to all concurrent replicas and is the authoritative
  action, outbox, run-step, cursor, lease, and recovery store.
- Version one supports one selected assistant per extension connection and one
  controlled tab per conversation browser session.
- Product/security accept a clear `unknown_outcome` state as the only honest
  result after an unprovable mutation boundary.
- A separate plan is required for general host-computer control, local browser
  fallback on shared infrastructure, private-network browsing, or credential
  entry.
