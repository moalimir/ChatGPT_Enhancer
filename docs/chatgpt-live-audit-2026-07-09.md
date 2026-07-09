# ChatGPT Live Audit — 2026-07-09 (refactor evidence)

> **Purpose.** Ground-truth findings from a live, logged-in inspection of `chatgpt.com`,
> gathered to drive the Export + TOC refactor. Complements the analysis docs
> ([internals-reference](./chatgpt-internals-reference.md),
> [hybrid strategy](./chatgpt-internal-api.md),
> [refactor plan](./chatgpt-data-layer-refactor-plan.md),
> [phase-0](./phase-0-findings.md)) with what the **current** build actually does.
>
> **Method.** Structural DOM/API probes only (node counts, attribute/class names, HTTP
> status, content-type distributions). **No conversation text, titles, tokens, or account
> data were extracted or stored.** Run against the real logged-in profile with the extension
> loaded.
>
> **Build under test:** `data-build = prod-e96c755b0e23382fed5d71b0a01995e2b0dd3a47`.
> **Sample chat:** 47-node conversation (`branchDepth 47` = 21 assistant + 20 user + 6 system),
> RTL + heavy KaTeX (108 formulas across 3 rendered messages).

---

## 1. Headline conclusions

1. **Virtualization is confirmed as the root cause.** On a ~41-visible-turn chat, only **5**
   messages were mounted in the DOM; the rest are empty placeholder shells. DOM-only TOC/export
   can never see the whole chat. → **API-first is the correct fix, exactly as the plan says.**
2. **There is a second, separate bug making it worse:** the export scraper drives the **wrong
   scroll element**, so its "load everything" sweep can't work on this build even setting
   virtualization aside.
3. **The private API is reliable and complete** on the current build; the documented data model
   still holds. Completeness is a solved problem the moment we read from the API.
4. **ChatGPT *does* ship a native TOC** (corrected — see §6). It is a hover-triggered, right-edge
   outline, one entry per user turn, marked internally with **`data-toc-active`**. **Clicking an
   entry navigates to and mounts a previously-virtualized message** — so the page has *already
   solved the virtualized-scroll-to problem* (our Phase 0 Spike 2). Missed on the first pass
   because it only mounts on hover.
5. **Offset-based scroll-driving is a dead end** (see §4). Moving the real scroll host across its
   full height does **not** re-window the virtualizer; only the virtualizer's own imperative
   scroll-to-index (what the native TOC calls) reliably mounts a target turn. This kills both the
   current scraper's sweep *and* naive "compute an offset and scroll there" TOC navigation.
6. **This account cannot exercise the extreme case** (largest chat = 47 nodes), but the native-TOC
   finding makes Spike 2 far less critical: the page itself provides working virtualized navigation.

---

## 2. Virtualization — measured

| Metric | Value | Meaning |
|---|---|---|
| Active branch (API) | **47 nodes** (21 assistant / 20 user / 6 system) | The complete conversation |
| `[data-message-id]` mounted in DOM | **5** | Only ~5 real messages exist in the DOM at once |
| `.markdown` blocks rendered | **3** | Assistant content is rendered for ~3 turns |
| `[data-testid^="conversation-turn-"]` shells | **38** | Lightweight turn placeholders persist… |
| …shells that actually contain content | **5** | …but only ~5 carry rendered message content |
| Mounted content window vs scroll position | pinned to turns **[34–38]** (the last 5) | Window did not advance on programmatic scroll (see §4) |

**Implication:** `src/content/toc/logic.js` `collectAssistantMessages()` and
`src/export/core/scraper.js` `collectConversation()` both read mounted DOM turns, so on any long
chat they capture ~5 of N. This is structural, not a selector tweak.

---

## 3. NEW root-cause bug — scraper scrolls the wrong element

The real DOM/scroll structure on this build:

```
div.@container/main
  └─ div[…scrollbar-gutter…]   ← REAL scroll host: overflow-y:auto, scrollHeight 31646, ACCEPTS scrollTop
       └─ div.contents           ← display:contents (generates NO box)
            └─ main#main          ← overflow-y:VISIBLE, scrollHeight 31594 — NOT scrollable
                 └─ div#thread
```

- `src/export/core/scraper.js` `resolveScrollHost()` returns `main` because
  `isScrollable(main)` is `scrollHeight - clientHeight > 8` → `31594 - 723 > 8` → **true**.
- But `main`'s `overflow-y` is **`visible`**: assigning `main.scrollTop = N` reads back **0**;
  it does not scroll. The real scroller is `main.parentElement.parentElement` (the
  `scrollbar-gutter` div), which *does* accept `scrollTop`.
- Consequences in the current code: scroll **snapshot/restore** reads `main.scrollTop` (always 0),
  and the **user-scroll interrupt guard** listens on `main` (which never fires a scroll event).
  The sweep's premise is broken on this build.

**Fix regardless of API adoption:** `isScrollable()` must check computed `overflow-y ∈ {auto,scroll}`
**and** a real scroll gap — not gap alone. But see §4: even a corrected sweep is the wrong strategy.

---

## 4. Scroll-driving is a dead end — proven

Tested on the **correct** scroll host (`main.parentElement.parentElement`), tab warm:

- Setting `scrollTo({top})` across the full height (0 → 54,076 → 91,929) **moved `scrollTop` but did
  NOT re-window the virtualizer** — the mounted content set stayed frozen at `[26–28, 34–38]` at
  every position. Plain scroll offset does not mount off-screen turns.
- The scroll host's `scrollHeight` is **unstable**: it grew 31,646 → **108,152** as more turns
  mounted (taller content ⇒ bigger spacer). So there is no stable pixel offset to target a turn.
- By contrast, a **native-TOC entry click** *did* mount an off-screen turn and scrolled to it
  (§6) — because it calls the virtualizer's imperative scroll-to-index, not a raw offset.
- A 9-step scroll sweep earlier **froze the renderer >45s** (forcing mount + KaTeX re-render of
  math-heavy messages is very heavy).

**Takeaways:**
1. `ensureConversationContentLoaded()`'s scroll-sweep cannot work on the new site — retire it;
   read the transcript from the API.
2. Any "navigate to an unmounted turn by scrolling to a computed offset" idea is **not viable**.
   Navigation to off-screen turns must go through the virtualizer's own mechanism — which the
   **native TOC already exposes** (§6).

---

## 5. Private API — reliable and complete (re-verified on this build)

- `GET /api/auth/session` → returns access token (main-world fetch works; carries cookies).
- `GET /backend-api/conversation/<id>` → **HTTP 200 for all 20 sampled conversations**, full
  `mapping` + `current_node`, **no pagination**. `conversation_id` matches; `current_node` present.
- Reachability confirmed from the page context. **Caveat:** this was the page **main world**;
  the packaged content-script **isolated world** (Phase 0 Spike 1) is still the one thing to
  confirm from the built extension — but everything points to GO.

### 5.1 Data model still matches the docs (content-type / visibility audit)

From the 47-node sample:

| Dimension | Observed |
|---|---|
| `content_type` | `text` ×44, `model_editable_context` ×2, `user_editable_context` ×1 |
| `recipient` | `all` ×47 |
| `channel` | `final` ×19, `null` ×28 |
| `is_visually_hidden_from_conversation: true` | **7 messages** (must be excluded) |
| `parts` shapes | all `string` (no multimodal in this sample) |
| `metadata.model_slug` | `gpt-5-1`, `gpt-5-5`, `gpt-5-3-mini` (current models) |
| citations (`content_references`) | 0 in this sample (mechanism unchanged; not exercised) |

- **Visibility filtering is essential and works:** 7 hidden messages (system + editable-context)
  would leak into a naive API export. The `is_visually_hidden_from_conversation` flag +
  role/recipient/channel allowlist (plan §8) catches them. Keep the fail-closed posture.
- **Schema has grown but core fields are intact.** New `metadata` keys seen on this build:
  `selected_github_repos`, `story_events`, `code_blocks`, `conversation_context_citation_metadata`,
  `rebase_system_message`, `rebase_developer_message`, `working_turn_id`, `turn_exchange_id`,
  `resolved_model_slug`, `model_adjustments`. None break the plan; validate-and-ignore-unknowns
  is the right stance.

---

## 6. Native TOC — it EXISTS (corrected) and navigates virtualized turns

> The first-pass scan concluded "no native TOC." **That was wrong** — the navigator only mounts on
> hover over the right edge, so an at-rest scan misses it. Confirmed via a user-supplied screenshot
> + Puppeteer recording, then reproduced by synthesizing the hover.

**What it is**

- A `<ul class="flex max-h-[50lvh] flex-col overflow-y-auto">` pinned to the **right edge**
  (~16px gap), **hover-triggered**, and itself scrollable (capped at 50vh).
- **One `<li> > button` per user turn** (19 entries for ~20 user turns). Labels are the **user's
  prompt text** (e.g. "create a mermaid diagram…", "ادامه"/"continue", "."). So it is a
  *"jump to my prompts"* outline, not an assistant-content outline.
- Ticks carry **`data-fill`**; the active one carries **`data-active` + `data-toc-active`** —
  ChatGPT's own code calls this a **TOC**.
- **No stable hooks:** entries have **no `data-message-id`, no `href`, no `aria-label`**. The
  tick→message mapping lives in React state, not the DOM. Order corresponds to user turns.
- Built **client-side** from already-loaded conversation data (no dedicated backend endpoint
  observed; unconfirmed pending a HAR).

**Why it matters most — it solves virtualized navigation**

Clicking entry #1 (a user turn near the top, whose message was **not mounted**):

| | before click | after click |
|---|---|---|
| `scrollHost.scrollTop` | 72,851 | **827** (jumped to top) |
| mounted content turns | `[26,27,28,34,35,36,37,38]` | `[**3**,26,27,28,34,35,36,37,38]` |

→ The click **scrolled to and mounted a previously-virtualized turn.** ChatGPT's virtualizer *can*
address arbitrary turns; the native TOC is the handle that triggers it. This is exactly the
capability the plan feared might not exist (Phase 0 Spike 2).

**How we can exploit it**

1. **Delegate navigation to it.** When our TOC targets an unmounted turn, we can (a) synthesize the
   right-edge hover to mount the native `ul`, (b) find the corresponding entry, (c) dispatch a real
   pointer/click sequence on its `button`. Proven to work above. Fragile hooks (positional index,
   utility classes) → wrap in strict feature-detection with graceful fallback.
2. **Mapping challenge.** Native entries are **user turns**; our current TOC is **assistant turns**.
   To delegate cleanly we either (a) switch our index to user turns too, or (b) map each assistant
   entry to its preceding user turn's native tick (they alternate), or (c) keep our own richer
   index for *labels* and only borrow the native mechanism for *scrolling*.
3. **Availability is uncertain.** Present on this account/build, but likely length-gated and/or a
   Statsig rollout. Treat it as an **enhancement with fallback**, never a hard dependency.

**Should we keep our own TOC at all? → DECIDED: NO (2026-07-09).** The website now ships a native
TOC that covers the core need (including virtualized navigation). Our panel is redundant, so the
whole TOC feature is being **dropped**, not refactored. Consequences:

- **Remove**, don't rebuild: `src/content/toc/` (`logic.js`, `ui.js`, `index.js`), the TOC toggle
  + settings in the popup, `tableOfContents*` settings/observers in `src/content/index.js`, and
  `tests/toc.feature.test.js`. Update README/help copy.
- **No native-delegation glue needed** — there is no panel to delegate from. The "delegate to
  native TOC" navigation technique is kept in this doc as *reference only* (useful if we ever add
  an export reader-view that needs virtualized navigation).
- **Accepted tradeoff:** on short/medium chats (where our always-visible, assistant-heading,
  RTL-aware panel worked and native may not even appear), users lose that nicer outline. Judged
  acceptable: TOC is no longer a project priority now that the platform owns it.

---

## 7. Selector health on the current build

Still valid (use as primary hooks): `data-message-id`, `data-message-author-role`,
`data-message-model-slug` (assistant turns), `.markdown`, `[data-testid^="conversation-turn-"]`,
`.katex` + `annotation[encoding="application/x-tex"]` (108/108 present), `[class*="tableWrapper"]`.
**Newly important:** the real scroll host is **not** `main` (see §3) — any code that needs the
scroll container must resolve it by overflow + gap, or via `main.closest(...)` up to the
`scrollbar-gutter` ancestor.

---

## 8. Scale caveat (Spike 2 largely answered)

Largest chat on this account = **47 nodes**, so the extreme 500+ case still isn't stress-tested.
But the native-TOC finding (§6) **de-risks Spike 2**: the page's own virtualizer already navigates
to unmounted turns, and we can trigger it. The remaining unknown is only whether delegating to the
native TOC stays reliable on a much longer chat — worth a spot-check on a real long chat, but no
longer the project's blocking risk. An **extension-owned reader view** rendered from the API remains
the most robust fallback for navigation *and* long-chat visual export if we ever want independence
from the native mechanism.

---

## 9. Direct implications for the two refinement decisions

- **Replace Image/JSON/CSV with TXT — endorsed.** Once the snapshot is API-first, a plain-text
  export (role-labelled turns) is trivial and universally useful, with none of PNG's raster limits,
  CSV's formula-injection surface, or JSON's low consumer value. Do the removal *before* Phase 2 so
  we never build API serializers we then delete. **Markdown + TXT** become the two complete,
  any-length text exports.
- **Our TOC — DROP it entirely (decided 2026-07-09).** ChatGPT ships a native TOC that already
  navigates virtualized chats (§6), so our panel is redundant. Remove the whole `src/content/toc/`
  module and its UI/settings/tests rather than refactor it. TOC is no longer a project priority.
  → **The project's remaining core problem is EXPORT on long chats.** That is now the priority.

---

## 10. Concrete follow-ups (file-level)

1. `src/export/core/scraper.js` — `isScrollable()`/`resolveScrollHost()` pick `main` incorrectly
   (overflow:visible). Correct scroll-host resolution **or** (preferred) retire the scroll-sweep in
   favor of the API snapshot.
2. **Remove the TOC feature** (decided): delete `src/content/toc/` (`logic.js`, `ui.js`, `index.js`),
   the popup TOC toggle + settings, the `tableOfContents*` keys/observers in `src/content/index.js`
   and `src/common/config.js`, and `tests/toc.feature.test.js`; update README/help copy. Rely on the
   website's native TOC. No refactor of our TOC — it's redundant.
3. `src/export/generators/` + `src/export/index.js` + popup/quick-action UI — drop `png`, `json`,
   `csv`; add `txt`; keep `markdown` as the flagship complete export; `pdf`/`docx` stay DOM-based
   (still incomplete on huge chats until/unless canonical rendering is built).
4. Visibility filter is non-negotiable before any API export ships (7 hidden msgs in a 47-node
   sample). Honor `is_visually_hidden_from_conversation` + role/recipient/channel allowlist.
5. Confirm Phase 0 **Spike 1** (isolated-world fetch) from the **built** extension — the last gate;
   all evidence says GO.
