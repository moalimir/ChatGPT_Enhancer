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
}

export function clearDirectionFixes(scope = getConversationRoot()) {
  if (!scope) {
    return;
  }
  clearStyles(selectCodeNodes(scope).nodes);
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
  if (!isEnabled() || !currentSettings.fixCode) {
    return;
  }
  const added = new Set();
  mutations.forEach((mutation) => {
    if (mutation.type !== 'childList') return;
    Array.from(mutation.addedNodes).forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(SELECTORS.code)) added.add(node);
      node.querySelectorAll(SELECTORS.code).forEach((code) => added.add(code));
    });
  });
  applyStyles(added, RESET_VALUES);
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
