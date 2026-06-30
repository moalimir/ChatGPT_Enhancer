# Phase 0 — de-risk spikes (throwaway)

Per [docs/chatgpt-internal-api.md §16](../docs/chatgpt-internal-api.md), two assumptions are
load-bearing and unverified. **Settle them before building anything in `src/chatgpt-data/`.**
This code is throwaway — it is not shipped and not imported by the extension.

| Spike | Question | Blast radius if it fails |
|---|---|---|
| [`isolated-world-fetch/`](./isolated-world-fetch/) | Do `/api/auth/session` + `/backend-api/conversation/<id>` work from a **content script** (isolated world) with the **current** manifest (no `host_permissions`)? | **Blocks everything.** API-first path is dead → reconsider before Phase 1. |
| [`virtualized-scroll/`](./virtualized-scroll/) | On a **long** chat (500+ turns), can a middle, currently-unmounted message be reliably mounted + scrolled to within a bounded budget? | **Blocks TOC navigation only.** Ship index-only TOC if it fails. |

Record outcomes in [docs/phase-0-findings.md](../docs/phase-0-findings.md). Both must be
answered (with evidence) to clear the Phase 0 gate.
