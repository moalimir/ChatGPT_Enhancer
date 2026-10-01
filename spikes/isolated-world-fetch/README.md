# Packaged live contract probe

This throwaway extension records DOM structure and tests authenticated conversation
fetches from a packaged **isolated-world content script** with no `host_permissions`.
It is separate from the production extension. Its only output is one
`[GPT-ENHANCER-LIVE-CONTRACT]` console line containing counts, booleans, and HTTP status.
It does not log token, conversation text, title, message IDs, or account ID.

1. In Chrome, open `chrome://extensions`, enable Developer mode, and **Load unpacked**
   this directory.
2. Reload a signed-in `https://chatgpt.com/c/<id>` conversation. A project conversation
   with `/c/<id>` also works.
3. In DevTools Console, filter for `GPT-ENHANCER-LIVE-CONTRACT`. Record only its JSON
   result in [the contract log](../../docs/phase-0-findings.md).
4. Remove the unpacked probe extension when finished.

`api.ok: true`, `shapeValid: true`, a successful HTTP status, and a positive
`branchMessages` count prove the data path for that account and build. A failed result
needs investigation before API-dependent production code. Compare `dom.newUnits` with
`api.visibleUser + api.visibleAssistant` on a long chat to see the mounted window.
