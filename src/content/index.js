/**
 * Main entry point that bootstraps feature managers (Theme, Font, Fixers) and observes settings changes.
 */
import { DEFAULT_SETTINGS } from '../common/config.js';
import { loadSettings } from '../common/storage.js';
import {
  ThemeManager,
  applyTheme,
  getChatGPTThemeMode,
  normalizeThemeAlias,
  removeTheme
} from './theme/index.js';
import { DirectionFixer } from './fixers/direction.js';
import { FontManager } from './fonts/index.js';
import { KatexManager } from './fixers/katex.js';
import { getMessageSelector } from './selectors.js';
import { QuickActionManager } from './quick-actions/index.js';

const root = document.documentElement;
const EXPORT_PROGRESS_EVENT = 'GPT_ENHANCER_EXPORT_PROGRESS';
const THEME_MANAGER_FLAG = '__CHATGPT_ENHANCER_THEME_MANAGER_ENABLED';
const FIXER_MANAGER_FLAG = '__CHATGPT_ENHANCER_FIXER_MANAGER_ENABLED';
const THEME_ATTRIBUTE_FILTER = [
  'class',
  'data-theme',
  'data-color-mode',
  'data-chat-theme',
  'data-chat-base-theme',
  'data-theme-mode',
  'data-app-theme'
];
const FIXER_OBSERVER_CONFIG = { childList: true, subtree: true, characterData: true };

let currentSettings = { ...DEFAULT_SETTINGS };
let pendingThemeSync = null;
let suppressThemeObserver = false;
let fixerObserver = null;
let fixerObserverTarget = null;
let fixerObserverReconnectTimer = null;
let fixerRootObserver = null;
let fixerRootObserverTimer = null;
let exportToastNode = null;
let exportToastTimer = null;

setThemeManagerEnabled(true);
setFixerManagerEnabled(true);
bootstrap();

async function bootstrap() {
  FontManager.setMessageSelector(getMessageSelector());
  try {
    const stored = await loadSettings();
    currentSettings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  } catch (error) {
    currentSettings = { ...DEFAULT_SETTINGS };
  }
  initializeManagers(currentSettings);
  attachWatchers();
}

function initializeManagers(settings) {
  suppressThemeObserver = true;
  try {
    ThemeManager.init(settings);
  } catch (error) {
    console.error('[GPT Enhancer] ThemeManager init failed.', error);
    setThemeManagerEnabled(false);
  }
  DirectionFixer.init(settings);
  FontManager.init(settings);
  KatexManager.init(settings);
  QuickActionManager.init(settings);
  syncFixerObserver();
  scheduleObserverRelease();
  attachExportProgressListener();
}

function setThemeManagerEnabled(enabled) {
  if (typeof window === 'undefined') {
    return;
  }
  window[THEME_MANAGER_FLAG] = Boolean(enabled);
}

function setFixerManagerEnabled(enabled) {
  if (typeof window === 'undefined') {
    return;
  }
  window[FIXER_MANAGER_FLAG] = Boolean(enabled);
}

function attachWatchers() {
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChanges);
  }
  attachThemeObserver();
  attachColorSchemeListener();
}

function handleStorageChanges(changes, areaName) {
  if (areaName !== 'sync' && areaName !== 'local') {
    return;
  }
  const { hasChanges, picked, nextSettings } = extractRelevantChanges(changes);
  if (!hasChanges) {
    return;
  }
  currentSettings = nextSettings;
  suppressThemeObserver = true;
  try {
    ThemeManager.update(picked);
  } catch (error) {
    console.error('[GPT Enhancer] ThemeManager update failed.', error);
    setThemeManagerEnabled(false);
  }
  DirectionFixer.update(picked);
  FontManager.update(picked);
  KatexManager.update(picked);
  QuickActionManager.update(picked);
  syncFixerObserver();
  scheduleObserverRelease();
}

function extractRelevantChanges(changes) {
  const nextSettings = { ...currentSettings };
  const picked = {};
  let hasChanges = false;

  const keys = [
    'enableFix',
    'fixKatex',
    'fixCode',
    'theme',
    'fontsEnabled',
    'fontEnglish',
    'fontPersian',
    'copyKatex',
    'exportQuickAction',
    'exportQuickActionPosition',
    'exportFormat',
    'exportScope'
  ];

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      picked[key] = changes[key];
      hasChanges = true;
      if (key === 'theme') {
        const normalized = normalizeThemeAlias(changes[key]?.newValue);
        if (typeof normalized === 'string' && normalized) {
          nextSettings.theme = normalized;
        }
      } else {
        nextSettings[key] = changes[key]?.newValue;
      }
    }
  });

  return { hasChanges, picked, nextSettings };
}

function attachThemeObserver() {
  if (!root || typeof MutationObserver === 'undefined') {
    return;
  }
  const observer = new MutationObserver((mutations) => {
    if (suppressThemeObserver || !isThemeManagerEnabled()) {
      return;
    }
    const hasRelevantMutation = mutations.some(
      (mutation) => mutation.type === 'attributes' && THEME_ATTRIBUTE_FILTER.includes(mutation.attributeName)
    );
    if (hasRelevantMutation) {
      scheduleThemeSync();
    }
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: THEME_ATTRIBUTE_FILTER
  });
}

function attachColorSchemeListener() {
  try {
    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    if (!media) {
      return;
    }
    const handleChange = () => scheduleThemeSync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleChange);
    }
  } catch (error) {
    console.error('[GPT Enhancer] Unable to attach color scheme listener.', error);
  }
}

function attachExportProgressListener() {
  if (typeof document === 'undefined') {
    return;
  }
  // Surface export progress/error events from the content script into a lightweight toast for users.
  document.addEventListener(EXPORT_PROGRESS_EVENT, (event) => {
    const detail = event?.detail || {};
    handleExportProgress(detail);
  });
}

function handleExportProgress(detail) {
  const status = detail?.status || '';
  const message = buildExportToastMessage(status, detail);
  if (!message) {
    return;
  }
  showExportToast(message);
}

function buildExportToastMessage(status, detail) {
  switch (status) {
    case 'starting':
      return 'Preparing export…';
    case 'loading-content':
      return 'Loading conversation…';
    case 'normalizing':
      return 'Cleaning conversation…';
    case 'fonts':
      return 'Loading export fonts…';
    case 'images':
      return 'Inlining images…';
    case 'generating':
      return detail?.format ? `Generating ${detail.format.toUpperCase()}…` : 'Generating export…';
    case 'done':
      return null;
    case 'cleanup':
      return null;
    case 'aborted':
      return 'Export stopped (tab hidden or closed).';
    case 'error': {
      const raw = (detail && detail.message) || '';
      if (raw.includes('export-interrupted')) {
        return 'Export paused because the page was scrolled. Please retry when idle.';
      }
      return raw || 'Export failed. Please retry.';
    }
    default:
      return null;
  }
}

function showExportToast(message) {
  if (!document.body) {
    return;
  }

  if (!exportToastNode) {
    exportToastNode = document.createElement('div');
    exportToastNode.className = 'gpt-export-toast';
    document.body.appendChild(exportToastNode);
  }

  exportToastNode.textContent = message;
  exportToastNode.classList.add('is-visible');

  exportToastNode.style.left = '50%';
  exportToastNode.style.top = '24px';
  exportToastNode.style.transform = 'translate(-50%, 0)';

  if (exportToastTimer) {
    clearTimeout(exportToastTimer);
  }

  exportToastTimer = setTimeout(() => {
    if (exportToastNode) {
      exportToastNode.classList.remove('is-visible');
    }
  }, 2200);
}

function scheduleThemeSync(environmentMode) {
  if (pendingThemeSync || !isThemeManagerEnabled()) {
    return;
  }
  const schedule =
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 16);
  pendingThemeSync = schedule(() => {
    pendingThemeSync = null;
    syncTheme(environmentMode);
  });
}

function syncTheme(environmentMode) {
  if (!isThemeManagerEnabled()) {
    return;
  }
  suppressThemeObserver = true;
  if (currentSettings.enableFix) {
    const mode = typeof environmentMode === 'string' ? environmentMode : getChatGPTThemeMode();
    applyTheme(currentSettings.theme, mode);
  } else {
    removeTheme();
  }
  scheduleObserverRelease();
}

function isThemeManagerEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean(window[THEME_MANAGER_FLAG]);
}

function scheduleObserverRelease() {
  const release =
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 16);
  release(() => {
    suppressThemeObserver = false;
  });
}

function getConversationRoot() {
  return document.querySelector('main') || document.body || document.documentElement;
}

/**
 * Central MutationObserver so fixers don't register separate observers.
 * Delegates to individual managers that handle their own debouncing.
 */
function attachFixerObserver() {
  const target = getConversationRoot();
  if (!target) {
    scheduleFixerObserverReconnect();
    return;
  }
  fixerObserverTarget = target;
  if (fixerObserverReconnectTimer) {
    clearTimeout(fixerObserverReconnectTimer);
    fixerObserverReconnectTimer = null;
  }
  if (!fixerObserver) {
    fixerObserver = new MutationObserver(handleFixerMutations);
  }
  fixerObserver.disconnect();
  fixerObserver.observe(target, FIXER_OBSERVER_CONFIG);
}

function detachFixerObserver() {
  if (fixerObserver) {
    fixerObserver.disconnect();
  }
  fixerObserverTarget = null;
  if (fixerObserverReconnectTimer) {
    clearTimeout(fixerObserverReconnectTimer);
    fixerObserverReconnectTimer = null;
  }
}

function attachFixerRootObserver() {
  if (fixerRootObserver || typeof MutationObserver === 'undefined' || !document.body) {
    return;
  }
  fixerRootObserver = new MutationObserver(() => {
    scheduleFixerRootCheck();
  });
  fixerRootObserver.observe(document.body, { childList: true, subtree: true });
}

function detachFixerRootObserver() {
  if (fixerRootObserver) {
    fixerRootObserver.disconnect();
    fixerRootObserver = null;
  }
  if (fixerRootObserverTimer) {
    clearTimeout(fixerRootObserverTimer);
    fixerRootObserverTimer = null;
  }
}

function scheduleFixerRootCheck() {
  if (fixerRootObserverTimer) {
    return;
  }
  fixerRootObserverTimer = setTimeout(() => {
    fixerRootObserverTimer = null;
    if (!currentSettings.enableFix) {
      return;
    }
    const nextTarget = getConversationRoot();
    if (nextTarget && nextTarget !== fixerObserverTarget) {
      attachFixerObserver();
    }
  }, 120);
}

function scheduleFixerObserverReconnect() {
  if (fixerObserverReconnectTimer) {
    return;
  }
  fixerObserverReconnectTimer = setTimeout(() => {
    fixerObserverReconnectTimer = null;
    if (currentSettings.enableFix) {
      attachFixerObserver();
    }
  }, 500);
}

function handleFixerMutations(mutations) {
  FontManager.handleFontMutations(mutations);
  if (typeof DirectionFixer.handleMutations === 'function') {
    DirectionFixer.handleMutations(mutations);
  }
  KatexManager.handleMutations(mutations);
}

function syncFixerObserver() {
  if (currentSettings.enableFix) {
    attachFixerObserver();
    attachFixerRootObserver();
  } else {
    detachFixerObserver();
    detachFixerRootObserver();
  }
}
