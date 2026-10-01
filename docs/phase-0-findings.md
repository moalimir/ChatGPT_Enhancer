# Live contract checks

The private endpoint and ChatGPT DOM are unsupported implementation details. Record
structural results only: counts, booleans, and HTTP status. Never record tokens,
conversation text, titles, account identifiers, or raw responses.

## Current Chrome build (2026-10-01)

| Contract | Result | Evidence |
|---|---|---|
| Mounted DOM shape: shells, units, roles/IDs, code, composer | Observed | Read-only Chrome DOM count on one signed-in long conversation: 5 shells, 10 units (5 user, 5 assistant), all 10 with ID carriers; 5 assistant bodies and 5 user bubbles; 1 ProseMirror textbox; 0 legacy turns, `<pre>` blocks, or textarea composers. |
| Code and math wrappers | Code observed; math unverified | 1,226 `[data-markdown-copy="code-block"]` elements, all with `code` children and excluded headers. This mounted window had 0 `[data-math-source]` and 0 `.katex` elements. |
| Packaged isolated-world session and conversation fetch | Passed | User loaded the unpacked probe. Its console result reported isolated world, session HTTP 200 with a token present, and conversation HTTP 200. No token or message text was recorded. |
| Valid `mapping` / `current_node` and active-branch count | Passed | Probe reported `shapeValid: true`, 43 active-branch nodes and 42 messages. A later counts-only inspection found 14 user messages, 14 final assistant messages, and 14 intermediate `reasoning_recap` nodes. Only 10 message units were mounted in the DOM. |

The API path can now be implemented against this account and build. It remains an
undocumented endpoint; exports must fail clearly if its contract changes. A mounted-DOM
fallback can only claim the visible window unless complete coverage is separately proven.

## Refactor verification (2026-10-01)

The rebuilt extension exported the same long active branch without scrolling. The
Markdown file contained 28 role headings (14 user, 14 assistant). TXT completed and
contained the full text; one literal `User:` line inside message content makes a raw
line count unsuitable as a turn count. DOCX was a valid archive with 28 export role
labels. The first PDF attempt saved an empty one-page file because the page print
styles hid the export. Printing from an isolated iframe produced a nonempty 916-page
PDF from this code-heavy chat; the user confirmed that PDF looked correct.

Live image download and math presentation remain unverified on chats containing
those elements. PDF and DOCX preserve LaTeX source rather than typeset equations.

Earlier evidence: the [July live audit](./chatgpt-live-audit-2026-07-09.md) found that
offset scrolling did not reliably remount turns; the [June schema reference](./chatgpt-internals-reference.md)
describes response fields that still require revalidation.
