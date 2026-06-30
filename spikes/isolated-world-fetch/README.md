# Spike: isolated-world fetch (go/no-go — blocks everything)

**Question.** Can a content script running in the **isolated world**, under a manifest with
**no `host_permissions`** (GPT Enhancer's current shape), read the session token and fetch
`/backend-api/conversation/<id>`?

This matters because all my verification probes ran in the DevTools **main** world. Main and
isolated worlds share cookies, but differ on CSP/permission handling — so this must be
confirmed in a real content script, not assumed.

## Run it

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder (`spikes/isolated-world-fetch/`).
3. Open any conversation: `https://chatgpt.com/c/...` (logged in). The probe runs at
   `document_idle`.
4. Open DevTools → Console → filter **`PHASE0-ISOLATED-FETCH`**.

(If you have the Chrome MCP connected, the assistant can read the console line directly via
`read_console_messages` once the probe has run — no copy/paste needed.)

## Interpreting the result

```jsonc
[PHASE0-ISOLATED-FETCH] {
  "ok": true,                 // <-- GO
  "world": "isolated",
  "steps": {
    "session":      { "status": 200, "hasToken": true },
    "conversation": { "status": 200, "hasMapping": true, "nodeCount": 42, "currentNodePresent": true },
    "conversationNoBearer": { "status": 404 }   // confirms auth is genuinely enforced
  }
}
```

- **`ok: true`** → **GO.** Same-origin content-script fetch works with the current manifest;
  no new permission needed. Proceed to Phase 1.
- **`ok: false`** with `conversation.status` of `0`/CORS/CSP error → **NO-GO as-is.** Try
  adding `"host_permissions": ["https://chatgpt.com/*"]` to this manifest and re-run:
  - works with it → Phase 1 needs that permission (a user-visible re-consent — note it).
  - still fails → reconsider the approach (e.g. `world: "MAIN"` injection) before Phase 1.
- **`hasToken: false`** → you're logged out; log in and retry (not a real failure).

Record the verdict in [../../docs/phase-0-findings.md](../../docs/phase-0-findings.md).

## Privacy

The probe logs only statuses, booleans, and a node count. It never logs the access token or
any message text. Remove the unpacked extension when done.
