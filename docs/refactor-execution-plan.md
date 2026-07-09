# GPT Enhancer — Refactor Execution Plan

> **Created:** 2026-07-09. **Owner-facing, actionable sequence.**
>
> This plan **supersedes the sequencing** in
> [`chatgpt-data-layer-refactor-plan.md`](./chatgpt-data-layer-refactor-plan.md) in light of two
> decisions taken after the live audit ([`chatgpt-live-audit-2026-07-09.md`](./chatgpt-live-audit-2026-07-09.md)):
>
> 1. **Drop the extension's own TOC feature entirely** — ChatGPT ships a native TOC that already
>    navigates virtualized chats. (Existing plan WP8/WP9 are **cut**.)
> 2. **Export formats:** remove **PNG / JSON / CSV**, add **TXT**, keep **Markdown** as the flagship.
>    (Existing plan WP7 is **changed** accordingly.)
>
> The deep API-layer design (client/schema/transcript/citations/service) is **not restated** here —
> it lives in the design doc (WP2–WP6). This plan says *what to do, in what order, and when it ships.*

---

## Decisions baked in

- **TOC:** removed, not refactored. Rely on the website's native TOC.
- **Export formats after this work:** `pdf`, `docx`, `markdown`, `txt`. (Removed: `png`, `json`, `csv`.)
- **Completeness on long chats:** solved for **Markdown + TXT** via the API. **PDF/DOCX stay
  DOM-based and remain rendered-only on very long chats** (canonical rendering is a deferred
  sub-project, explicitly out of scope). We surface an honest "may be incomplete" warning for the
  DOM path.
- **Scroll-driving is retired** — proven non-functional on the new build (programmatic scroll does
  not re-window the virtualizer; it also froze the renderer 45s). No scroll-host "fix" is worth it.
- Untouched features: themes, fonts, RTL/direction fixes, KaTeX copy, prompt library, quick-export panel.

---

## Phase overview & sequencing

```
Phase 1  Remove TOC ─────────────┐  (independent, shippable, lighter immediately)
Phase 2  Export format cleanup ──┤  (independent, shippable)
Phase 3  Retire scroll-sweep ────┘  (independent, removes the 45s-freeze bug)
              │
Phase 4  GATE: Spike 1 (isolated-world fetch)   ← one extension load; all evidence says GO
              │
Phase 5  API-first conversation data layer (src/chatgpt-data/, Export-only consumer)
              │
Phase 6  Wire Markdown + TXT to the snapshot   ← makes text exports complete on long chats
              │
Phase 7  Privacy + release
```

Phases **1–3 are pure cleanup**: no gate, no new capability, immediately lighter and less buggy —
ship them first (even as one release). Phases **4–6 are the actual refactor** and are gated on Spike 1.

---

## Phase 1 — Remove the TOC feature

**Goal:** delete the extension's TOC entirely. **Risk:** low. **Depends on:** nothing.

- [ ] Delete `src/content/toc/` (`index.js`, `logic.js`, `ui.js`).
- [ ] `src/content/index.js`: remove `TocManager` import, `TocManager.init/update` calls, and the
      `registerThemeTokenApplier(() => TocManager.applyThemeTokens())` binding; drop
      `tableOfContents`, `tableOfContentsCollapsed`, `tableOfContentsPosition`, `tableOfContentsSize`
      from the `keys` array in `extractRelevantChanges`.
- [ ] `src/common/config.js`: remove the four `tableOfContents*` keys from `DEFAULT_SETTINGS`.
- [ ] `src/popup/index.html`: remove the TOC toggle (`#toggle-toc`) and its row/labels.
- [ ] `src/popup/main.js`: remove `controls.tableOfContents` wiring.
- [ ] `src/popup/settings.js`: remove any TOC setting read/apply.
- [ ] `public/assets/styles/content.css`: remove the `chatgpt-toc-*` / TOC panel styles.
- [ ] `src/help/index.html`: remove the "collapsible table of contents" help copy (EN ~line 63 + FA).
- [ ] `README.md`: remove the "Table of contents" feature bullet (line 16).
- [ ] Delete `tests/toc.feature.test.js`.
- [ ] Grep `toc` / `tableOfContents` / `TocManager` across `src` + `public` → zero remaining refs.

**Acceptance gate:** build succeeds; `npm test` green; loading the extension shows no TOC panel and
no console errors; all other features unaffected.

---

## Phase 2 — Export format cleanup (−PNG/JSON/CSV, +TXT)

**Goal:** four formats — `pdf`, `docx`, `markdown`, `txt`. **Risk:** low. **Depends on:** nothing.

**Remove PNG:**
- [ ] Delete `src/export/generators/png.js`; drop `png` from the registry in
      `src/export/generators/index.js`.
- [ ] `src/export/index.js`: remove the `preflightPngExport` import + call and the
      `exportFormat === 'png'` branch; remove `png` from `normalizeExportFormat`'s allow-list.
- [ ] `src/export/generators/shared.js`: remove PNG-only helpers if now unused.
- [ ] Delete `public/assets/libs/html-to-image.min.js`; remove `"html-to-image"` from
      `package.json` dependencies. (Manifest uses an `assets/libs/*.js` wildcard — no manifest edit.)
- [ ] Keep `src/export/core/images.js` — still used by PDF/DOCX image inlining.

**Remove JSON + CSV:**
- [ ] `src/export/generators/text.js`: delete `exportAsJson` and `exportAsCsv`.
- [ ] `src/export/generators/index.js`: drop `json` and `csv` registry entries.
- [ ] `src/export/index.js`: update `isTextExportFormat` and `normalizeExportFormat` (text set
      becomes `markdown`, `txt`).
- [ ] `src/export/utils/serialization.js`: remove CSV-only (`buildCsvRows`, `formatCsvRow`,
      `escapeCsvValue`) and JSON-only serializers **if not shared**. Keep the block + plaintext +
      markdown helpers (`serializeChildNodesToBlocks`, `blocksToPlainText`, `serializeExportRootToMarkdown`,
      `detectTurnRole`, inline helpers).

**Add TXT:**
- [ ] `src/export/generators/text.js`: add `exportAsTxt(root)` — role-labelled readable plaintext
      (e.g. `You:` / `ChatGPT:` headers per turn, blank-line separated), reusing the existing
      `serializeChildNodesToBlocks` → `blocksToPlainText` path. Download as `.txt`,
      `text/plain;charset=utf-8`.
- [ ] Register `txt` in `src/export/generators/index.js` and the `normalizeExportFormat` allow-lists
      in `src/export/index.js`, `src/popup/settings.js`, `src/content/quick-actions/index.js`.

**UI + copy:**
- [ ] `src/popup/index.html`: remove the `png` / `json` / `csv` radios; add a `txt` radio.
- [ ] `src/content/quick-actions/index.js`: update `FORMAT_OPTIONS` (remove three, add
      `{ value:'txt', label:'Text' }`).
- [ ] `src/help/index.html`: rewrite the export-formats sentence (EN lines ~89–91, FA ~153–154).
- [ ] `README.md` line 17: "PDF, DOCX, Markdown, or TXT".
- [ ] Tests: delete `tests/png.feature.test.js`, `json.feature.test.js`, `csv.feature.test.js`; add
      `tests/txt.feature.test.js` (role labels, RTL, headings/lists/code preserved as plain lines).

**Acceptance gate:** the four remaining formats export correctly on a short chat; removed formats
gone from popup + quick-export; `npm test` green; no dangling imports; bundle no longer contains
`html-to-image`.

> **Note:** TXT + Markdown here are still **DOM-based** (short-chat complete). Phase 6 makes them
> long-chat complete via the API.

---

## Phase 3 — Retire the scroll-sweep; honest DOM capture

**Goal:** stop the broken, renderer-freezing scroll-driving; make DOM export honestly rendered-only.
**Risk:** low–medium. **Depends on:** nothing (but pairs naturally with Phase 5's `dom-source`).

- [ ] `src/export/index.js`: remove the `ensureConversationContentLoaded()` call from
      `prepareExportStage`.
- [ ] `src/export/core/scraper.js`: delete `ensureConversationContentLoaded` and its helpers
      (sentinels, mutation tracker, scroll guard, `resolveScrollHost`/`isScrollable`). Keep
      `collectConversation` as the rendered-only capture, but **remove the "clone all of `main`"
      fallback** (it captures unrelated UI) in favor of a typed empty/unsupported result.
- [ ] Surface a non-blocking toast/warning for DOM-sourced exports: "Exporting the visible part of
      this conversation; long chats may be incomplete." (Wired through the existing export-progress
      event in `src/content/index.js`.)

**Acceptance gate:** exporting no longer scrolls the page or freezes; short chats still export fully;
long-chat DOM export returns the mounted window with the incompleteness warning (no silent partial).

> **Reality check (from the audit):** even with a corrected scroll host, programmatic scroll does not
> re-window ChatGPT's virtualizer, so the sweep cannot be salvaged. PDF/DOCX therefore stay
> rendered-only on very long chats until/unless the deferred canonical renderer is built.

---

## Phase 4 — GATE: Spike 1 (isolated-world fetch)

**Goal:** confirm the **packaged** content script can call `/api/auth/session` +
`/backend-api/conversation/<id>` from the extension's isolated world (not just DevTools main world).

- [ ] Run [`spikes/isolated-world-fetch/`](../spikes/isolated-world-fetch/) from the built extension;
      record the `[PHASE0-ISOLATED-FETCH]` line in [`phase-0-findings.md`](./phase-0-findings.md).
- [ ] **GO:** `conversation.status 200`, `conversationNoBearer.status 404`, no new host permission →
      proceed to Phase 5.
- [ ] **NO-GO:** capture the error; evaluate main-world injection or staying DOM-only before Phase 5.

**Acceptance gate:** recorded green run. (All prior evidence — CSP `connect-src 'self'`, working
main-world fetches, existing content-script fetches in `images.js`/`assets.js` — predicts GO.)

---

## Phase 5 — API-first conversation data layer

**Goal:** a validated `ConversationSnapshot` from the private endpoint, DOM fallback, Export-only
consumer. **Risk:** medium. **Depends on:** Phase 4 GO. **Design:** WP2–WP6 of the design doc
(build exactly as specified there — route/errors/client/schema/transcript/citations/dom-source/service).

- [ ] `src/chatgpt-data/`: `route.js`, `errors.js`, `client.js`, `schema.js`, `transcript.js`,
      `citations.js`, `dom-source.js` (reuse Phase 3's `collectConversation`), `service.js`, `index.js`.
- [ ] **Mandatory visibility filter** (fail-closed): honor `is_visually_hidden_from_conversation`
      **and** role/recipient/channel allowlist. (Audit: 7 of 47 messages hidden in one sample.)
- [ ] Active-branch walk from `current_node` with cycle + depth guards.
- [ ] Token used in request scope only — never persisted, logged, messaged, or put in errors.
- [ ] Tests against the committed fixtures in `tests/fixtures/conversations/` (linear, branched,
      cycle, broken-parent, hidden, citations, multimodal, streaming-incomplete, empty/unknown).

**Acceptance gate:** deterministic source selection + typed DOM fallback; hidden content cannot
appear in a snapshot; malformed graphs terminate safely; concurrent requests dedupe to one fetch.

> **Scope reduction vs. the design doc:** the data layer now has a **single consumer (Export)** — TOC
> is gone. Skip the snapshot→TOC subscription plumbing (WP8/WP9). `service.js` can be simpler.

---

## Phase 6 — Wire Markdown + TXT to the snapshot (complete on long chats)

**Goal:** the two text exports become complete on any length. **Risk:** medium. **Depends on:** Phase 5.

- [ ] `src/export/index.js` / `generators/text.js`: Markdown + TXT consume the `ConversationSnapshot`
      (API-first), not the DOM stage.
- [ ] Preserve `all` / `assistant` scope; preserve Markdown headings/code/lists/tables/equations/links;
      preserve title, source URL, timestamp, direction.
- [ ] On API failure, fall back to the Phase 3 rendered-only DOM source with the incompleteness warning.
- [ ] PDF/DOCX unchanged (DOM path, rendered-only on huge chats + warning).
- [ ] Tests: long-chat Markdown + TXT contain first/middle/last active-branch turns; no hidden content
      in any format.

**Acceptance gate:** on a genuinely long chat, Markdown + TXT contain the complete active branch;
short-chat output matches pre-refactor; hidden content never leaks.

---

## Phase 7 — Privacy + release

- [ ] `PRIVACY.md`: disclose user-initiated local reads via ChatGPT's authenticated endpoint (token
      used in-request, never stored/sent off-device).
- [ ] Version bump; update `README.md` + `src/help/index.html` (formats + no-TOC).
- [ ] Re-review Chrome Web Store policy / OpenAI terms for the private-endpoint path.
- [ ] Confirm no token/fixture/signed-URL leakage in logs or build output.

**Acceptance gate:** privacy docs match runtime; API-first acquisition can be disabled (rollback) without
disabling Export.

---

## What ships when

- **Release A (Phases 1–3):** lighter extension — TOC removed, PNG/JSON/CSV gone, TXT added, no more
  export-freeze/scroll-fight. Ships without touching the API. Honest "may be incomplete" on long-chat
  DOM exports.
- **Release B (Phases 4–7):** Markdown + TXT complete on long chats via the API. The core fix.

## Explicitly out of scope

Canonical visual-export renderer (API→sanitized DOM for PDF/DOCX/PNG); shared-link adapter; Canvas/textdocs;
bulk/all-conversations export; background sync; an extension-owned reader view. Revisit only after Release B.
