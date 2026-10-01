# GPT Enhancer refactor

## Current implementation

- `src/common/conversation-source.js` isolates the private API contract. Reads happen
  only for a requested export or opened Contents panel. Credentials stay in memory.
  The active branch is validated; hidden, tool, system, and intermediate recaps are filtered.
- `src/content/selectors.js` is the compatibility boundary for mounted messages and IDs.
  Unmounted replies have no persistent anchor: Contents seeks within the native scroller
  by API branch order, then positions the exact mounted ID at the top. User input cancels seeking.
  First/last destinations stay pinned while heights change. Native smooth scrolling
  waits for `scrollend`, then realigns moving anchors after a mount cycle. Navigation
  is capped at 30 seconds/48 attempts; user input stops the animation. Reduced-motion
  preferences bypass animation. No reply preview is retained.
  Selection colors mix the current text/surface colors, giving neutral grey in dark
  mode and adapting to the other theme palettes without an accent-colored highlight.
  The highlight starts when the reply's beginning enters the viewport, including
  newly mounted replies, and its background/outline fade over two seconds.
- `src/common/fonts.js` owns the bundled font registry and per-document font loading.
- `src/common/direction.js` supplies prose direction detection for live paragraphs and exports.
  Host math is excluded; the live math protection/copy feature has been removed.
- `src/content/floating-panel.js` owns movement, viewport bounds, edge docking, and keyboard
  controls for Contents and Quick export. Contents uses native CSS resizing.
- `src/export/core/render-conversation.js` renders escaped Markdown and KaTeX via the maintained
  Markdown math plugin. Raw HTML and trusted TeX commands are disabled. Code/currency remain text.
  Equations containing Arabic-script letters use native MathML with the selected text font;
  KaTeX's HTML layout lacks those character metrics.
- `src/export/core/prepare-document.js` prepares an isolated document's fonts, math styles, and
  images before printing or Word conversion. Math and its WOFF2 fonts are bundled and lazy loaded.
- PDF uses native browser printing; DOCX converts equations to images. Markdown preserves source;
  TXT preserves readable text/TeX. All four separate messages with dividers.
  PDF equations are measured by their intrinsic overflow and fitted individually:
  an overflowing equation must not make Chrome shrink the entire document.

## Verification, 2026-10-01

The packaged API contract was previously proved: 28 visible active-branch messages
(plus 14 intermediate recaps) versus 10 mounted units. Long exports do not scroll the page.
Live navigation preflight found replies 1, 3, 7, 11, and 14 at a 64 px header offset.
Final packaged smooth clicks on replies 1, 7, and 14 also settled at 64 px, recording
26, 23, and 16 intermediate scroll positions. Highlights are neutral; all seven
theme/mode combinations were checked. The suite contains 39 passing tests.
Mixed prose preserves multiword English phrases, including a phrase split by bold markup.
The latest live Persian export is 33 A4 pages with embedded Source Sans 3/Vazirmatn.
Pages 1 and 12 were visually checked for full-width alignment and equation rendering.

The finalization checks use synthetic English, Persian, mixed-language, selected-font,
long-table, long-code, and 63-message documents. Inspect actual PDFs and embedded fonts,
not just DOM output. The long sample's final marker must be present. Chromium print
shrinks content for structural RTL tables/lists: keep tables structurally LTR, reverse
Persian columns, set individual cell/paragraph direction, and pad both list edges.

Run the checks in [README](../README.md#checks). Final packaged-extension checks require
reloading `dist` in Chrome and reloading the signed-in conversation. Verify TOC theme,
movement/resizing, distant-message navigation, and PDF math/fonts before release.

## Maintenance boundary

If the API or message schema changes, report an explicit error instead of exporting
only mounted messages. Update synthetic fixtures, then rerun the count-only packaged
[probe](../spikes/isolated-world-fetch/README.md). Never log tokens or message text.
Historical site observations are in [the reference](./chatgpt-internals-reference.md)
and [phase-zero findings](./phase-0-findings.md).
