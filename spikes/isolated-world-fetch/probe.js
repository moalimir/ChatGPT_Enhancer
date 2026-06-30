/**
 * Phase 0 spike — isolated-world fetch.
 *
 * Runs in a content script's ISOLATED world (default; no "world":"MAIN"), with a manifest
 * that has NO host_permissions — exactly GPT Enhancer's current situation. It answers:
 * can we read the session token and fetch a conversation from the private API here?
 *
 * Privacy: logs ONLY HTTP statuses, booleans, and counts. Never the token, never message
 * text. Safe to read back via the Chrome devtools console.
 *
 * How to read the result: open any https://chatgpt.com/ conversation, open DevTools
 * console, filter for the tag below.
 */
(async () => {
  const TAG = '[PHASE0-ISOLATED-FETCH]';
  const result = { ok: false, world: 'isolated', steps: {} };

  try {
    // 1) Session token (same-origin, no bearer required).
    const sres = await fetch('/api/auth/session', { credentials: 'include' });
    const session = await sres.json().catch(() => ({}));
    const token = session && session.accessToken;
    result.steps.session = { status: sres.status, hasToken: !!token };
    if (!token) {
      result.note = 'no-session-token (logged out?)';
      console.log(TAG, JSON.stringify(result));
      return;
    }

    // 2) Resolve a conversation id: current URL, else the most recent conversation.
    let id = (location.pathname.match(/\/(?:c|g\/[^/]+\/c)\/([0-9a-f-]{36})/) || [])[1];
    if (!id) {
      const lres = await fetch('/backend-api/conversations?offset=0&limit=1&order=updated', {
        headers: { Authorization: 'Bearer ' + token },
        credentials: 'include'
      });
      const list = await lres.json().catch(() => ({}));
      id = list && list.items && list.items[0] && list.items[0].id;
      result.steps.list = { status: lres.status, gotId: !!id };
    }
    if (!id) {
      result.note = 'no-conversation-id';
      console.log(TAG, JSON.stringify(result));
      return;
    }

    // 3) THE TEST: conversation detail WITH bearer from the isolated world.
    const cres = await fetch('/backend-api/conversation/' + id, {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'include'
    });
    const body = await cres.json().catch(() => ({}));
    result.steps.conversation = {
      status: cres.status,
      hasMapping: !!(body && body.mapping),
      nodeCount: body && body.mapping ? Object.keys(body.mapping).length : 0,
      currentNodePresent: !!(body && body.mapping && body.mapping[body.current_node])
    };

    // 4) Sanity: WITHOUT bearer should be 404 (existence hidden) — confirms auth is real.
    const nres = await fetch('/backend-api/conversation/' + id, { credentials: 'include' });
    result.steps.conversationNoBearer = { status: nres.status };

    result.ok = cres.status === 200 && !!(body && body.mapping);
  } catch (error) {
    result.error = String((error && error.message) || error);
  }

  console.log(TAG, JSON.stringify(result));
  // Also stash on window for manual inspection (still no secrets).
  try { window.__PHASE0_ISOLATED_FETCH__ = result; } catch (_) {}
})();
