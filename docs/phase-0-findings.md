# Live contract checks

The private endpoint and ChatGPT DOM are unsupported implementation details. Record
structural results only: counts, booleans, and HTTP status. Never record tokens,
conversation text, titles, account identifiers, or raw responses.

## Current Chrome build (2026-10-01)

| Contract | Result | Evidence |
|---|---|---|
| Mounted DOM shape: shells, units, roles/IDs, code, composer | Observed | Read-only Chrome DOM count on one signed-in long conversation: 5 shells, 10 units (5 user, 5 assistant), all 10 with ID carriers; 5 assistant bodies and 5 user bubbles; 1 ProseMirror textbox; 0 legacy turns, `<pre>` blocks, or textarea composers. |
| Code and math wrappers | Code observed; math unverified | 1,226 `[data-markdown-copy="code-block"]` elements, all with `code` children and excluded headers. This mounted window had 0 `[data-math-source]` and 0 `.katex` elements. |
| Packaged isolated-world session and conversation fetch | Awaiting manual Chrome run | Automatic browser security review blocked opening `chrome://extensions` to load the probe; it allows HTTP/HTTPS navigation only and prohibits workarounds. Run [isolated-world-fetch](../spikes/isolated-world-fetch/README.md) manually. |
| Valid `mapping` / `current_node` and active-branch count | Awaiting manual Chrome run | Same isolated-world probe. The synthetic branch-count check passes, but it does not verify the live endpoint. |

Do not build an API-dependent export path until the fetch and response-shape checks pass.
If the endpoint is unavailable, keep the strict rendered-DOM path and label its output partial.

Earlier evidence: the [July live audit](./chatgpt-live-audit-2026-07-09.md) found that
offset scrolling did not reliably remount turns; the [June schema reference](./chatgpt-internals-reference.md)
describes response fields that still require revalidation.
