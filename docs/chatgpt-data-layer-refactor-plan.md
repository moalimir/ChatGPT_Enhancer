# ChatGPT Data Layer Refactor Plan

> **Status:** Implementation plan
>
> **Strategy reference:** [`chatgpt-internal-api.md`](./chatgpt-internal-api.md)
>
> **Primary objective:** Make Export and Table of Contents complete and reliable on
> long, virtualized conversations by introducing an API-first conversation data layer
> with a strict DOM fallback.

---

## 1. Scope

### In scope

- Shared conversation snapshot service.
- Private ChatGPT endpoint adapter.
- Runtime response validation and safe transcript normalization.
- Strict rendered-DOM fallback.
- API-first JSON, Markdown, and CSV exports.
- API-first TOC indexing.
- Bounded TOC navigation to mounted or virtualized messages.
- Cache, invalidation, request deduplication, and typed errors.
- Tests for branches, hidden content, citations, long chats, and fallback behavior.
- Privacy-policy and release documentation updates.

### Later scope

- Canonical DOM rendering from conversation snapshots.
- API-backed DOCX, PDF, and PNG exports.
- Canvas/textdoc support.
- Shared-link adapter.
- Audio/video/voice export.
- Extension-owned reader view.

### Out of scope

- Bulk conversation export or history synchronization.
- Background polling.
- Mutating ChatGPT endpoints.
- Public OpenAI API migration.
- Replacing DOM logic for themes, fonts, RTL fixes, or interactive KaTeX behavior.

---

## 2. Target architecture

```text
Private ChatGPT endpoint ─┐
                          ├─→ ConversationDataService
Strict DOM source ────────┘          │
                                     ▼
                           ConversationSnapshot
                              │             │
                              ▼             ▼
                         Exporters        TOC model

Live page features ─→ ChatGptDomAdapter ─→ TOC navigation / visual fixes
```

Proposed modules:

```text
src/chatgpt-data/
  route.js
  errors.js
  client.js
  schema.js
  transcript.js
  citations.js
  dom-source.js
  service.js
  index.js

src/content/dom/
  adapter.js
```

Consumers must import the public data-layer interface from `src/chatgpt-data/index.js`.
They must not access raw API responses or session tokens.

---

## 3. Normalized data contract

```js
{
  conversationId,
  title,
  currentNodeId,
  turns: [
    {
      nodeId,
      messageId,
      role,                 // user | assistant
      markdown,
      assets: [],
      createdAt,
      status,
      direction
    }
  ],
  source,                   // private-api | dom
  completeness,             // complete | rendered-only | unknown
  capturedAt,
  warnings: []
}
```

Rules:

- Preserve `nodeId` and `messageId` separately.
- Expose only normalized visible conversation content.
- Never expose raw `mapping`, bearer tokens, arbitrary metadata, or hidden messages.
- Unknown content is skipped with a typed warning.
- DOM fallback must report `rendered-only` unless completeness is independently proven.

---

## 4. Work packages

### WP0 — Baseline and fixtures

Tasks:

- [ ] Record current Export and TOC behavior on short and long chats.
- [ ] Capture sanitized private-API fixtures for supported response shapes.
- [ ] Add fixtures for linear and regenerated conversation branches.
- [ ] Add hidden system, memory, analysis, commentary, and tool-call fixtures.
- [ ] Add text, code, multimodal text, image pointer, and citation fixtures.
- [ ] Add malformed mapping, broken parent, cycle, and unknown-content fixtures.
- [ ] Confirm packaged content-script access to session and conversation endpoints.
- [ ] Confirm whether additional manifest permissions are required.
- [ ] Verify DOM/API identifiers against mounted messages.

Acceptance gate:

- Packaged extension can perform a user-initiated read of the current conversation.
- No credentials or private conversation text are committed to the repository.
- Unsupported response shapes fail closed.

---

### WP1 — Shared DOM adapter

Files:

- Add `src/content/dom/adapter.js`.
- Refactor `src/content/selectors.js` behind the adapter.

Tasks:

- [ ] Centralize conversation root, turn, role, content, composer, and scroll-host lookup.
- [ ] Replace generic selector success with semantic validation.
- [ ] Remove plain `article` as a valid message fallback.
- [ ] Remove export fallback that clones all of `<main>`.
- [ ] Support the visible `contenteditable` ChatGPT composer.
- [ ] Expose helpers for mounted message lookup by `messageId` and `nodeId`.
- [ ] Preserve existing behavior for fonts, RTL, KaTeX, TOC, and quick actions.

Acceptance gate:

- Existing tests pass.
- Selector failure produces an explicit unsupported-page result.
- Unrelated page controls cannot be interpreted as conversation turns.

---

### WP2 — Route, error, and API client foundation

Files:

- Add `src/chatgpt-data/route.js`.
- Add `src/chatgpt-data/errors.js`.
- Add `src/chatgpt-data/client.js`.

Tasks:

- [ ] Parse plain, custom-GPT, and project conversation routes.
- [ ] Reject shared, temporary, anonymous, and unknown routes for API acquisition.
- [ ] Fetch a fresh session token inside request scope.
- [ ] Add `AbortController` and bounded request timeouts.
- [ ] Validate response status and JSON content type.
- [ ] Verify returned conversation ID when present.
- [ ] On `401`, refresh the token exactly once and retry once.
- [ ] Convert failures into typed local errors without response bodies or credentials.
- [ ] Ensure no token is logged, persisted, or sent through extension messages.

Acceptance gate:

- Success, timeout, abort, `401`, `403`, `404`, invalid JSON, and invalid route tests pass.
- Authentication retry cannot loop.

---

### WP3 — Schema validation and active branch

Files:

- Add `src/chatgpt-data/schema.js`.
- Add `src/chatgpt-data/transcript.js`.

Tasks:

- [ ] Validate `mapping` and `current_node`.
- [ ] Walk parents from `current_node` with cycle detection and a depth limit.
- [ ] Preserve only the active regenerate/edit branch.
- [ ] Validate node and message identifiers independently.
- [ ] Add strict role, recipient, channel, visibility, and content-type allowlists.
- [ ] Honor `metadata.is_visually_hidden_from_conversation === true` as a hide signal.
- [ ] Exclude system, tool, analysis, commentary, memory, and editable-context content.
- [ ] Normalize text, code, multimodal text, and supported image pointers.
- [ ] Skip unknown object parts with warnings.
- [ ] Exclude or mark an incomplete streaming tail.

Acceptance gate:

- Hidden content cannot appear in normalized snapshots.
- Regenerated branches produce the same active path as the UI.
- Malformed graphs terminate safely.

---

### WP4 — Citation normalization

Files:

- Add `src/chatgpt-data/citations.js`.

Tasks:

- [ ] Process content references only for known assistant content.
- [ ] Validate integer bounds and `start < end`.
- [ ] Require `part.slice(start, end) === matched_text` when `matched_text` is present.
- [ ] Reject overlapping or conflicting spans.
- [ ] Apply replacements from right to left.
- [ ] Allow only safe `http:` and `https:` destinations.
- [ ] Escape Markdown labels and destinations using shared serialization helpers.
- [ ] Handle supported reference types explicitly.
- [ ] Drop unsupported reference types with warnings.
- [ ] Remove stray citation sentinels only within recognized assistant citation content.

Acceptance gate:

- Citation links are readable and safe.
- Malformed references cannot delete or reorder unrelated message content.
- Legitimate user private-use characters are preserved.

---

### WP5 — DOM conversation source

Files:

- Add `src/chatgpt-data/dom-source.js`.
- Refactor extraction from `src/export/core/scraper.js` where reusable.

Tasks:

- [ ] Convert validated mounted DOM turns into `ConversationSnapshot`.
- [ ] Reuse current role, direction, block, table, code, and equation serialization behavior.
- [ ] Report source as `dom` and completeness as `rendered-only`.
- [ ] Keep scroll-driving outside the normal fallback acquisition path.
- [ ] Return typed unsupported/empty results instead of cloning arbitrary containers.

Acceptance gate:

- API blocking produces a safe DOM snapshot.
- Fallback output never claims to be complete without evidence.

---

### WP6 — Conversation data service

Files:

- Add `src/chatgpt-data/service.js`.
- Add `src/chatgpt-data/index.js`.

Tasks:

- [ ] Implement API-first source selection with typed DOM fallback.
- [ ] Deduplicate concurrent requests per conversation ID.
- [ ] Add a bounded in-memory snapshot cache.
- [ ] Never cache tokens or raw API objects.
- [ ] Implement cached, revalidate, and fresh acquisition modes.
- [ ] Add per-conversation circuit breaking after API failure.
- [ ] Invalidate on route change, new user turn, and assistant completion.
- [ ] Abort requests and clear memory on unload.
- [ ] Emit snapshot changes to TOC without exposing transport details.
- [ ] Avoid background polling and per-token refetches.

Acceptance gate:

- Concurrent TOC and Export requests produce one network request.
- Route changes cannot return a snapshot from the previous conversation.
- Failure does not cause mutation-driven request loops.

---

### WP7 — Text export migration

Files:

- Refactor `src/export/index.js`.
- Refactor `src/export/generators/text.js`.
- Split or adapt `src/export/utils/serialization.js`.

Tasks:

- [ ] Make JSON, Markdown, and CSV consume `ConversationSnapshot`.
- [ ] Preserve `all` and `assistant` export scopes.
- [ ] Preserve title, source URL, export timestamp, and direction metadata.
- [ ] Preserve Markdown headings, code fences, lists, tables, equations, and links.
- [ ] Preserve CSV formula-injection protection and UTF-8 BOM behavior.
- [ ] Include supported asset references without leaking signed URLs.
- [ ] Surface a non-blocking warning when DOM fallback is `rendered-only`.
- [ ] Keep current DOM behavior for DOCX, PDF, and PNG.

Acceptance gate:

- Short-chat output remains compatible with current exports.
- Long-chat output contains the first, middle, and last active-branch turns.
- No hidden content appears in any format.

---

### WP8 — API-first TOC index

Files:

- Refactor `src/content/toc/logic.js`.
- Adapt `src/content/toc/ui.js` only where source/completeness state is displayed.

Tasks:

- [ ] Build TOC entries from normalized visible assistant turns.
- [ ] Derive titles from the first Markdown heading or normalized first-line snippet.
- [ ] Store `nodeId`, `messageId`, and `turnIndex` on entries.
- [ ] Render cached entries immediately and revalidate once.
- [ ] Merge the currently streaming DOM turn into the trailing TOC entry.
- [ ] Revalidate once after generation settles.
- [ ] Mark DOM fallback outlines as partial/rendered-only.
- [ ] Remove full-message rescans from normal TOC update handling.

Acceptance gate:

- Long-chat TOC contains the entire active branch from the first successful snapshot.
- Streaming does not trigger a private request per mutation/token.

---

### WP9 — Bounded TOC navigation

Files:

- Add `src/content/toc/navigation.js`.
- Refactor TOC click handling in `src/content/toc/logic.js`.

Tasks:

- [ ] Scroll directly when the target message is mounted.
- [ ] Prototype targeted navigation using `turnIndex`, rendered indices, and scroll metrics.
- [ ] Add an attempt/time budget.
- [ ] Abort immediately when the user manually scrolls.
- [ ] Restore the starting position after failure where practical.
- [ ] Show a clear unavailable-target state rather than silently doing nothing.
- [ ] Do not use the full conversation sweep as the click fallback.

Acceptance gate:

- First, middle, and last entries navigate successfully from arbitrary positions in a
  genuinely virtualized long chat.
- Navigation never enters an unbounded scroll loop or fights user input.
- If this gate fails, ship the complete TOC index without claiming deterministic
  navigation to unmounted turns.

---

### WP10 — Canonical visual export renderer

Files:

- Add `src/export/core/snapshot-renderer.js`.
- Adapt DOCX, PDF, and PNG generators incrementally.

Tasks:

- [ ] Render normalized Markdown/blocks into a sanitized extension-owned DOM.
- [ ] Render KaTeX from source equations.
- [ ] Apply deterministic code, table, list, direction, and image styles.
- [ ] Resolve image pointers with MIME, size, and count limits.
- [ ] Add explicit policies for citations, files, and unsupported Canvas content.
- [ ] Migrate DOCX first, PDF second, and PNG last.
- [ ] Preserve the current DOM path as a fidelity fallback.
- [ ] Retain PNG dimension/pixel-limit protection.

Acceptance gate:

- Canonical output passes visual regression checks.
- Visual exports include first, middle, and last long-chat turns.
- No unsafe HTML or unsupported assets enter the export stage.

---

### WP11 — Remaining DOM observer cleanup

Tasks:

- [ ] Route remaining DOM features through `ChatGptDomAdapter`.
- [ ] Consolidate overlapping body/root observers where practical.
- [ ] Process added or changed turns incrementally.
- [ ] Avoid calling full-document selector resolution from each mutation callback.
- [ ] Keep theme-attribute observation separate and narrowly scoped.
- [ ] Add current-site selector-health smoke tests.

Acceptance gate:

- No regression in themes, fonts, RTL fixes, KaTeX copy, quick actions, or retention UI.
- Mutation handling remains bounded during assistant streaming.

---

### WP12 — Privacy, release, and cleanup

Tasks:

- [ ] Update `PRIVACY.md` to disclose user-initiated local reads through ChatGPT's
  authenticated endpoint.
- [ ] Re-review Chrome Web Store policy and OpenAI terms.
- [ ] Document the private/unsupported nature of the endpoint.
- [ ] Add user-facing fallback and partial-export messages.
- [ ] Confirm no credentials, raw fixtures, or signed asset URLs enter logs/build output.
- [ ] Remove obsolete scraper behavior only after all replacement gates pass.

Acceptance gate:

- Privacy documentation matches runtime behavior.
- DOM fallback remains available for unsupported/auth-failure cases.
- Rollback can disable API-first acquisition without disabling Export or TOC entirely.

---

## 5. Recommended implementation order

```text
WP0  Baseline and fixtures
 ↓
WP1  Shared DOM adapter
 ↓
WP2  Route/errors/client
 ↓
WP3  Schema and transcript
 ↓
WP4  Citations
 ↓
WP5  DOM source
 ↓
WP6  Shared service
 ├─→ WP7  JSON/Markdown/CSV
 └─→ WP8  TOC index → WP9 targeted navigation

After production confidence:
WP10 canonical visual exports
WP11 observer cleanup
WP12 release/privacy cleanup throughout, finalized last
```

Do not begin visual-export migration before text exports and snapshot normalization are
stable. Do not ship deterministic TOC navigation claims before testing a genuinely
virtualized conversation.

---

## 6. Test matrix

| Area | Required cases |
|---|---|
| Route parsing | Plain, custom GPT, project, shared, root, malformed |
| Authentication | Success, missing token, one `401` retry, repeated `401`, abort |
| Schema | Valid, missing mapping, missing current node, broken parent, cycle |
| Visibility | User, assistant-final, system, tool, hidden flag, analysis, commentary |
| Content | Text, code, multimodal text, image pointer, unknown object, empty |
| Citations | Valid span, invalid bounds, overlap, mismatch, unsafe URL, multiple spans |
| Branches | Linear, edit, regeneration, abandoned branch |
| Cache | Hit, revalidate, fresh, concurrent request, route invalidation, unload |
| Fallback | Auth failure, timeout, schema failure, unsupported route, partial DOM |
| Export | All/assistant scopes, RTL, equations, tables, nested lists, CSV formulas |
| TOC | Complete index, streaming tail, mounted target, unmounted target, user scroll |
| Visual export | KaTeX, code, tables, images, RTL/LTR, long content, PNG limits |

---

## 7. Definition of done

The refactor is complete when:

- Export and TOC consume a shared validated snapshot contract.
- JSON, Markdown, and CSV are API-first with strict DOM fallback.
- Long-chat text exports contain the complete active branch.
- TOC indexing is complete and navigation behavior is honestly represented.
- Hidden or internal ChatGPT content cannot leak through default exports.
- Private endpoint failure degrades safely without request loops.
- DOCX/PDF/PNG either use tested canonical rendering or retain the documented DOM path.
- Existing visual features continue working through a narrower DOM adapter.
- Privacy documentation reflects endpoint usage.
- Unit, integration, authenticated browser, and visual regression gates pass.

---

## 8. First implementation slice

The first pull request should be deliberately narrow:

1. Add route parsing and typed errors.
2. Add the private client behind an internal interface.
3. Add runtime schema validation and active-branch traversal.
4. Add fail-closed visibility filtering for text and code only.
5. Add sanitized fixtures and unit tests.
6. Do **not** wire the new service into Export or TOC yet.

This creates a reviewable security and data-correctness boundary before changing
user-visible behavior.
