# Conversation fixtures

Synthetic `/backend-api/conversation/<id>` responses. **No real data** —
hand-authored from the historical shape ([reference §4](../../docs/chatgpt-internals-reference.md#4-private-rest-api)),
so there is nothing to sanitize and no privacy risk. These are inputs for the
transcript normalizer, active-branch walk, and visibility filter.

Each file carries a `_case` field describing what it exercises and the expected outcome.

| File | Exercises | Expected |
|---|---|---|
| `linear.json` | Plain user/assistant thread | Active branch `n1,n2,n3` |
| `branched.json` | Regenerated turn (two children) | Active branch follows `current_node`; abandoned `a2` excluded |
| `broken-parent.json` | Ancestor id missing from `mapping` | `activeBranch()` throws `conversation-broken-parent` → explicit export error |
| `cycle.json` | Parent cycle | `activeBranch()` throws `conversation-cycle` → explicit export error |
| `hidden-content.json` | system / `is_visually_hidden` / `*_editable_context` / `analysis` + `commentary` / `bio` + `web.search` recipients | Only `u1`, `a1`, `u2` survive the filter |
| `multimodal-image.json` | `multimodal_text` parts: string + `{text,direction}` object + image pointer | Flatten all three; image → asset ref |
| `code.json` | `content_type=code` with source in `content.text` | Read `.text` (not `parts`); fenced block |
| `citations.json` | PUA citation span + `content_references` (offsets verified `slice(7,16)===matched_text`) | Replace whole span via indices; no orphaned anchor text |
| `streaming-incomplete.json` | Trailing turn `status=in_progress`, `end_turn=false` | Refuse export until the response finishes |
| `empty-and-unknown.json` | Empty parts + unknown content type + unknown object part | Refuse an incomplete export; never stringify opaque data |

## Coverage

Covers branch, visibility, text, code, citation, image-pointer, and malformed-response
cases. Canvas `/textdocs` remains unsupported. Unsupported content or a broken graph produces
an error; the extension never substitutes a partial mounted DOM window.
