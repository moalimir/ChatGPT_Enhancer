# GPT Enhancer refactor plan

**Goal:** all four exports (Markdown, TXT, PDF, DOCX) cover the active branch of a
long ChatGPT conversation while live page enhancements continue to work.

**Current state:** the TOC, PNG, JSON, and CSV features are already removed. The
remaining export path still scrolls a virtualized page and clones mounted DOM.

1. **Prove live contracts.** Record structural DOM counts and run the packaged
   isolated-world fetch probe. Gate API work on a valid authenticated response with
   `mapping`, `current_node`, and a terminating active branch.
2. **Repair DOM-dependent features.** Use narrow current and legacy selectors for
   mounted messages, code, math, and the composer. Remove the export scroll sweep and
   broad `<main>` fallback. Mark DOM-only capture as partial.
3. **Normalize conversation data.** On user-requested export, fetch only the current
   conversation. Validate the graph, follow `current_node`, exclude hidden/system/tool
   and non-final messages, and normalize supported text, code, citations, and assets.
   Keep credentials and snapshots in memory only.
4. **Make text exports complete.** Generate Markdown and TXT from the validated branch;
   preserve all/assistant scope. An unavailable API may offer a clearly partial DOM export.
5. **Make visual exports complete.** Render that same validated branch to sanitized
   export HTML, then reuse the existing PDF and DOCX generators. Report unsupported
   assets instead of silently omitting them.
6. **Verify and release.** Test short and long chats, edits/regenerations, RTL/LTR,
   code, math, tables, and images. Check first/middle/last turns and absence of hidden
   content. Update privacy and help text before release.

The [schema reference](./chatgpt-internals-reference.md) and [July audit](./chatgpt-live-audit-2026-07-09.md)
are historical evidence, not current contracts. Live results go in
[phase-0-findings.md](./phase-0-findings.md).
