# Conversation fixtures (Phase 0)

Synthetic, schema-accurate `/backend-api/conversation/<id>` responses. **No real data** —
hand-authored to the verified shape ([reference §4](../../docs/chatgpt-internals-reference.md#4-private-rest-api)),
so there is nothing to sanitize and no privacy risk. These are the inputs the Phase 1
transcript normalizer, active-branch walk, and visibility filter are tested against.

Each file carries a `_case` field describing what it exercises and the expected outcome.

| File | Exercises | Expected |
|---|---|---|
| `linear.json` | Plain user/assistant thread | Active branch `n1,n2,n3` |
| `branched.json` | Regenerated turn (two children) | Active branch follows `current_node`; abandoned `a2` excluded |
| `broken-parent.json` | Ancestor id missing from `mapping` | `activeBranch()` throws `conversation-broken-parent` → DOM fallback |
| `cycle.json` | Parent cycle | `activeBranch()` throws `conversation-cycle` → DOM fallback |
| `hidden-content.json` | system / `is_visually_hidden` / `*_editable_context` / `analysis` + `commentary` / `bio` + `web.search` recipients | Only `u1`, `a1`, `u2` survive the filter |
| `multimodal-image.json` | `multimodal_text` parts: string + `{text,direction}` object + image pointer | Flatten all three; image → asset ref |
| `code.json` | `content_type=code` with source in `content.text` | Read `.text` (not `parts`); fenced block |
| `citations.json` | PUA citation span + `content_references` (offsets verified `slice(7,16)===matched_text`) | Replace whole span via indices; no orphaned anchor text |
| `streaming-incomplete.json` | Trailing turn `status=in_progress`, `end_turn=false` | Mark incomplete / exclude; revalidate after settle |
| `empty-and-unknown.json` | Empty parts + unknown content type + unknown object part | Drop empties; skip+warn unknowns; never stringify opaque data |

## Coverage vs. the rollout plan

Covers the unit-fixture list in
[chatgpt-internal-api.md §15](../../docs/chatgpt-internal-api.md). Not yet covered (deferred,
needs real samples — see [reference §4.8](../../docs/chatgpt-internals-reference.md#48-still-unverified-re-verify-before-depending-on-these)):
Canvas `/textdocs`, and the DOM-fallback "partial mounted window" case (a DOM fixture, added
with the `dom-source` work in Phase 1).
