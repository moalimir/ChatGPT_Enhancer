/**
 * Monitors and corrects text direction (RTL/LTR) for code blocks and mixed content.
 * KaTeX direction protection lives in KatexManager to avoid overlapping inline fixes.
 */

import { DEFAULT_SETTINGS } from '../../common/config.js';
import { SELECTORS, selectCodeNodes } from '../selectors.js';

const root = document.documentElement;
const RESET_VALUES = {
  direction: 'ltr',
  'unicode-bidi': 'isolate',
  'text-align': 'left'
};
const TEXT_BLOCKS = '[data-markdown-text-style="assistant-message"] :is(p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th), [data-user-message-bubble] [data-search-result-target]';
const EXCLUDED_TEXT = 'code, pre, .katex, [data-math-source], [data-markdown-copy="code-block"], [data-markdown-copy="exclude"], .sr-only';
const PERSIAN = /[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF]/g;
const FIRST_PERSIAN = /^[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF]$/;
const LATIN = /[A-Za-z]/g;

let currentSettings = { ...DEFAULT_SETTINGS };

export function applyDirectionFixes(scope = getConversationRoot()) {
  if (!isEnabled() || !scope) {
    return;
  }

  const codeNodes = selectCodeNodes(scope).nodes;

  // Always clear before reapplying to avoid stale inline values when toggling repeatedly.
  clearStyles(codeNodes);

  if (currentSettings.fixCode && codeNodes.length) {
    applyStyles(codeNodes, RESET_VALUES);
  }
  scope.querySelectorAll(TEXT_BLOCKS).forEach(alignTextBlock);
}

export function clearDirectionFixes(scope = getConversationRoot()) {
  if (!scope) {
    return;
  }
  clearStyles(selectCodeNodes(scope).nodes);
  scope.querySelectorAll('.gpt-enhancer-text-rtl, .gpt-enhancer-text-ltr').forEach((node) => {
    node.classList.remove('gpt-enhancer-text-rtl', 'gpt-enhancer-text-ltr');
  });
}

export function init(settings) {
  currentSettings = { ...currentSettings, ...(settings || {}) };
  syncRootClasses();
  if (isEnabled()) {
    clearDisabledFeatures({}, currentSettings);
    applyDirectionFixes();
  } else {
    clearDirectionFixes();
  }
}

export function update(changes) {
  if (!changes) {
    return;
  }
  const previous = { ...currentSettings };
  const next = { ...currentSettings };
  ['enableFix', 'fixKatex', 'fixCode'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(changes, key) && changes[key]) {
      next[key] = changes[key].newValue;
    }
  });
  currentSettings = next;
  syncRootClasses();
  if (isEnabled()) {
    clearDisabledFeatures(previous, next);
    applyDirectionFixes();
  } else {
    clearDirectionFixes();
  }
}

export const DirectionFixer = {
  init,
  update,
  apply: applyDirectionFixes,
  clear: clearDirectionFixes,
  handleMutations
};

function isEnabled(settings = currentSettings) {
  return Boolean(settings?.enableFix);
}

function applyStyles(elements, styles) {
  if (!elements) {
    return;
  }
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    Object.entries(styles).forEach(([name, value]) => {
      element.style.setProperty(name, value, 'important');
    });
  });
}

function clearStyles(elements) {
  if (!elements) {
    return;
  }
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement) || !element.style) {
      return;
    }
    Object.keys(RESET_VALUES).forEach((name) => {
      element.style.removeProperty(name);
    });
  });
}

function handleMutations(mutations) {
  if (!isEnabled()) return;
  const added = new Set();
  const blocks = new Set();
  mutations.forEach((mutation) => {
    if (mutation.type === 'characterData') {
      const block = mutation.target.parentElement?.closest(TEXT_BLOCKS);
      if (block) addBlockAndAncestors(block, blocks);
      return;
    }
    if (mutation.type !== 'childList') return;
    const parentBlock = mutation.target.closest?.(TEXT_BLOCKS);
    if (parentBlock) addBlockAndAncestors(parentBlock, blocks);
    Array.from(mutation.addedNodes).forEach((node) => {
      if (!(node instanceof Element)) return;
      if (currentSettings.fixCode) {
        if (node.matches(SELECTORS.code)) added.add(node);
        node.querySelectorAll(SELECTORS.code).forEach((code) => added.add(code));
      }
      if (node.matches(TEXT_BLOCKS)) blocks.add(node);
      node.querySelectorAll(TEXT_BLOCKS).forEach((block) => blocks.add(block));
    });
  });
  if (currentSettings.fixCode) applyStyles(added, RESET_VALUES);
  blocks.forEach(alignTextBlock);
}

function addBlockAndAncestors(block, blocks) {
  for (let node = block; node; node = node.parentElement) {
    if (node.matches(TEXT_BLOCKS)) blocks.add(node);
  }
}

function alignTextBlock(block) {
  if (!(block instanceof HTMLElement) || block.closest(EXCLUDED_TEXT)) return;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let persian = 0;
  let latin = 0;
  let first = '';
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (textNode.parentElement?.closest(EXCLUDED_TEXT)) continue;
    const text = textNode.textContent || '';
    persian += (text.match(PERSIAN) || []).length;
    latin += (text.match(LATIN) || []).length;
    if (!first) first = text.match(/[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FFA-Za-z]/)?.[0] || '';
  }
  const rtl = persian > 0 && (persian >= latin || FIRST_PERSIAN.test(first));
  block.classList.toggle('gpt-enhancer-text-rtl', rtl);
  block.classList.toggle('gpt-enhancer-text-ltr', !rtl && latin > 0);
}

function syncRootClasses() {
  if (!root) {
    return;
  }
  const enabled = isEnabled();
  root.classList.toggle('chatgpt-direction-fix-enabled', enabled);
  root.classList.toggle('chatgpt-direction-fix-code', enabled && currentSettings.fixCode);
}

function getConversationRoot() {
  return document.querySelector('main') || document.body || document.documentElement;
}

function clearDisabledFeatures(previous, next) {
  if (!previous || !previous.enableFix) {
    return;
  }
  const scope = getConversationRoot();
  if (!scope) {
    return;
  }
  if (previous.fixCode && !next.fixCode) {
    clearStyles(selectCodeNodes(scope).nodes);
  }
}
