# ChatGPT Data Layer — Hybrid Strategy for GPT Enhancer

> **Status:** Proposed architecture and rollout plan.
>
> **Evidence:** The private endpoints and DOM/API identifiers in this note were observed
> against a logged-in `chatgpt.com` session on 2026-06-30. They are implementation
> details, not a supported OpenAI API contract, and must be re-verified before release.
>
> **Canonical data model:** the conversation schema, content-type catalog, citation
> mechanism, edge cases, and the still-unverified list live in
> [chatgpt-internals-reference.md §4](./chatgpt-internals-reference.md#4-private-rest-api).
> This document is the **rollout plan**; it links there instead of restating, so the two
> can't drift.
>
> **Goal:** Make conversation-dependent features complete and responsive on long chats
> without weakening the extension's client-side privacy model. Use structured ChatGPT
> conversation data where it is materially better, retain DOM adapters as fallback, and
> keep visual page enhancements DOM-driven.

---

## 1. Decision summary

Adopt a hybrid data layer, with these boundaries:

1. **API-first conversation snapshots** for complete transcript data.
2. **DOM fallback** when the private endpoint is unavailable, invalid, or unsupported.
3. **DOM-only page enhancements** for features that modify the rendered ChatGPT UI.
4. **Fail-closed visibility filtering** so hidden system, memory, reasoning, and tool
   content cannot leak into an export.
5. **No bulk access or background polling.** Fetch only the conversation currently open,
   after a user action or a bounded TOC refresh.

Canonical export rendering (driving DOCX/PDF/PNG from the API snapshot instead of the DOM)
is an **optional, deferred sub-project** — explicitly **not** part of the core fix. It is
the largest and riskiest piece (it amounts to reimplementing ChatGPT's Markdown/KaTeX
renderer) and the long-chat problem is fully solved without it. See §10.3 and the
"Deferred" note in §16.

This is not a migration to the public OpenAI Conversations API. The public API does not
provide a documented route to a user's existing ChatGPT website history. The endpoint
described here is ChatGPT's private frontend data endpoint.

### What this solves

- Complete export input even when old turns are not mounted in the DOM.
- A complete TOC index from the first successful snapshot.
- Explicit active-branch handling for edited and regenerated messages.
- Less scroll-driving, repeated DOM scanning, and selector-dependent serialization.
- A single conversation model shared by Export and TOC.

### What this does not solve by itself

- Scrolling the live ChatGPT page to a virtualized message that is not mounted.
- Browser limits for extremely tall single-image PNG exports.
- DOM drift in themes, fonts, RTL fixes, KaTeX interaction, or quick-action positioning.
- Canvas, citations, files, widgets, and unknown future content types without dedicated
  adapters and fixtures.
- Product/legal approval for depending on a private endpoint.

---

## 2. Feature inventory and ownership

| Feature | Current behavior | Recommended ownership |
|---|---|---|
| **Export: JSON / Markdown / CSV** | Scrapes and serializes mounted DOM | **API-first snapshot**, DOM fallback |
| **Export: DOCX** | Converts cloned HTML and rendered KaTeX | **DOM now**; canonical-from-API is a deferred sub-project (§10.3) |
| **Export: PDF** | Prints an offscreen export stage | **DOM now**; canonical-from-API deferred (§10.3) |
| **Export: PNG** | Rasterizes an offscreen export stage | **DOM now**; canonical-from-API deferred; size limits remain regardless |
| **Table of Contents: entries** | Scans mounted assistant turns | **API-first snapshot**, DOM fallback |
| **Table of Contents: live-page navigation** | Scrolls to mounted DOM nodes | **DOM bridge** plus bounded targeted navigation; see §9 |
| **Quick export panel** | UI entry point for export | Keep DOM UI; delegate data acquisition to the shared service |
| **RTL/LTR and code-direction fixes** | Patches rendered nodes | **DOM only** |
| **Fonts** | Detects text and applies font classes/styles | **DOM only** |
| **Themes** | Applies CSS variables and observes page theme | **DOM only** |
| **KaTeX click-to-copy** | Reads rendered MathML annotations | **DOM primary**; API markdown is only a possible fallback |
| **Prompt library** | Uses `chrome.storage` | Unchanged; no ChatGPT conversation dependency |
| **Review/retention language hint** | Samples mounted message text | Keep DOM; not worth coupling to the private endpoint |
| **In-app help/settings** | Extension-owned UI | Unchanged |

The data layer directly serves **Export** and **TOC**. It should not be introduced into
visual features merely because API text is available.

---

## 3. Current root cause

The existing conversation path assumes the DOM can be made complete:

- `src/export/core/scraper.js` inserts sentinels, force-scrolls, observes mutations,
  waits for quiet windows, and restores scroll position.
- `src/content/toc/logic.js` builds its list from currently mounted assistant turns.
- `src/content/selectors.js` uses a broad fallback chain, ending with generic `article`.
- Export can fall back to cloning `main.children` or the whole `main`, which may capture
  unrelated controls when the message contract changes.

On a virtualized long chat, the DOM is a partial and transient projection. Forcing a
full traversal is slow and does not guarantee that all turns remain mounted at the same
time. Structured conversation data is the correct source for completeness.

The hybrid data layer does **not** eliminate all DOM maintenance. Live visual features
still need a narrower DOM adapter, strict selectors, and incremental mutation handling.

---

## 4. Private ChatGPT data source

> The full data model, content-type catalog, citation algorithm, edge cases, and
> still-unverified items are documented once in
> [chatgpt-internals-reference.md §4](./chatgpt-internals-reference.md#4-private-rest-api).
> This section keeps only what the rollout decisions depend on.

Observed authenticated flow:

```js
const session = await fetch('/api/auth/session', {
  credentials: 'include'
}).then((response) => response.json());

const conversation = await fetch(`/backend-api/conversation/${conversationId}`, {
  credentials: 'include',
  headers: { Authorization: `Bearer ${session.accessToken}` }
}).then((response) => response.json());
```

Observed endpoints relevant to the data layer:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/auth/session` | Obtain the short-lived access token |
| `GET` | `/backend-api/conversation/<id>` | Conversation tree and active node |
| `GET` | `/backend-api/conversation/<id>/stream_status` | Optional generation-state check |
| `GET` | `/backend-api/conversation/<id>/textdocs` | Canvas/Canmore content; shape still needs fixtures |
| `GET` | `/backend-api/files/<file_id>/download` | Resolve an asset pointer to a temporary signed URL |

The conversation-list, account, memories, model, file-library, and other discovered
endpoints are not required. Do not call them as part of this project.

### Observed behavior, not guaranteed behavior

- The detail response currently contains `mapping` and `current_node`.
- Long conversations currently arrive as one compressed response with no observed
  pagination parameters.
- Inaccessible conversations currently return a `404` with a structured error.
- Rendered message identifiers currently correspond to identifiers in `mapping`.
- These facts may change independently of extension releases.

Avoid claims such as “always complete” or “stable JSON fields.” The correct claim is:
**the endpoint was complete for the verified sessions, and its result is accepted only
after runtime validation.**

---

## 5. Shared architecture

Do not place the API client under `src/export/`; TOC is an equal consumer. Use a shared
feature boundary:

```text
src/chatgpt-data/
  route.js          Parse supported ChatGPT conversation URLs
  client.js         Session and private-endpoint requests
  schema.js         Runtime validation of untrusted/unstable response shapes
  transcript.js     Active-branch walk and visibility/content normalization
  dom-source.js     Strict rendered-DOM fallback
  service.js        Source selection, in-flight dedupe, memory cache, invalidation
```

Consumers depend on `service.js` and the normalized model. They must not read raw API
objects or bearer tokens.

### 5.1 Consumer-facing service

```js
getConversationSnapshot({ freshness: 'cached' | 'revalidate' | 'fresh', signal })
invalidateConversation(reason)
subscribeConversation(listener)
disposeConversationService()
```

Expected behavior:

- Deduplicate concurrent TOC and Export requests for the same conversation.
- Keep snapshots in memory only; never store conversation data in `chrome.storage`.
- Keep a small bounded cache (for example, the current conversation plus two recent IDs).
- Never cache the bearer token. Fetch it inside a request and discard it.
- Return source and completeness metadata so consumers can communicate fallback quality.
- Use a short per-conversation circuit breaker after private-API failure to prevent
  repeated requests caused by DOM mutations.

### 5.2 Normalized snapshot contract

```js
{
  conversationId,
  title,
  currentNodeId,
  turns: [
    {
      nodeId,
      messageId,
      role,               // user | assistant
      markdown,
      assets: [],
      createdAt,
      status,
      direction,
    }
  ],
  source: 'private-api' | 'dom',
  completeness: 'complete' | 'rendered-only' | 'unknown',
  capturedAt,
  warnings: []
}
```

Keep both `nodeId` and `messageId`; do not assume they will always remain identical.
The DOM bridge may try both values after validating and escaping them.

Unknown API fields are ignored. Unknown content types produce a warning and are skipped;
they are never stringified into the transcript automatically.

---

## 6. Route and request rules

Supported authenticated conversation routes currently include:

```js
const CONVERSATION_ROUTE_RE =
  /\/(?:c|g\/[^/]+\/c|g\/[^/]+\/project\/[^/]+\/c)\/([0-9a-f-]{36})(?:\/|$)/i;
```

Rules:

- `/share/<id>`: use DOM fallback until a separate shared-conversation adapter is
  deliberately implemented and tested.
- `/`: no conversation ID; return `no-conversation` rather than calling the API.
- Temporary, anonymous, or unknown route shapes: DOM fallback.
- Verify that the returned `conversation_id`, when present, matches the requested ID.
- Make requests only when `location.origin === 'https://chatgpt.com'`.
- Use `credentials: 'include'`, a bounded timeout, and `AbortController`.
- Check response status and JSON content type before parsing.
- Do not include response bodies, session objects, or tokens in thrown error messages.

`content_scripts.matches` and `host_permissions` are separate manifest concepts. The
current same-origin request path is expected not to require a new host permission, but
this must be confirmed in the packaged extension—not only in DevTools page context.

---

## 7. Runtime validation and active-branch traversal

Treat the private response as unstable input even though it comes from ChatGPT.

Minimum validation:

- `mapping` is a plain object.
- `current_node` is a non-empty string present in `mapping`.
- Every traversed node has a valid `parent` string or `null`.
- Traversal uses a `Set` to detect cycles.
- Traversal stops at a defensive maximum depth.
- A message is normalized only if its author, recipient, channel, and content pass the
  allowlist in §8.

Active-branch traversal:

```js
function activeBranch(mapping, currentNodeId) {
  const result = [];
  const seen = new Set();
  let id = currentNodeId;

  while (id) {
    if (seen.has(id)) throw new Error('conversation-cycle');
    seen.add(id);

    const node = mapping[id];
    if (!node) throw new Error('conversation-broken-parent');
    if (node.message) result.push({ nodeId: id, message: node.message });
    id = node.parent ?? null;
  }

  return result.reverse();
}
```

Walking from `current_node` selects the active regenerate/edit branch. Iterating all
`mapping` values would mix abandoned branches into the transcript.

---

## 8. Visibility and data-leak boundary

The API response may contain data that is not visible in the conversation UI. This is
the highest-risk difference from DOM export.

Default transcript allowlist (all conditions must pass; fail closed):

1. Reject if `metadata.is_visually_hidden_from_conversation === true`. This is an
   **authoritative, ChatGPT-set hide flag** — observed on system messages, hidden tool
   messages, and `user_editable_context`. Honor it first; do not re-derive that judgment.
2. Keep only `author.role === 'user'` or `author.role === 'assistant'`.
3. Require `recipient === 'all'` when `recipient` is present (drops `bio`/memory writes,
   `web`/`web.run`/`web.search` tool calls, and named tool recipients).
4. Keep only `channel == null` or `channel === 'final'` (drops `analysis`/`commentary`).
5. Accept only known public content types; reject reasoning (`thoughts`,
   `reasoning_recap`), `user_editable_context`, `model_editable_context`.
6. Drop empty messages after normalization.
7. Do not export arbitrary message metadata.

> The hide flag and the role/recipient/channel rules are **redundant on purpose**. Either
> alone has gaps (the flag isn't set on `analysis`-channel reasoning; channel rules don't
> catch every context message). Applying all of them is the fail-closed posture.

Verified content types and their handling (full catalog + citation handling: [reference §4.4–4.5](./chatgpt-internals-reference.md#44-content-types--part-shapes-verified-catalog)):

| `content_type` | Where the text lives | Initial handling |
|---|---|---|
| `text` | `content.parts[]` (strings) | Preserve as Markdown |
| `multimodal_text` | `content.parts[]` (strings **and** objects) | Flatten: string → text; `{text,direction}` object → its `text`; asset pointer → asset ref |
| `code` | **`content.text`** (string) + `content.language` | Fenced Markdown block — **not** in `parts` |
| `image_asset_pointer` (part) | object part | Structured asset reference; resolve only when needed |
| `thoughts`, `reasoning_recap` | — | **Exclude** (model reasoning) |
| `user_editable_context`, `model_editable_context` | — | **Exclude** (custom instructions / memory) |
| audio/video asset parts (voice mode) | object part | **Unsupported**; skip with a warning |
| Unknown object part | — | Skip and add a warning |
| Canvas/textdoc pointer | `/textdocs` endpoint, not `parts` | Mark unsupported until `textdocs` fixtures exist |

Do **not** offer raw `mapping` as the normal JSON export. A raw diagnostic export would
need a separate explicit user action and warning because it can include hidden context.

---

## 9. Table of Contents design

### 9.1 Index construction

- Build entries from visible assistant turns in the normalized snapshot to preserve the
  extension's current behavior.
- Prefer the first Markdown heading; otherwise use a normalized first-line snippet.
- Store `{ nodeId, messageId, title, turnIndex }` for every entry.
- If the source is DOM fallback, mark the outline as `rendered-only` rather than implying
  that it is complete.

### 9.2 Live updates

- Load the cached snapshot immediately on conversation navigation.
- Revalidate once in the background.
- During assistant streaming, use the DOM to update the trailing visible entry locally.
- After the generation settles, invalidate and perform one snapshot revalidation.
- Do not poll the private API on every token or mutation.

### 9.3 Navigation is a separate virtualization problem

The identifier bridge works only when the target message is mounted:

```js
function findRenderedMessage({ nodeId, messageId }) {
  for (const id of [messageId, nodeId]) {
    if (!id) continue;
    const target = document.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (target) return target;
  }
  return null;
}
```

Do not use `ensureConversationContentLoaded()` as the TOC click solution. Sweeping to an
edge and restoring scroll does not guarantee that a middle virtualized node remains
mounted.

Required navigation strategy:

1. Scroll directly when the message is mounted.
2. Otherwise use a **bounded targeted navigator** informed by `turnIndex`, rendered turn
   indices, scroll position, and the scroll host.
3. Stop after a small time/attempt budget; never fight an active user scroll.
4. If the target still cannot be mounted, preserve the current position and show a clear
   “message is not currently available in the rendered view” state.

The targeted navigator is a separate proof-of-concept and acceptance gate. The API makes
the TOC complete; it does not automatically make ChatGPT's virtual list addressable.

A future extension-owned reader view could render the complete snapshot and provide
deterministic navigation without controlling ChatGPT's virtual list, but it is outside
the initial rollout.

---

## 10. Export design

### 10.1 Separate acquisition from formatting

Current generators receive a cloned DOM root. The target architecture is:

```text
private API or DOM fallback
          ↓
ConversationSnapshot
          ↓
format-specific serializer OR canonical export DOM
          ↓
JSON / Markdown / CSV / DOCX / PDF / PNG
```

### 10.2 Initial rollout

- **JSON:** serialize the normalized snapshot, not raw API data.
- **Markdown:** concatenate preserved Markdown with role headings and asset placeholders.
- **CSV:** derive rows from normalized turns/blocks and retain formula-injection escaping.
- **DOCX/PDF/PNG:** keep the existing DOM acquisition path initially.
- If API acquisition fails, use the strict DOM source and surface a non-blocking warning
  when completeness is `rendered-only`.

### 10.3 Canonical export DOM — DEFERRED sub-project (not in the core fix)

> **Scope warning.** This is the single largest and riskiest item in the document and is
> **explicitly out of the initial rollout.** Treat it as a separate project to be scoped on
> its own, *after* the core (JSON/MD/CSV + TOC) has shipped and proven out. The long-chat
> problem is fully solved without it. Until then, DOCX/PDF/PNG stay on the existing DOM
> capture path.

The idea: the API could eventually drive visual exports too, since PDF/PNG need rendered
content but that content need not come from ChatGPT's live message DOM:

```text
ConversationSnapshot → Markdown/block parser → sanitized canonical DOM
                     → image resolver / KaTeX renderer → existing generators
```

Why it's a sub-project, not a phase — it effectively reimplements ChatGPT's renderer:

- A deterministic Markdown/block renderer (lists, tables, blockquotes, nesting).
- KaTeX rendering from source Markdown.
- Code-block and table styling matching the themes.
- Image resolution with size/type limits.
- Citation, file, and Canvas policies.
- Sanitization before insertion into the extension-owned export stage.
- A full visual-regression suite before it can replace the DOM path.

That is comparable effort to Phases 1–3 combined, for a *fidelity* gain rather than a
*completeness* gain. Defer until justified. Note also that API data does not remove browser
raster limits — very tall PNG exports must still be rejected, segmented, or redirected to
PDF/DOCX regardless of the source.

---

## 11. Cache and invalidation policy

Use an in-memory stale-while-revalidate cache:

| Consumer/event | Policy |
|---|---|
| Initial TOC render | Return cached snapshot, then revalidate |
| User clicks Export | Fresh request unless snapshot is known newer than the last mutation |
| Conversation route changes | Switch key; load/revalidate new ID |
| New user turn | Invalidate current conversation |
| Assistant generation completes | Revalidate once |
| API schema/auth failure | Open per-ID circuit breaker, use DOM fallback |
| Page unload | Abort requests and clear memory |

No persistent transcript cache is required. If persistent caching is considered later,
it requires a separate privacy, storage-quota, retention, and encryption decision.

Route changes should be detected centrally. Compare the parsed conversation ID on
`popstate`, `pageshow`, and relevant root mutations; do not depend on React internals.

---

## 12. Fallback and error semantics

Do not implement fallback as a broad `catch {}`. Preserve typed reasons:

| Reason | Consumer behavior |
|---|---|
| No supported conversation route | DOM fallback |
| Not logged in / missing token | DOM fallback |
| `401`, `403`, inaccessible `404` | DOM fallback; no retry loop |
| Timeout/network failure | DOM fallback; temporary circuit breaker |
| Invalid schema/broken branch | DOM fallback; record local diagnostic code only |
| Unknown content type | Keep valid turns, add warning; do not stringify unknown data |
| Streaming/incomplete trailing turn | Exclude or mark incomplete; revalidate after settle |
| DOM fallback finds only mounted turns | Return `rendered-only` and inform the consumer |

Fallback must also become stricter:

- Prefer validated conversation-turn selectors.
- Remove generic `article` as a silent success condition.
- Do not clone all of `<main>` when message discovery fails.
- Fail with a useful unsupported-page error rather than exporting unrelated UI.

---

## 13. DOM work that remains

The data layer should be accompanied by smaller DOM reliability improvements:

- Introduce a shared `ChatGptDomAdapter` for conversation root, rendered turns,
  composer, roles, content roots, and scroll host.
- Consolidate overlapping full-body observers where practical.
- Process added/changed turns incrementally instead of rescanning all messages.
- Keep selectors strict and validate semantics after a match.
- Update quick-action composer detection to support the current visible
  `contenteditable` composer, not only textareas.
- Add authenticated Playwright selector-health tests using local, uncommitted auth state.

These changes are separate from private-API adoption but address the same maintenance
problem for features that must remain DOM-driven.

---

## 14. Security, privacy, and product constraints

- All calls remain inside the user's `chatgpt.com` tab and all processing remains local.
- The bearer token exists only inside a request scope. Never persist, log, message to the
  popup, include in errors, or attach to telemetry.
- Only read the currently open conversation. Do not add “export all conversations,”
  background crawling, or periodic history synchronization.
- Resolve signed asset URLs only during an explicit export and use them immediately.
- Apply MIME type, size, and count limits before embedding assets.
- Never expose hidden roles/channels/metadata through default exports.
- Update `PRIVACY.md` before release to disclose that user-initiated export/TOC may read
  the current conversation through ChatGPT's own authenticated endpoint.
- Re-review Chrome Web Store policy and OpenAI terms before enabling the private-API path
  in the public build. This document makes no legal determination.

The extension can remain “client-side only,” but that does not make a private endpoint a
supported contract or remove disclosure obligations.

---

## 15. Verification strategy

### Unit fixtures

- Linear conversation.
- Regenerated/edited branches.
- Broken parent and traversal cycle.
- User/assistant visible turns.
- System, memory, analysis, commentary, recipient-specific tool calls.
- Empty and unknown content parts.
- Multimodal image pointers.
- Streaming/incomplete last turn.
- DOM fallback with only a partial mounted window.

Use sanitized recorded fixtures; never commit tokens, cookies, account identifiers, or
private conversation text.

### Integration tests

- API success → normalized complete snapshot.
- API timeout/auth/schema failure → typed DOM fallback.
- Concurrent TOC and Export requests → one in-flight fetch.
- Route change invalidates the correct cache key.
- Export scopes (`all`, `assistant`) match current behavior.
- JSON/Markdown/CSV maintain RTL, code, table, equation, and CSV safety behavior.

### Authenticated Playwright checks

Keep authentication state outside the repository. Verify against short and long chats:

- First/middle/last active-branch messages appear in the snapshot.
- Abandoned regenerate branches do not appear.
- DOM identifiers resolve to the correct normalized turns when mounted.
- TOC navigation works from arbitrary scroll positions within the bounded budget.
- Streaming causes at most one settled revalidation.
- DOM fallback remains functional when private requests are deliberately blocked.

### Visual regression checks

Before moving DOCX/PDF/PNG to canonical rendering, compare:

- Mixed RTL/LTR paragraphs.
- Inline/display equations.
- Code blocks and long lines.
- Ordered/nested lists and tables.
- Uploaded/generated images.
- Very long chats and PNG dimension limits.

---

## 16. Rollout plan and acceptance gates

The plan is gated. **Two cheap de-risk spikes come before any architecture commitment;**
if either fails, the approach changes rather than proceeds. Build nothing in `src/chatgpt-data/`
until Phase 0 is answered.

### Phase 0 — De-risk spikes + fixtures (go/no-go, ~1 day, throwaway code)

Two load-bearing assumptions are still unverified (see
[reference §4.8](./chatgpt-internals-reference.md#48-still-unverified-re-verify-before-depending-on-these)).
Settle them first:

1. **Isolated-world fetch (blocks everything).** Confirm `/api/auth/session` +
   `/backend-api/conversation/<id>` succeed from the **packaged content script** (isolated
   world), not just DevTools (main world).
   **Go/no-go:** if the same-origin `Authorization`+`credentials` fetch fails from the
   content script, the API-first path is blocked — stop and reconsider (e.g. main-world
   injection, or staying DOM-only) *before* Phase 1.
2. **Virtualized scroll-to (blocks TOC navigation only).** On a genuinely long chat
   (500+ turns), confirm a middle, currently-unmounted message can be reliably mounted and
   scrolled to within the bounded budget (§9.3).
   **Go/no-go:** if it can't, still ship the complete API-built TOC *index*, but **not**
   API-based navigation — limit navigation to mounted turns and label the rest. This gates
   Phase 3's navigation, not Phases 1–2.

Then capture **sanitized fixtures for every content type in §15** — these are the inputs
for all Phase 1–3 tests, so they must exist before that code is written.

**Gate:** both spikes answered with recorded evidence; fixtures committed (no tokens,
cookies, account ids, or private text); validator rejects malformed/hidden data; no token
leakage.

### Phase 1 — shared snapshot service

- Implement route/client/schema/transcript/service modules.
- Add DOM source with explicit `rendered-only` completeness.
- Add unit and integration tests.

**Gate:** deterministic source selection and typed fallback.

### Phase 2 — JSON / Markdown / CSV

- Move text serializers to `ConversationSnapshot`.
- Preserve export scope and CSV formula escaping.
- Show a warning when fallback may be incomplete.

**Gate:** long-chat output contains first, middle, and last active-branch turns.

### Phase 3 — TOC index (navigation only if Phase 0 spike #2 passed)

- Build the complete index from the shared snapshot (ships regardless of the nav spike).
- Merge the current streaming turn from DOM.
- **If** the virtualized scroll-to spike passed: wire bounded targeted navigation.
  **If not:** navigate only to mounted turns and clearly label off-screen entries.

**Gate:** complete list always; plus successful first/middle/last navigation from arbitrary
scroll positions **when navigation is enabled**. Do not ship API-based navigation if the
spike failed.

### Phase 4 — DOM consolidation

- Centralize the remaining page adapter and reduce duplicate observers/scans.
- Add current-site selector-health checks.

**Gate:** no regression in themes, fonts, RTL, KaTeX copy, quick actions, or retention UI.

### Deferred (separate sub-project) — canonical visual exports

Out of the initial rollout. Render the snapshot to a sanitized canonical DOM and move
DOCX → PDF → PNG off the live-DOM path, behind format-specific visual-regression tests.
Scope and schedule this **only after** Phases 1–4 ship and the cost is justified (§10.3).
DOCX/PDF/PNG stay on the current DOM capture until then.

---

## 17. Final assessment

The hybrid direction is correct, but the private API should be treated as a replaceable
source adapter—not as a new foundation that every feature calls directly.

The strongest architecture is:

```text
Private ChatGPT endpoint ─┐
                          ├─→ validated ConversationSnapshot ─→ Export / TOC
Strict DOM fallback ──────┘

Live visual features ─────────→ shared ChatGptDomAdapter
```

API-first acquisition solves long-chat **data completeness** (JSON/MD/CSV + TOC index) —
that is the core fix and the bulk of the value. Canonical rendering could *later* solve
long-chat **visual export completeness**, but it is a deferred sub-project, not part of
this rollout. TOC indexing benefits immediately; navigation into ChatGPT's virtual list is
gated on a browser spike and may ship index-only.

**Readiness:** the understanding is verified and the architecture (Phases 1–3) is ready to
build — but only **after** the two Phase 0 go/no-go spikes (isolated-world fetch;
virtualized scroll-to). Do those first; they decide whether the API path and API-based
navigation are viable before any architecture is committed.

---

## Appendix A — observed response model

Moved to the canonical reference to avoid drift:
[reference §4.3–4.4](./chatgpt-internals-reference.md#43-conversation-model-mapping) (response
model, `mapping` shape, and the per-`content_type` normalization including code-in-`.text`
and object parts).

## Appendix B — manual re-verification

Run only in DevTools on a conversation owned by the logged-in user. Do not copy output
containing account data or tokens into issues, logs, fixtures, or the repository.

```js
const sessionResponse = await fetch('/api/auth/session', { credentials: 'include' });
const session = await sessionResponse.json();
const match = location.pathname.match(
  /\/(?:c|g\/[^/]+\/c|g\/[^/]+\/project\/[^/]+\/c)\/([0-9a-f-]{36})(?:\/|$)/i
);
const id = match?.[1];

const response = await fetch(`/backend-api/conversation/${id}`, {
  credentials: 'include',
  headers: { Authorization: `Bearer ${session.accessToken}` }
});
const conversation = await response.json();

const renderedIds = [...document.querySelectorAll('[data-message-id]')]
  .map((node) => node.getAttribute('data-message-id'))
  .filter(Boolean);

console.log({
  status: response.status,
  conversationIdMatches: conversation.conversation_id === id,
  nodeCount: Object.keys(conversation.mapping || {}).length,
  currentNodePresent: Boolean(conversation.mapping?.[conversation.current_node]),
  renderedIdsResolve: renderedIds.every((messageId) =>
    Boolean(conversation.mapping?.[messageId]) ||
    Object.values(conversation.mapping || {}).some((node) => node?.message?.id === messageId)
  )
});
```

## Appendix C — content catalog & citation mechanism

Moved to the canonical reference to avoid drift:
- Content-type counts, part-object shapes, and the per-message `metadata` catalog:
  [reference §4.4](./chatgpt-internals-reference.md#44-content-types--part-shapes-verified-catalog).
- Citation sentinels (`U+E200/E201/E202`), `content_references` index semantics, and the
  verified `stripCitations()` algorithm:
  [reference §4.5](./chatgpt-internals-reference.md#45-visibility--citations).
- Edge cases (no pagination, `404` code, `limit≤100`, URL variants, Canvas, stream status,
  branch-depth ≠ node-count): [reference §4.7](./chatgpt-internals-reference.md#47-edge-cases--long-chat-behavior-verified).

## Appendix D — still unverified

Moved to the canonical reference; these are the open items the Phase 0 spikes (§16) must
settle: [reference §4.8](./chatgpt-internals-reference.md#48-still-unverified-re-verify-before-depending-on-these).
