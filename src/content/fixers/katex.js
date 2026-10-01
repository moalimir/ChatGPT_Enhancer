/**
 * Manages KaTeX copy-to-clipboard and rendering protection in one place.
 * Protection is class-based (no inline overrides) so toggling the feature is idempotent.
 */

import { DEFAULT_SETTINGS } from '../../common/config.js';
import { SELECTORS, selectKatexNodes } from '../selectors.js';

const PROTECTION_CLASS = 'gpt-enhancer-katex-protected';
const LEGACY_INLINE_PROPS = ['direction', 'unicode-bidi', 'font-family', '--font-body'];

let currentSettings = { ...DEFAULT_SETTINGS };
let isCopyListenerActive = false;
let toastNode = null;
let toastTimer = null;

function isProtectionEnabled(settings = currentSettings) {
  return Boolean(settings?.enableFix && settings?.fixKatex);
}

function shouldListen(settings = currentSettings) {
  return Boolean(settings?.enableFix && settings?.copyKatex);
}

/**
 * Remove legacy inline overrides that older fixers injected on math nodes.
 * This clears stale state when toggling protection off/on.
 */
function cleanupLegacyInlineStyles(scope = document) {
  const katexNodes = selectKatexNodes(scope).nodes;
  if (!katexNodes || !katexNodes.length) {
    return;
  }
  katexNodes.forEach((node) => {
    const targets = [node, ...node.querySelectorAll('*')];
    targets.forEach((el) => {
      if (!(el instanceof HTMLElement)) {
        return;
      }
      // Only strip text-align if it matches legacy left overrides; keep center if the page set it.
      const textAlign = el.style.getPropertyValue('text-align') || el.style.textAlign;
      if (!textAlign || textAlign.trim().toLowerCase() === 'left') {
        el.style.removeProperty('text-align');
      }
      LEGACY_INLINE_PROPS.forEach((prop) => el.style.removeProperty(prop));
      // Clear any inline ChatGPT font variables that can leak into math.
      Array.from(el.style)
        .filter((prop) => prop.startsWith('--chatgpt-font-'))
        .forEach((prop) => el.style.removeProperty(prop));
    });
  });
}

function applyProtection(scope = document) {
  if (!isProtectionEnabled() || !scope?.querySelectorAll) {
    return;
  }
  cleanupLegacyInlineStyles(scope);
  const nodes = selectKatexNodes(scope).nodes;
  nodes.forEach((node) => {
    if (node instanceof HTMLElement) {
      node.classList.add(PROTECTION_CLASS);
    }
  });
}

function clearProtection(scope = document) {
  if (!scope?.querySelectorAll) {
    return;
  }
  const nodes = scope.querySelectorAll(`.${PROTECTION_CLASS}`);
  nodes.forEach((node) => {
    if (node instanceof HTMLElement) {
      node.classList.remove(PROTECTION_CLASS);
    }
  });
}

/**
 * Mutation hook to be used by the central observer — re-scan only when new nodes appear.
 */
function handleMutations(mutations) {
  if (!isProtectionEnabled() || !mutations?.length) {
    return;
  }
  const shouldRescan = mutations.some((mutation) => {
    if (mutation.type !== 'childList') {
      return false;
    }
    return Array.from(mutation.addedNodes || []).some((node) => {
      if (!(node instanceof Element)) {
        return false;
      }
      return node.matches?.(SELECTORS.katex) || node.querySelector?.(SELECTORS.katex);
    });
  });
  if (shouldRescan) {
    applyProtection();
  }
}

function extractLatex(element) {
  const source = element.closest('[data-math-source]')?.getAttribute('data-math-source');
  if (source) return source;
  const preferred = element.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
  if (preferred && preferred.textContent) {
    return preferred.textContent.trim();
  }

  const anyAnnotation = element.querySelector('.katex-mathml annotation');
  if (anyAnnotation && anyAnnotation.textContent) {
    return anyAnnotation.textContent.trim();
  }

  return element.textContent ? element.textContent.trim() : '';
}

async function copyTextToClipboard(text) {
  if (!text) {
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    const successful = document.execCommand('copy');
    if (!successful) {
      throw new Error('execCommand failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function showToast(message, referenceRect) {
  if (!document.body) {
    return;
  }

  if (!toastNode) {
    toastNode = document.createElement('div');
    toastNode.className = 'chatgpt-direction-fix-toast';
    document.body.appendChild(toastNode);
  }

  toastNode.textContent = message;
  toastNode.classList.add('is-visible');

  if (referenceRect) {
    const top = Math.max(referenceRect.top + window.scrollY - 40, 12);
    let left = referenceRect.left + window.scrollX + referenceRect.width / 2;
    toastNode.style.left = `${left}px`;
    toastNode.style.top = `${top}px`;
    toastNode.style.transform = 'translate(-50%, -100%)';
  } else {
    toastNode.style.left = '50%';
    toastNode.style.top = '24px';
    toastNode.style.transform = 'translate(-50%, 0)';
  }

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    if (toastNode) {
      toastNode.classList.remove('is-visible');
    }
  }, 1800);
}

function markEquationCopied(element) {
  element.classList.add('chatgpt-katex-copied');
  setTimeout(() => {
    element.classList.remove('chatgpt-katex-copied');
  }, 400);
}

async function handleEquationClick(event) {
  if (!shouldListen()) {
    return;
  }
  if (event.defaultPrevented) {
    return;
  }
  if (
    (typeof event.button === 'number' && event.button !== 0) ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const katexElement = target.closest(SELECTORS.katex);
  if (!katexElement) {
    return;
  }

  try {
    const latex = extractLatex(katexElement);
    await copyTextToClipboard(latex);
    markEquationCopied(katexElement);
    showToast('Equation copied', katexElement.getBoundingClientRect());
  } catch (error) {
    showToast('Unable to copy equation');
  }
}

function syncListener() {
  if (!document) {
    return;
  }
  const active = shouldListen();
  if (active && !isCopyListenerActive) {
    document.addEventListener('click', handleEquationClick, true);
    isCopyListenerActive = true;
  } else if (!active && isCopyListenerActive) {
    document.removeEventListener('click', handleEquationClick, true);
    isCopyListenerActive = false;
  }
}

function init(settings) {
  currentSettings = { ...currentSettings, ...(settings || {}) };
  syncListener();
  if (isProtectionEnabled()) {
    applyProtection();
  } else {
    clearProtection();
  }
}

function update(changes) {
  if (!changes) {
    return;
  }
  const next = { ...currentSettings };
  ['enableFix', 'fixKatex', 'copyKatex'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(changes, key) && changes[key]) {
      next[key] = changes[key].newValue;
    }
  });
  currentSettings = next;
  syncListener();
  if (isProtectionEnabled()) {
    applyProtection();
  } else {
    clearProtection();
  }
}

export const KatexManager = {
  init,
  update,
  apply: applyProtection,
  clear: clearProtection,
  handleMutations,
  cleanupLegacyInlineStyles
};
