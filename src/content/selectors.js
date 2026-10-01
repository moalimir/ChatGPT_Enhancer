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

export function getScrollHost(node = selectMessageNodes().nodes[0]) {
  for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return document.scrollingElement;
}

async function scrollHostTo(host, top, behavior, signal) {
  if (Math.abs(host.scrollTop - top) < 1) return;
  if (behavior === 'instant') { host.scrollTop = top; return; }
  let complete;
  const finished = new Promise((resolve) => { complete = resolve; });
  const cancel = () => {
    const position = host.scrollTop;
    host.scrollTop = position; // Stop native animation at the user's current position.
    complete();
  };
  host.addEventListener('scrollend', complete, { once: true });
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(complete, 1500);
  try {
    host.scrollTo({ top, behavior });
    await finished;
  } finally {
    clearTimeout(timeout);
    host.removeEventListener('scrollend', complete);
    signal?.removeEventListener('abort', cancel);
  }
}

// Virtualized turns have no persistent anchor. Seek by branch order, then return
// only the exact mounted ID. Native column-reverse scrollers use negative offsets.
export async function revealMessage(id, branchIds, { signal } = {}) {
  const order = new Map(branchIds.map((messageId, index) => [messageId, index]));
  const target = order.get(id);
  if (target === undefined) throw new Error('Refresh contents to find this reply.');
  const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  const deadline = performance.now() + 30000;
  let low = 0, high = 1, previousRange = 0;
  for (let step = 0; step < 48 && performance.now() < deadline; step++) {
    signal?.throwIfAborted();
    const nodes = selectMessageNodes().nodes.filter((node) => getMessageRole(node) === 'assistant');
    const mounted = nodes.find((node) => getMessageId(node) === id);
    const host = getScrollHost(mounted || nodes[0]);
    if (!host) break;
    const range = host.scrollHeight - host.clientHeight;
    const reverse = host.scrollTop < 0 || getComputedStyle(host).flexDirection === 'column-reverse';
    if (mounted) {
      const destination = () => {
        const extent = Math.max(0, host.scrollHeight - host.clientHeight);
        const top = host.scrollTop + mounted.getBoundingClientRect().top - host.getBoundingClientRect().top - 64;
        return Math.max(reverse ? -extent : 0, Math.min(reverse ? 0 : extent, top));
      };
      await scrollHostTo(host, destination(), behavior, signal);
      const top = mounted.getBoundingClientRect().top;
      await new Promise((resolve) => setTimeout(resolve, 300));
      signal?.throwIfAborted();
      // Mounting neighboring turns can change their estimated heights after the
      // first scroll. Return only once this exact anchor has stopped moving.
      if (mounted.isConnected && Math.abs(mounted.getBoundingClientRect().top - top) < 2
        && Math.abs(destination() - host.scrollTop) < 2) return mounted;
      continue;
    }
    if (!(range > 0)) break;
    if (previousRange && Math.abs(range - previousRange) > 1) { low = 0; high = 1; }
    previousRange = range;
    const position = reverse ? 1 + host.scrollTop / range : host.scrollTop / range;
    const visible = nodes.map((node) => order.get(getMessageId(node))).filter(Number.isFinite);
    if (visible.length) {
      if (target < Math.min(...visible)) high = Math.min(high, position);
      else if (target > Math.max(...visible)) low = Math.max(low, position);
    }
    // Keep endpoints pinned while React mounts them and recalculates the height.
    const next = target === 0 ? 0 : target === branchIds.length - 1 ? 1
      : step === 0 ? Math.max(low, Math.min(high, target / (branchIds.length - 1))) : (low + high) / 2;
    await scrollHostTo(host, (reverse ? next - 1 : next) * range, behavior, signal);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  signal?.throwIfAborted();
  throw new Error('ChatGPT has not loaded this reply. Try again or refresh contents.');
}

export function selectCodeNodes(root = document) {
  return resolveSelector('code', root);
}

export const MESSAGE_SELECTORS = dedupe(SELECTOR_CANDIDATES.messages);
export const MESSAGE_SELECTOR = combine(MESSAGE_SELECTORS);

export const SELECTORS = {
  messages: MESSAGE_SELECTOR,
  code: combine(SELECTOR_CANDIDATES.code)
};

export function getMessageSelector(root = document) {
  const resolved = selectMessageNodes(root).selector;
  return resolved || SELECTORS.messages;
}

export function getSelector(key) {
  return SELECTORS[key] || '';
}
