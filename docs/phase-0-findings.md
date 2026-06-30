# Phase 0 — findings & go/no-go log

Tracks the two de-risk spikes ([spikes/](../spikes/)) and the fixtures. Phase 0 clears when
both spikes are answered with evidence and fixtures are committed. Build nothing in
`src/chatgpt-data/` until then.

| Item | Status |
|---|---|
| Fixtures (§15 unit cases) | ✅ **Done** — [tests/fixtures/](../tests/fixtures/) (10 files, validated) |
| Spike 1 — isolated-world fetch | 🟡 **Predicted GO; awaiting live run** (see below) |
| Spike 2 — virtualized scroll-to | ⏳ **Blocked on a long (500+ turn) chat** |

---

## Spike 1 — isolated-world fetch  (blocks everything)

**Predicted verdict: GO** (high confidence). Live confirmation still required to *clear* the
gate — run [spikes/isolated-world-fetch/](../spikes/isolated-world-fetch/) and paste/print the
`[PHASE0-ISOLATED-FETCH]` console line here.

Supporting evidence gathered 2026-06-30:

1. **Page CSP permits it.** `content-security-policy: connect-src 'self' … chatgpt.com
   https://*.chatgpt.com …`. Same-origin `/backend-api` is allowed by `'self'`.
2. **Main-world fetches already succeed.** Dozens of `/api/auth/session` +
   `/backend-api/conversation/<id>` calls during verification returned `200`. Main-world
   fetches **are** subject to the page CSP, so their success proves the policy allows the call.
3. **Isolated world is less restricted, not more.** In MV3 a content script's `fetch()` is
   governed by the extension, not the page CSP; same-origin requests are always permitted and
   carry the page's cookies. So if main-world works, isolated-world is expected to work.
4. **The extension already fetches from content scripts** (`src/export/core/images.js`,
   `src/export/utils/assets.js`) in production — content-script fetch is a proven path here.
5. **Manifest parity.** The spike manifest has **no `host_permissions`** (matches the shipped
   extension), so a GO means **no new permission / no user re-consent** is required.

**Residual risk:** none identified; the spike exists to convert "predicted" into "confirmed."

### Live result (paste when run)

```
[PHASE0-ISOLATED-FETCH] <result here>
```
- [ ] `ok: true`, `conversation.status: 200`, `conversationNoBearer.status: 404` → **GO, gate cleared.**
- [ ] `ok: false` → capture the error; try adding `host_permissions` (see spike README) and note whether that's required.

---

## Spike 2 — virtualized scroll-to  (blocks TOC *navigation* only)

**Status: not yet runnable on this setup.** The verification account's largest chat is 38
turns — nothing is ever unmounted, so the hard case cannot be exercised here. Needs a
genuinely long chat (target 500+ turns).

This is the project's single riskiest assumption. It gates **only** TOC navigation, not the
index: even a NO-GO still ships a complete API-built outline (navigate mounted turns; label
off-screen entries).

Run [spikes/virtualized-scroll/](../spikes/virtualized-scroll/) against a long chat and record:

| Target | Start position | `ok` | steps | ms |
|---|---|---|---|---|
| middle node | scrolled to bottom |  |  |  |
| first-third node | scrolled to bottom |  |  |  |
| last-third node | scrolled to top |  |  |  |

- [ ] Consistently `ok: true` within a few steps / reasonable budget → **GO**, wire navigation in Phase 3.
- [ ] Flaky or `not-mounted-within-budget` → **NO-GO for navigation**; ship index-only TOC.

---

## Fixtures — done

10 synthetic, schema-accurate fixtures in [tests/fixtures/conversations/](../tests/fixtures/conversations/),
all validated as JSON; citation offsets verified (`slice(7,16) === matched_text`). Covers the
§15 list except Canvas `/textdocs` and the DOM-fallback partial-window case (deferred — need
real samples / arrive with `dom-source` in Phase 1).

---

## Gate decision

- **Spike 1:** clear on a green live run (expected). Until then, treat as the one blocking
  unknown — but a low-risk one.
- **Spike 2:** does **not** block Phases 1–2 or the TOC *index*. Phase 3 navigation is
  conditional on it. Proceeding to Phase 1 is safe before Spike 2 is answered.

**Recommendation:** clear Spike 1 (one extension load), then start Phase 1. Schedule Spike 2
whenever a long chat is available; it only affects Phase 3's navigation sub-feature.
