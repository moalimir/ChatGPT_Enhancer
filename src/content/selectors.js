/**
 * Central selector registry with fallback resolution for ChatGPT's shifting DOM.
 * Each key maintains an ordered list of candidate selectors. The resolver will
 * cache the first selector that matches to avoid thrashing, and fall back to
 * combined selectors when nothing matches.
 */

const SELECTOR_CANDIDATES = {
  messages: [
    '[data-content-search-unit-key]',
    '[data-testid="conversation-turn"]',
    '[data-testid^="conversation-turn-"]',
    '[data-testid="chat-message"]',
    'div[data-message-author-role]',
    'li[data-message-author-role]'
  ],
  katex: ['.katex-display', '.katex-html', '.katex-mathml', '.katex'],
  code: ['[data-markdown-copy="code-block"] code', 'pre code', 'pre', 'code']
};

const selectorCache = new Map();

function dedupe(list = []) {
  return Array.from(new Set(list.filter(Boolean)));
}

function combine(list = []) {
  const normalized = dedupe(list);
  return normalized.join(', ');
}

function query(root, selector) {
  if (!selector) {
    return [];
  }
  try {
    return Array.from((root || document).querySelectorAll(selector));
  } catch (error) {
    return [];
  }
}

function resolveSelector(key, root = document) {
  const candidates = dedupe(SELECTOR_CANDIDATES[key]);
  if (!candidates.length) {
    return { selector: '', nodes: [] };
  }

  const cached = selectorCache.get(key);
  if (cached) {
    const cachedNodes = query(root, cached);
    if (cachedNodes.length) {
      return { selector: cached, nodes: cachedNodes };
    }
    selectorCache.delete(key);
  }

  for (const candidate of candidates) {
    const nodes = query(root, candidate);
    if (nodes.length) {
      selectorCache.set(key, candidate);
      return { selector: candidate, nodes };
    }
  }

  const combined = combine(candidates);
  return { selector: combined, nodes: query(root, combined) };
}

export function resetSelectorCache() {
  selectorCache.clear();
}

export function selectMessageNodes(root = document) {
  return resolveSelector('messages', root);
}

export function getMessageRole(node) {
  const key = node?.getAttribute?.('data-content-search-unit-key');
  if (key) return key.slice(key.lastIndexOf(':') + 1).toLowerCase();
  const direct = node?.getAttribute?.('data-message-author-role');
  return (direct || node?.querySelector?.('[data-message-author-role]')?.getAttribute('data-message-author-role') || '').toLowerCase();
}

export function getMessageId(node) {
  if (!(node instanceof Element)) return null;
  const carrier = node.matches('[data-chatgpt-selection-message-id], [data-message-id]')
    ? node : node.querySelector('[data-chatgpt-selection-message-id], [data-message-id]');
  if (carrier) return carrier.getAttribute('data-chatgpt-selection-message-id') || carrier.getAttribute('data-message-id');
  const ids = node.closest('[data-chatgpt-search-message-ids]')?.getAttribute('data-chatgpt-search-message-ids');
  return ids?.trim().split(/\s+/)[0] || null;
}

export function selectKatexNodes(root = document) {
  return { selector: SELECTORS.katex, nodes: query(root, SELECTORS.katex) };
}

export function selectCodeNodes(root = document) {
  return resolveSelector('code', root);
}

export const MESSAGE_SELECTORS = dedupe(SELECTOR_CANDIDATES.messages);
export const MESSAGE_SELECTOR = combine(MESSAGE_SELECTORS);

export const SELECTORS = {
  messages: MESSAGE_SELECTOR,
  katex: combine(SELECTOR_CANDIDATES.katex),
  code: combine(SELECTOR_CANDIDATES.code)
};

export function getMessageSelector(root = document) {
  const resolved = selectMessageNodes(root).selector;
  return resolved || SELECTORS.messages;
}

export function getSelector(key) {
  return SELECTORS[key] || '';
}
