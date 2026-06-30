# Spike: virtualized scroll-to (go/no-go — blocks TOC navigation only)

**Question.** On a long, virtualized chat, can a message that is **not currently mounted** be
reliably brought into the DOM and scrolled to within a bounded time/attempt budget, without
fighting the user's scroll?

This is the one claim the verification account could not test (its biggest chat was 38 turns —
nothing was ever unmounted). It needs a genuinely long chat.

## Run it

1. Open a **long** conversation (target **500+ turns**; the more virtualized, the better).
2. Get the full node list from the API (DevTools console):
   ```js
   const s = await (await fetch('/api/auth/session',{credentials:'include'})).json();
   const id = location.pathname.match(/\/c\/([0-9a-f-]{36})/)[1];
   const c = await (await fetch('/backend-api/conversation/'+id,{headers:{Authorization:'Bearer '+s.accessToken}})).json();
   // ordered active-branch node ids:
   const chain=[]; for(let n=c.current_node;n;n=c.mapping[n]?.parent){ if(c.mapping[n]?.message) chain.push(n);} chain.reverse();
   console.log('total', chain.length, 'middle id', chain[Math.floor(chain.length/2)], 'index', Math.floor(chain.length/2));
   ```
3. Paste [`navigator-spike.js`](./navigator-spike.js) into the console.
4. Scroll to the **bottom** (so the middle target is unmounted), then:
   ```js
   await spikePhase0.run("<middle node id>", <index>, <total>)
   ```
5. Repeat for first-third and last-third targets, and from different starting scroll positions.

## Interpreting the result

```jsonc
{ "ok": true, "mountedInitially": false, "steps": 3, "ms": 820, "log": [...] }
```

- **`ok: true`** consistently (middle/first/last, various start positions), within a few
  steps and a reasonable budget → **GO.** Wire bounded navigation in Phase 3.
- **`ok: false` `reason: "not-mounted-within-budget"`** or flaky → **NO-GO for navigation.**
  Ship the complete API-built TOC **index**, but only navigate to mounted turns and clearly
  label off-screen entries (Phase 3 fallback).
- **`reason: "user-scroll"`** just means you moved during the run; retry while idle.

Notes:
- The proportional/binary search is a *starting* heuristic. If it converges on position but
  the id never mounts, that points to an id/DOM mismatch worth investigating before relying
  on navigation.
- A future extension-owned reader view would sidestep this entirely (it renders the snapshot
  itself), but that is out of the initial rollout.

Record the verdict in [../../docs/phase-0-findings.md](../../docs/phase-0-findings.md).
