/**
 * Manages application of custom themes and synchronization with ChatGPT's native mode.
 */

import { DEFAULT_SETTINGS, THEME_COMPATIBILITY } from '../../common/config.js';

const root = document.documentElement;

export const CUSTOM_THEME_CLASSES = [
  'chatgpt-theme-midnight',
  'chatgpt-theme-aurora',
  'chatgpt-theme-nebula',
  'chatgpt-theme-paper',
  'chatgpt-theme-skylight'
];

export const LEGACY_THEME_CLASSES = [
  'chatgpt-theme-original',
  'chatgpt-theme-original-dark',
  'chatgpt-theme-original-light'
];

export const DEPRECATED_THEME_CLASSES = ['chatgpt-theme-daybreak'];
const STORAGE_THEME_MODE_KEY = 'chatgptEnhancerBaseTheme';

let lastKnownChatThemeMode = null;
let themeModeSyncTimer = null;
let lastThemeBlockNotice = null;
let themeTokenApplier = null;
let cachedSettings = { ...DEFAULT_SETTINGS };

export function registerThemeTokenApplier(applier) {
  if (typeof applier === 'function') {
    themeTokenApplier = applier;
  }
}

export function normalizeThemeAlias(theme) {
  if (typeof theme !== 'string') {
    return theme;
  }
  const normalized = theme.trim().toLowerCase();
  return normalized === 'daybreak' ? 'skylight' : normalized;
}

export function resolveThemeClass(theme) {
  const normalized = normalizeThemeAlias(theme);
  if (!normalized || normalized === 'original') {
    return null;
  }
  const candidate = `chatgpt-theme-${normalized}`;
  return CUSTOM_THEME_CLASSES.includes(candidate) ? candidate : null;
}

export function isCustomThemeActive() {
  if (!root) {
    return false;
  }
  return CUSTOM_THEME_CLASSES.some((className) => root.classList.contains(className));
}

export function getApplicableTheme(theme, environmentThemeMode) {
  const normalized = typeof theme === 'string' ? normalizeThemeAlias(theme) : '';
  if (!normalized || normalized === 'original') {
    return {
      theme: null,
      blocked: false,
      requested: normalized || null,
      requiredMode: null,
      environmentMode: environmentThemeMode || null
    };
  }
  const requiredMode = THEME_COMPATIBILITY[normalized] || null;
  if (requiredMode && environmentThemeMode && requiredMode !== environmentThemeMode) {
    return {
      theme: null,
      blocked: true,
      requested: normalized,
      requiredMode,
      environmentMode: environmentThemeMode
    };
  }
  return {
    theme: normalized,
    blocked: false,
    requested: normalized,
    requiredMode,
    environmentMode: environmentThemeMode || null
  };
}

export function getChatGPTThemeMode() {
  const detected = detectChatGPTThemeMode();
  syncDetectedThemeMode(detected);
  return detected;
}

export function applyTheme(theme, environmentThemeMode) {
  if (!root) {
    return;
  }
  const mode = typeof environmentThemeMode === 'string' ? environmentThemeMode : getChatGPTThemeMode();
  root.setAttribute('data-gpt-enhancer-mode', mode === 'dark' ? 'dark' : 'light');
  const { theme: applicableTheme, blocked, requested, requiredMode } = getApplicableTheme(theme, mode);
  resetThemeClasses();
  if (blocked && requested) {
    const key = `${requested}:${requiredMode}:${mode || 'unknown'}`;
    if (lastThemeBlockNotice !== key) {
      lastThemeBlockNotice = key;
    }
    if (themeTokenApplier) {
      themeTokenApplier();
    }
    return;
  }
  const themeClass = resolveThemeClass(applicableTheme);
  if (themeClass) {
    root.classList.add(themeClass);
    lastThemeBlockNotice = null;
  } else {
    lastThemeBlockNotice = null;
  }
  if (themeTokenApplier) {
    themeTokenApplier();
  }
}

export function removeTheme() {
  if (!root) {
    return;
  }
  resetThemeClasses();
  lastThemeBlockNotice = null;
  if (themeTokenApplier) {
    themeTokenApplier();
  }
}

export const ThemeManager = {
  init(settings) {
    cachedSettings = { ...cachedSettings, ...(settings || {}) };
    if (cachedSettings.enableFix) {
      applyTheme(cachedSettings.theme, getChatGPTThemeMode());
    } else {
      removeTheme();
    }
  },
  update(changes) {
    if (!changes) {
      return;
    }
    const next = { ...cachedSettings };
    ['enableFix', 'theme'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(changes, key) && changes[key]) {
        next[key] = changes[key].newValue;
      }
    });
    cachedSettings = next;
    if (next.enableFix) {
      applyTheme(next.theme, getChatGPTThemeMode());
    } else {
      removeTheme();
    }
  }
};

function resetThemeClasses() {
  if (!root) {
    return;
  }
  CUSTOM_THEME_CLASSES.forEach((className) => {
    root.classList.remove(className);
  });
  LEGACY_THEME_CLASSES.forEach((className) => {
    root.classList.remove(className);
  });
  DEPRECATED_THEME_CLASSES.forEach((className) => {
    root.classList.remove(className);
  });
}

function detectChatGPTThemeMode() {
  const tokens = gatherChatGPTThemeTokens();
  const fromAttributes = interpretThemeTokens(tokens.attributes);
  if (fromAttributes) {
    return fromAttributes;
  }
  const fromClasses = interpretThemeTokens(tokens.classes);
  if (fromClasses) {
    return fromClasses;
  }
  const fromStorage = interpretThemeTokens(tokens.storage);
  if (fromStorage) {
    return fromStorage;
  }
  return prefersDarkScheme() ? 'dark' : 'light';
}

// Collects every DOM attribute/class/local storage token so we can infer ChatGPT's current scheme.
function gatherChatGPTThemeTokens() {
  const groups = {
    attributes: [],
    classes: [],
    storage: []
  };
  if (!root) {
    return groups;
  }
  const attributeCandidates = [
    'data-theme',
    'data-color-mode',
    'data-chat-theme',
    'data-chat-base-theme',
    'data-theme-mode',
    'data-app-theme'
  ];
  attributeCandidates.forEach((name) => {
    const value = root.getAttribute(name);
    if (value) {
      groups.attributes.push(value);
    }
  });
  if (root.dataset) {
    if (root.dataset.theme) {
      groups.attributes.push(root.dataset.theme);
    }
    if (root.dataset.colorMode) {
      groups.attributes.push(root.dataset.colorMode);
    }
    if (root.dataset.chatTheme) {
      groups.attributes.push(root.dataset.chatTheme);
    }
  }
  if (root.classList) {
    root.classList.forEach((className) => {
      if (className) {
        groups.classes.push(className);
      }
    });
  }
  try {
    const storageKeys = ['theme', 'chatgpt-theme', 'color-theme', 'chakra-ui-color-mode'];
    storageKeys.forEach((key) => {
      const value = window.localStorage.getItem(key);
      if (value) {
        groups.storage.push(value);
      }
    });
  } catch (error) {
    // Ignore storage access errors (e.g., when disabled by policy).
  }
  return groups;
}

// Interprets loose theme strings and prefers explicit dark values, falling back to system heuristics.
function interpretThemeTokens(tokens) {
  if (!tokens || !tokens.length) {
    return null;
  }
  let candidate = null;
  let sawSystem = false;

  for (const token of tokens) {
    const rawValue = String(token).trim();
    if (!rawValue) {
      continue;
    }
    const value = rawValue.toLowerCase();
    if (value.includes('darkreader')) {
      continue;
    }
    const hasDark = value.includes('dark');
    const hasLight = value.includes('light');
    if (hasDark && !hasLight) {
      return 'dark';
    }
    if (hasLight && !hasDark && candidate !== 'dark') {
      candidate = 'light';
      continue;
    }
    if (!hasDark && !hasLight && (value === 'system' || value === 'auto')) {
      sawSystem = true;
    }
  }

  if (candidate) {
    return candidate;
  }

  if (sawSystem) {
    return prefersDarkScheme() ? 'dark' : 'light';
  }

  return null;
}

function prefersDarkScheme() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Keep a synced copy of the detected mode in local storage without thrashing the API.
function syncDetectedThemeMode(mode) {
  if (mode === lastKnownChatThemeMode && !themeModeSyncTimer) {
    return;
  }
  lastKnownChatThemeMode = mode;
  if (!chrome?.storage?.local) {
    return;
  }
  if (themeModeSyncTimer) {
    clearTimeout(themeModeSyncTimer);
    themeModeSyncTimer = null;
  }
  themeModeSyncTimer = setTimeout(() => {
    if (!chrome?.storage?.local) {
      return;
    }
    if (mode) {
      chrome.storage.local.set({ [STORAGE_THEME_MODE_KEY]: mode });
    } else {
      chrome.storage.local.remove(STORAGE_THEME_MODE_KEY);
    }
    themeModeSyncTimer = null;
  }, 50);
}
