// Throwaway live contract probe. Output contains counts/status only; never log a token or text.
(async () => {
  const result = { world: 'isolated', api: {}, dom: {} };
  const conversationId = location.pathname.match(/\/c\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\/|$)/i)?.[1];

  try {
    if (!conversationId) throw new Error('unsupported-route');
    const session = await fetch(`${location.origin}/api/auth/session`, { credentials: 'include' });
    result.api.sessionStatus = session.status;
    if (!session.ok) throw new Error('session-http');
    const token = (await session.json()).accessToken;
    result.api.hasToken = Boolean(token);
    if (!token) throw new Error('missing-token');

    const response = await fetch(`${location.origin}/backend-api/conversation/${conversationId}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` }
    });
    result.api.conversationStatus = response.status;
    if (!response.ok) throw new Error('conversation-http');
    const conversation = await response.json();
    const mapping = conversation?.mapping;
    const current = conversation?.current_node;
    result.api.shapeValid = Boolean(mapping && !Array.isArray(mapping) && typeof mapping === 'object' &&
      typeof current === 'string' && mapping[current]);
    if (!result.api.shapeValid) throw new Error('invalid-shape');

    const seen = new Set();
    let branchMessages = 0;
    let visibleUser = 0;
    let visibleAssistant = 0;
    for (let id = current; id; id = mapping[id].parent) {
      if (seen.has(id) || !mapping[id]) throw new Error('broken-branch');
      seen.add(id);
      const message = mapping[id].message;
      if (!message) continue;
      branchMessages += 1;
      const role = message.author?.role;
      const channel = message.metadata?.channel;
      if (message.metadata?.is_visually_hidden_from_conversation ||
          (message.recipient && message.recipient !== 'all') ||
          (channel && channel !== 'final')) continue;
      if (role === 'user') visibleUser += 1;
      if (role === 'assistant') visibleAssistant += 1;
    }
    result.api.branchNodes = seen.size;
    result.api.branchMessages = branchMessages;
    result.api.visibleUser = visibleUser;
    result.api.visibleAssistant = visibleAssistant;
    result.api.ok = true;
  } catch (error) {
    result.api.ok = false;
    const known = new Set(['unsupported-route', 'session-http', 'missing-token',
      'conversation-http', 'invalid-shape', 'broken-branch']);
    result.api.reason = known.has(error?.message) ? error.message : 'network-or-parse';
  }

  const thread = document.querySelector('[data-thread-find-target="conversation"]') || document.querySelector('main');
  const scope = thread || document;
  const units = Array.from(scope.querySelectorAll('[data-content-search-unit-key]'));
  const legacyTurns = Array.from(scope.querySelectorAll('[data-testid^="conversation-turn-"]'));
  const messages = units.length ? units : legacyTurns;
  const roles = { user: 0, assistant: 0, other: 0 };
  let withId = 0;
  for (const node of messages) {
    const key = node.getAttribute('data-content-search-unit-key');
    const role = key?.slice(key.lastIndexOf(':') + 1) ||
      node.getAttribute('data-message-author-role') ||
      node.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
    roles[role === 'user' || role === 'assistant' ? role : 'other'] += 1;
    const id = node.getAttribute('data-chatgpt-selection-message-id') ||
      node.querySelector('[data-chatgpt-selection-message-id], [data-message-id]')?.getAttribute('data-chatgpt-selection-message-id') ||
      node.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
      node.closest('[data-chatgpt-search-message-ids]')?.getAttribute('data-chatgpt-search-message-ids');
    if (id) withId += 1;
  }
  result.dom = {
    threadRoot: Boolean(thread),
    shells: scope.querySelectorAll('[data-turn-key]').length,
    newUnits: units.length,
    legacyTurns: legacyTurns.length,
    roles,
    messagesWithId: withId,
    codeBlocks: scope.querySelectorAll('[data-markdown-copy="code-block"]').length,
    legacyPre: scope.querySelectorAll('pre').length,
    mathSources: scope.querySelectorAll('[data-math-source]').length,
    katex: scope.querySelectorAll('.katex').length,
    proseMirrorComposers: document.querySelectorAll('.ProseMirror[contenteditable="true"]').length,
    textareaComposers: document.querySelectorAll('textarea[name="prompt-textarea"], #prompt-textarea').length
  };
  console.log('[GPT-ENHANCER-LIVE-CONTRACT]', JSON.stringify(result));
})();
