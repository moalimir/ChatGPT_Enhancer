# ChatGPT Internals — Reference (DOM, APIs, Theming, Storage)

> **What this is.** A detailed, observation-based reference for how `chatgpt.com` works
> internally: page architecture, DOM structure, the CSS design-token/theming system, the
> private REST API, client-side storage, and the fonts it ships. It exists so GPT Enhancer
> features can be built against ground truth instead of guesswork.
>
> **Historical reference.** These observations predate the current refactor. Use the
> [active plan](./refactor-plan.md) for scope and recheck every private contract live.
>
> **Status.** Observed against a logged-in session on 2026-06-30 (desktop + mobile-fallback
> render). Everything here is a private implementation detail of ChatGPT's web app, not a
> supported contract; class names, tokens, and endpoints change without notice. Re-verify
> before depending on any specific selector or field.

---

## 1. Tech stack & page lifecycle

| Aspect | Detail |
|---|---|
| App type | Client-rendered SPA. SSR'd shell (`window.__oai_SSR_HTML`/`__oai_SSR_TTI`) then hydrated. |
| Router | **React Router** (`window.__reactRouterContext`, `__reactRouterManifest`, `__reactRouterDataRouter`). Navigation is client-side (`pushState`); no full reloads between chats. |
| Data cache | **TanStack Query** (`window.__REACT_QUERY_CACHE__`) + **MobX** (`__mobxGlobals`). Hydrated from the REST API in §4. |
| Experiment/flags | **Statsig** (`window.__STATSIG__`), Segment analytics (`__SEGMENT_INSPECTOR__`). |
| Validation | **Zod** (`__zod_globalRegistry`) — they validate their own payloads. |
| Build markers | `<html data-build="prod-…" data-seq="…">`; response header `x-build`. Useful to detect a deploy that may have shifted selectors. |
| Edge | Cloudflare in front (`cf-ray`, `cf-cache-status: DYNAMIC`); API responses are Brotli (`content-encoding: br`). |

**Consequence for the extension:** because routing is client-side, content scripts must
react to in-app navigation (`popstate`, `pageshow`, URL diffing, or root mutations) — not
assume a page load per conversation. Don't hook React internals; watch the URL/DOM.

---

## 2. DOM architecture

### 2.1 Landmarks & layout skeleton

```
<html class="dark …" data-chat-theme dir data-contrast data-focus-mode>
 <body>
  <nav aria-label="Sidebar"> … conversation list, account menu … </nav>
  <main>
    … conversation thread (virtualized list of turns) …
    … composer (sticky bottom) …
  </main>
```

- Sidebar: `nav[aria-label="Sidebar"]`. Conversation history, new-chat, search, account menu.
- Thread + composer live under `<main>`. `<main>` (or a scroll container within) is the
  **scroll host** for the virtualized message list.
- Misc controls expose test ids, e.g. `[data-testid="conversation-options-button"]`.

### 2.2 Conversation turns & messages (the important part)

Each turn is addressable. **Verified attributes on the message element:**

| Attribute | Example / values | Notes |
|---|---|---|
| `data-message-id` | `64fde9a0-…` | **Equals the API `mapping` node id** (see §4.6). Primary scroll/anchor target. |
| `data-message-author-role` | `user` \| `assistant` \| `system` \| `tool` | Authoritative role. |
| `data-message-model-slug` | `gpt-5-1`, `gpt-4o`, … | **DOM exposes the per-message model** (matches API `metadata.model_slug`). Only on assistant turns. |
| `dir` | `ltr` \| `rtl` \| `auto` | Per-message direction. |

Turn containers also carry `data-testid="conversation-turn-<n>"`, `data-turn-id`, and
`data-turn="user|assistant"`.

- **User messages** render as plain text in a flex bubble (`div.flex.w-full.flex-col.gap-1.items-end…`); **no** `.markdown`/`.prose` wrapper.
- **Assistant messages** render Markdown inside `div.markdown.prose.dark:prose-invert.wrap-break-word…` (Tailwind Typography `prose` + a `.markdown` hook the extension already targets).

### 2.3 Markdown rendering internals (assistant content)

Verified block tags produced: `h1 h2 h3 … p ul ol hr blockquote pre code table`.

- **Code blocks:** `pre` (utility classes like `overflow-visible! px-0!`) → a **header bar
  `div`** (shows the language label) + a **`Copy`** button → `code`. Language is shown in
  the header; the `code` element's class is often empty (no `language-x` class to rely on),
  so read the header label, not a class. Inline code is a bare `<code>`.
- **Math (KaTeX):** `.katex` containing `.katex-mathml`, `.katex-html`, and
  `annotation[encoding="application/x-tex"]` (the **raw LaTeX source** — this is what the
  extension's click-to-copy reads). Display math adds `.katex-display`.
- **Tables:** wrapped in a CSS-module scroll wrapper (`…_tableWrapper`, e.g.
  `TyagGW_tableWrapper`) with `thead`/`tbody`. Module hashes change across builds — match
  on `[class*="tableWrapper"]`, not the exact hash.

### 2.4 Composer (message input)

Two render modes — handle both:

- **Desktop:** a ProseMirror rich editor — `#prompt-textarea` / `.ProseMirror[contenteditable="true"]`. Insert text by focusing and dispatching input, not by setting `.value`.
- **Mobile-fallback** (`?mweb_fallback=1`): a plain `<textarea>` (CSS-module class like `…_fallbackTextarea`). Here `.value` + an `input` event works.

The Send control is typically `[data-testid="send-button"]` / `#composer-submit-button`
(absent/renamed in fallback). The extension's prompt-injection/quick-action code must
detect **both** composer shapes and the current Send selector defensively.

### 2.5 Virtualization (root cause of the long-chat problems)

ChatGPT **virtualizes** the thread: only turns near the viewport are mounted in the DOM;
scrolled-away turns are unmounted. This is why DOM-only Export/TOC miss content on long
chats. The complete source is the API (§4), addressed back to the DOM via `data-message-id`.

---

## 3. Theming & design system

This is the richest opportunity for "advanced themes." ChatGPT is fully driven by **CSS
custom properties** — override them and you restyle the whole app cleanly.

### 3.1 How light/dark/accents are selected

| Mechanism | Where | Values |
|---|---|---|
| Light/dark | `class` on `<html>` | `dark` / (light = absence) — verified `<html class="dark …">` |
| Accent theme | `data-chat-theme` on `<html>` | **`default, blue, green, yellow, purple, pink, orange, black`** (8 built-ins, verified from `--<name>-theme-*` token sets) |
| Contrast | `data-contrast` | `default` (higher-contrast variants exist) |
| Focus mode | `data-focus-mode` | `mouse` / keyboard |
| Persisted choice | `localStorage["theme"]` and `localStorage["oai/apps/chatTheme/user-<id>"]` | What ChatGPT reads on load |

So toggling `data-chat-theme` on `<html>` switches ChatGPT's **built-in accent palettes**
with zero CSS of our own — a near-free feature.

### 3.2 The design-token taxonomy (~288 variables on `:root`)

Resolved values below are from the **dark** theme. The naming is systematic:

**Surfaces / backgrounds**
```
--main-surface-primary  #000     --bg-primary       #212121   --bg-elevated-primary  #1b1b1b
--main-surface-secondary #212121 --bg-secondary     #303030   --bg-elevated-secondary #000
--main-surface-tertiary  #2f2f2f --bg-tertiary       #414141   --bg-scrim   #00000080
--message-surface  #323232d9     --composer-surface-primary #212121
--sidebar-surface-primary #000   --sidebar-surface-secondary #303030  --component-sidebar-bg #000
--bg-status-success/-error/-warning …
```
**Text / icons**
```
--text-primary #fff  --text-secondary #cdcdcd  --text-tertiary #afafaf  --text-quaternary #ffffff69
--icon-primary #fff  --icon-secondary #cdcdcd  --icon-tertiary #afafaf  --icon-accent #63a8f8
--link #7ab7ff       --link-hover #5e83b3
```
**Accents (brand palette)**
```
--accent-blue #2c67c5  --accent-green #53b559  --accent-orange #d25e28
--accent-pink #c96257  --accent-purple color(display-p3 …)  --accent-yellow #d9a337
--bg-accent-static #3a83f7
```
**Borders**
```
--border-light #ffffff0d  --border-default #ffffff26  --border-heavy #fff3  --border-extra-light #ffffff1a
```
**Interactive state system** — a large, consistent matrix:
```
--interactive-bg-accent-{default|hover|inactive|press|muted-…}
--interactive-icon-{accent|secondary|tertiary|danger-…}-{default|hover|inactive|press|selected}
--interactive-border-{secondary|tertiary|danger-…}-{default|hover|inactive|press}
--interactive-focus-ring-{primary|secondary|danger}
```
**Per-accent theme palettes** (driven by `data-chat-theme`):
```
--{black|blue|green|yellow|purple|pink|orange|default}-theme-interactive-bg-accent-{default|hover|press|…}
--{…}-theme-interactive-label-accent
```
**Motion / layout**
```
--spring-bounce / --spring-bounce-duration .833s   --spring-common / -duration .667s
--easing-spring-elegant / -duration .58171s        --easing-common
--header-height   --spacing .25rem (base spacing unit)   --cot-shimmer-duration
```

### 3.3 Recipe for a comprehensive custom theme

To restyle ChatGPT thoroughly (and survive their oklch usage), override at `:root`/`html`
with `!important`, grouped:

1. Surfaces: `--main-surface-*`, `--bg-*`, `--message-surface`, `--composer-surface-primary`, `--sidebar-surface-*`, `--component-sidebar-bg`.
2. Text/icons: `--text-*`, `--icon-*`, `--link`, `--link-hover`.
3. Accents + interactive: `--accent-*`, `--bg-accent-static`, `--interactive-bg-accent-*`, `--interactive-icon-accent-*`.
4. Borders: `--border-*`.
5. (Optional) motion: shorten/disable `--spring-*` / `--easing-*` durations for a "reduce-motion / snappy" mode.

This is materially cleaner than the extension's current per-element CSS, and it's the same
surface ChatGPT itself themes against. (See also the existing oklch-normalization in
`src/export/core/normalizer.js` — for *display* theming you usually don't need it, only for
export rasterization.)

### 3.4 Fonts shipped by ChatGPT

`document.fonts` includes: **`OpenAI Sans`**, `Super Sans VF`, `Inter` / `Inter var`,
`Circle`, plus accessibility faces **`OpenDyslexic`**, `OpenDyslexic Mono`,
**`Atkinson Hyperlegible Mono`**, and the full `KaTeX_*` family. The presence of
OpenDyslexic / Atkinson Hyperlegible means an "accessible/dyslexia-friendly font" toggle can
reuse fonts already loaded by the page (no bundling needed) — a cheap win for the Fonts
feature. ChatGPT also exposes a font/contrast preference UI of its own.

---

## 4. Private REST API

Observed in the page context on 2026-06-30. Content-script access still needs a live check.
This section records the historical data model, not a supported API contract.

### 4.1 Auth
- `GET /api/auth/session` → `{ accessToken, user, expires }` (read same-origin).
- Every `/backend-api/*` call needs `Authorization: Bearer <accessToken>`.
- **Cookies alone are insufficient** — without the bearer header the conversation endpoint
  returns `404` (existence hidden). Token is short-lived; fetch per use, never persist.

### 4.2 Endpoints (observed)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/session` | Access token + user |
| GET | `/backend-api/conversations?offset=&limit=&order=updated` | History list (no `mapping`); **`limit` caps at 100** |
| GET | `/backend-api/conversation/<id>` | **Full message tree** (`mapping` + `current_node`); one Brotli payload, **no pagination** |
| GET | `/backend-api/conversation/<id>/stream_status` | `{ status: "COMPLETE" \| … }` — detect mid-generation |
| GET | `/backend-api/conversation/<id>/textdocs` | Canvas/Canmore documents (content lives **outside** `mapping`) |
| GET | `/backend-api/files/<file_id>/download` | Resolve an `asset_pointer` to a signed, time-limited URL |
| GET | `/backend-api/me`, `/memories`, `/models`, `/files/library` | Account/memory/models/files (not needed for our features) |

Inaccessible/nonexistent → `404 { detail: { code: "conversation_inaccessible" } }`.

### 4.3 Conversation model (`mapping`)
Tree of nodes keyed by id: `{ id, parent, children, message }`. `message` =
`{ id, author{role}, create_time, content{content_type, parts|text}, recipient, channel, status, end_turn, metadata }`.
Linearize the visible thread by walking `parent` from `current_node` (selects the active
edit/regenerate branch; ignore other branches).

### 4.4 Content types & part shapes (verified catalog)
- `text` → `content.parts[]` of markdown strings.
- `code` → **`content.text`** (string) + `content.language` (**not** in `parts`).
- `multimodal_text` → `parts[]` mixing strings, `{content_type:"text", text, direction}` objects, and asset pointers.
- `image_asset_pointer` (part) → `{ asset_pointer, width, height, size_bytes, … }`.
- Reasoning: `thoughts`, `reasoning_recap` — hidden from UI.
- `user_editable_context` / `model_editable_context` — custom instructions / memory.
- Voice mode: audio/video asset-pointer parts.

### 4.5 Visibility & citations
- **Hide signal:** `metadata.is_visually_hidden_from_conversation === true` (authoritative;
  observed on system, hidden-tool, and `user_editable_context` messages). Combine with
  role/recipient/channel rules (`recipient==='all'`, `channel ∈ {null,final}`) — redundant
  on purpose, fail closed.
- **Citations (verified mechanism):** web/cited answers embed spans delimited by private-use
  sentinels `U+E200`(start) / `U+E202`(separator) / `U+E201`(end). `metadata.content_references[]`
  gives exact code-unit offsets into the part string — verified `part.slice(start_idx, end_idx)
  === matched_text`. The span **wraps readable anchor text**, so replace the *whole* span;
  do **not** regex-strip only the PUA chars or the anchor text is orphaned.

```js
function stripCitations(part, contentReferences = []) {
  const spans = contentReferences
    .filter(r => Number.isInteger(r.start_idx) && Number.isInteger(r.end_idx))
    .sort((a, b) => b.start_idx - a.start_idx);     // right-to-left keeps indices valid
  let out = part;
  for (const r of spans) {
    const replacement = renderReference(r);          // web → ` [${title}](${url})`; alt_text/other → ''
    out = out.slice(0, r.start_idx) + replacement + out.slice(r.end_idx);
  }
  return out.replace(/[\uE200-\uE20F]/g, '');        // safety net for stray sentinels
}
```
`ref.type` seen: `alt_text` (drop), web types (`url`/`title`/`items` → Markdown link).

### 4.6 DOM ↔ API bridge
`data-message-id` (DOM) === `mapping` node id (API), verified. Build complete data from the
API; navigate the live (virtualized) page via `[data-message-id="…"]`.

### 4.7 Edge cases & long-chat behavior (verified)

| Behavior | Detail / implication |
|---|---|
| **No pagination** | `/conversation/<id>` returns the whole `mapping` in one Brotli payload; the app's own calls carry no cursor/offset. A 1000-turn chat is one fetch — completeness is not the bottleneck; client-side parse/render is. |
| **Caching** | `cf-cache-status: DYNAMIC` — always fresh. |
| **Error shape** | Inaccessible/nonexistent → `404 { detail: { code: "conversation_inaccessible" } }`. Branch fallback on status/code, don't throw. |
| **List cap** | `/conversations` honors `limit ≤ 100` (200/1000 → 0 rows). Page with `offset` for "export all". |
| **URL variants** | One regex covers plain/custom-GPT/project chats; `/share/<id>` is a **separate** anonymous source — don't assume the authed endpoint applies. |
| **Canvas** | Document body is at `/conversation/<id>/textdocs`, not in `mapping` parts. |
| **Mid-generation** | `/stream_status` `COMPLETE`, or per-message `status`/`end_turn`, detect a partial trailing turn. |
| **Branches ≠ length** | Active-branch depth can be far shorter than `Object.keys(mapping).length` (regenerations inflate node count). Always walk from `current_node`. |

```js
// Conversation route (plain / custom-GPT / project); /share/<id> intentionally excluded.
const CONVERSATION_ROUTE_RE = /\/(?:c|g\/[^/]+\/c|g\/[^/]+\/project\/[^/]+\/c)\/([0-9a-f-]{36})(?:\/|$)/i;
```

### 4.8 Still unverified (re-verify before depending on these)

Could not be confirmed on the verification account (no long/Canvas/shared chats); these are
the open items the rollout's de-risk phase must settle.

| Item | Why unverified | Risk if assumed |
|---|---|---|
| **Scroll-to a virtualized message** (long chat) | Largest test chat was 38 turns — nothing unmounted | Riskiest claim; gate TOC *navigation* behind a real long-chat test |
| **Packaged content-script fetch** (isolated world) | All probes ran in DevTools **main** world | Cookies are shared, but confirm `Authorization`+`credentials` from the built extension |
| **`/textdocs` item shape** (Canvas) | No Canvas chat to sample | Field names assumed; capture one before merging into export |
| **`/share/<id>` source** | No shared link to test | Distinct adapter; don't assume `/conversation/<id>` applies |
| **Token refresh mid-op** | Token didn't expire in testing | A long export may outlive it; re-fetch on `401` |
| **Rate limiting** | ~75 looped fetches succeeded | No hard limit seen; single-conversation use only, no batch-crawl |

---

## 5. Client-side storage (localStorage)

Names only (values are user data — never read/exfiltrate beyond need). Useful keys observed:

| Key | Use |
|---|---|
| `theme` | Light/dark/system choice ChatGPT reads on load |
| `oai/apps/chatTheme/user-<id>` | Accent (`data-chat-theme`) choice |
| `homepage_prompt_style` | Home prompt layout pref |
| `cache/user-<id>/<wsid>/conversation-history` | Cached history list (TanStack persisted) |
| `cache/user-<id>/<wsid>/models` | Cached model list |
| `cache/user-<id>/<wsid>/pinned-items` | Pinned conversations |
| `oai/apps/recentsOrganization/user-<id>` | Recents/org grouping |
| `oai-did`, `client-correlated-secret`, JWT entries | Identity/session (**do not touch**) |

The extension keeps its own state in `chrome.storage` and should **not** write to ChatGPT's
keys; reading `theme`/`chatTheme` (to mirror the user's current selection) is the only
benign use.

---

## 6. Feature opportunity map

Each idea is paired with the concrete internal hook that makes it feasible.

### 6.1 Theming & visual (high value, low risk — pure CSS/DOM)

| Idea | Mechanism |
|---|---|
| **Advanced full-app themes** | Override the §3.2 token groups at `:root` — clean, comprehensive restyle (vs. today's per-element CSS). |
| **Expose ChatGPT's 8 accent themes** | Set `data-chat-theme` ∈ `{default,blue,green,yellow,purple,pink,orange,black}` — zero custom CSS. |
| **Custom accent picker** | Override `--accent-*` + `--interactive-bg-accent-*` from a user-chosen color. |
| **Reading/focus mode** | Constrain thread width, hide sidebar, increase line-height via a few tokens + layout CSS. |
| **Message density / font size** | Scale `--spacing`, prose font-size, `--text-*` weights. |
| **Reduce-motion / snappy mode** | Zero out `--spring-*` / `--easing-*` durations. |
| **Dyslexia-friendly fonts** | Apply already-loaded `OpenDyslexic` / `Atkinson Hyperlegible` to `.markdown` + composer. |
| **Per-role bubble styling** | Target `[data-message-author-role="user|assistant"]`; style `--message-surface`. |

### 6.2 Export & integrations (built on §4 API)

| Idea | Mechanism |
|---|---|
| **Export → Google Docs** | Read conversation via `/backend-api/conversation/<id>` → build HTML/Markdown → create a doc with the **Google Docs/Drive API** using `chrome.identity.getAuthToken` (OAuth). Needs `identity` permission + an OAuth client; **all client-side**. |
| **Export → Notion / Obsidian / Markdown file** | Same transcript → Notion API (token) or a downloaded `.md` (Obsidian-ready, with front-matter). |
| **Email / share a chat** | Transcript → `mailto:` body or a copy-to-clipboard rich block. |
| **Copy as Markdown/JSON (one message or whole chat)** | Per-message button using `data-message-id` → API node → normalized text. Fixes today's long-chat gaps. |
| **Selective export (pick turns)** | Checkbox per turn keyed by `data-message-id`; filter the API transcript. |

### 6.3 Navigation & productivity (API completeness + the id bridge)

| Idea | Mechanism |
|---|---|
| **Complete TOC on long chats** | Build outline from API transcript; navigate via `data-message-id` (the core hybrid plan). |
| **In-conversation search/jump** | Search the full API transcript (even unmounted turns), jump via the bridge. |
| **Bookmark / pin messages** | Store `data-message-id`s in `chrome.storage`; render markers + a jump list. |
| **Conversation stats** | From the transcript: message/word counts, code-block count, est. tokens, reading time, model mix (`metadata.model_slug`). |
| **"Jump to my last question"** / prev-next user turn | Iterate `[data-message-author-role="user"]` or API user nodes. |

### 6.4 Composer & prompts

| Idea | Mechanism |
|---|---|
| **Prompt variables/templates** | Extend the prompt library; insert into the composer (handle ProseMirror **and** textarea, §2.4). |
| **Quick slash-commands / snippets** | Detect composer input; offer an inline menu; inject text. |
| **Reusable system-style preambles** | Insert a templated first message. |

### 6.5 Lower-priority / watch-list

- **Canvas export** — needs `/textdocs` shape (unverified; capture a Canvas chat first).
- **Voice/image-gen handling** — asset pointers exist; out of scope until needed.
- **Folders/tags overlay** — ChatGPT has its own `recentsOrganization`/`pinned-items`; augment rather than duplicate.

---

## 7. Cross-cutting caveats

- **Everything here is private and unstable.** Class names (especially CSS-module hashes),
  tokens, attributes, and endpoints change between builds (`data-build`/`x-build`). Prefer
  semantic hooks (`data-message-id`, `data-message-author-role`, `.markdown`, CSS variables)
  over utility/hash classes, and keep DOM fallbacks.
- **Client-side only.** Reads happen same-origin inside the user's tab; no backend. The
  bearer token is used in-request and discarded — never persisted, logged, or sent off-device.
- **Respect the user's data & ToS.** Single-conversation, user-initiated reads of the user's
  own visible data. No bulk crawling or background sync. This doc makes no legal determination.
- **React-driven DOM.** Don't fight React: apply theming via tokens/attributes on `<html>`,
  observe mutations for re-renders, and debounce. Watch client-side navigation, not page loads.

---

## Appendix — quick reference

**`<html>` attributes:** `class="dark …"`, `data-chat-theme`, `data-contrast`, `data-focus-mode`, `dir`, `lang`, `data-build`, `data-seq`.
**Message element:** `data-message-id`, `data-message-author-role`, `data-message-model-slug`, `dir`.
**Turn container:** `data-testid="conversation-turn-<n>"`, `data-turn-id`, `data-turn`.
**Assistant content root:** `.markdown.prose` (code = `pre>div(header)+button(Copy)+code`; math = `.katex` + `annotation[encoding="application/x-tex"]`; tables = `[class*="tableWrapper"]`).
**Composer:** `#prompt-textarea`/`.ProseMirror` (desktop) or `textarea._fallbackTextarea` (mobile).
**Theme tokens:** ~288 CSS vars at `:root` — `--main-surface-*`, `--bg-*`, `--text-*`, `--icon-*`, `--border-*`, `--accent-*`, `--interactive-*`, `--{accent}-theme-*`, `--spring-*`.
**API:** `GET /api/auth/session` → bearer → `GET /backend-api/conversation/<id>` (full tree).
