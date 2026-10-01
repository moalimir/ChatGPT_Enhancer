/**
 * Handles injection and application of custom fonts for English and Persian text.
 */

import { FONT_FACE_DEFINITIONS, selectedFonts } from '../../common/fonts.js';
import { DEFAULT_SETTINGS, FONT_STACKS } from '../../common/config.js';
import { SUPPORTED_LANGUAGES, detectLanguage } from '../../common/languages.js';

const root = document.documentElement;
let messageSelector = '*';
const FONT_VARIABLES = ['--font-body'];
let fontImportStyle = null;
let pendingFontSync = false;
let fontSyncInterval = null;
let cachedSettings = { ...DEFAULT_SETTINGS };
let updateTimeout = null;
const DEBOUNCE_DELAY = 100;


export function isActive(settings = cachedSettings) {
  return Boolean(settings && settings.enableFix && settings.fontsEnabled);
}

export function clearGlobalFontVariables(fontVariables) {
  if (!root) {
    return;
  }
  fontVariables.forEach((variable) => {
    root.style.removeProperty(variable);
  });
}

function setGlobalFontVariables(font, fontVariables = FONT_VARIABLES) {
  if (!root || !font) {
    return;
  }
  fontVariables.forEach((variable) => {
    root.style.setProperty(variable, font);
  });
}

export function resetMessageFontClasses(selector, fontVariables) {
  document.querySelectorAll(selector).forEach((message) => {
    if (!(message instanceof HTMLElement)) {
      return;
    }
    message.classList.remove('chatgpt-font-message');
    message.style.removeProperty('--chatgpt-font-message-english');
    SUPPORTED_LANGUAGES.forEach((lang) => {
      message.classList.remove(`chatgpt-font-${lang.id}`);
      message.style.removeProperty(lang.variable);
    });
    fontVariables.forEach((variable) => {
      message.style.removeProperty(variable);
    });
  });
}

export function applyFontsToMessage(element, fontSettings, options = {}) {
  const { fontVariables = FONT_VARIABLES } = options;
  if (!(element instanceof HTMLElement)) {
    return;
  }
  if (!isActive()) {
    return;
  }
  element.classList.add('chatgpt-font-message');
  element.style.removeProperty('--chatgpt-font-message-english');
  SUPPORTED_LANGUAGES.forEach((lang) => {
    element.classList.remove(`chatgpt-font-${lang.id}`);
    element.style.removeProperty(lang.variable);
  });
  const textContent = element.textContent || '';
  const detectedLangId = detectLanguage(textContent);
  const englishFont = fontSettings?.english || null;
  let finalFontStack = englishFont;
  if (englishFont) {
    element.style.setProperty('--chatgpt-font-message-english', englishFont);
  }
  if (detectedLangId) {
    const langConfig = SUPPORTED_LANGUAGES.find((lang) => lang.id === detectedLangId);
    if (langConfig) {
      element.classList.add(`chatgpt-font-${langConfig.id}`);
      const specificFont = fontSettings?.[langConfig.id];
      if (specificFont) {
        finalFontStack = selectedFonts(cachedSettings).stack;
        element.style.setProperty(langConfig.variable, finalFontStack);
      }
    }
  }
  if (finalFontStack) {
    fontVariables.forEach((variable) => {
      element.style.setProperty(variable, finalFontStack);
    });
  } else {
    fontVariables.forEach((variable) => {
      element.style.removeProperty(variable);
    });
  }
}

// Debounced observer handler keeps streaming from firing per keystroke while scanning the selector once.
export function handleFontMutations(mutations, hooks = {}) {
  if (!isActive()) {
    return;
  }
  if (updateTimeout) {
    return;
  }
  updateTimeout = setTimeout(() => {
    updateTimeout = null;
    if (!isActive()) {
      return;
    }
    const fontSettings = buildFontSettings(cachedSettings);
    const selector = hooks.messageSelector || messageSelector || '*';
    const touched = new Set();
    if (Array.isArray(mutations)) {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData' && mutation.target?.parentElement) {
          const message = mutation.target.parentElement.closest(selector);
          if (message) {
            touched.add(message);
          }
        }
        if (mutation.type === 'childList') {
          Array.from(mutation.addedNodes || []).forEach((node) => {
            if (!(node instanceof Element)) {
              return;
            }
            const message = node.matches(selector) ? node : node.closest(selector);
            if (message) {
              touched.add(message);
            }
            node.querySelectorAll(selector).forEach((nested) => touched.add(nested));
          });
        }
      });
    }
    if (!touched.size) {
      document.querySelectorAll(selector).forEach((message) => {
        applyFontsToMessage(message, fontSettings);
      });
      return;
    }
    touched.forEach((message) => {
      applyFontsToMessage(message, fontSettings);
    });
  }, DEBOUNCE_DELAY);
}

export function scheduleFontSync(callback) {
  if (pendingFontSync || !isActive()) {
    return;
  }
  pendingFontSync = true;
  const invoke = () => {
    pendingFontSync = false;
    if (!isActive()) {
      return;
    }
    callback();
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(invoke);
  } else {
    setTimeout(invoke, 16);
  }
}

// Ensure fonts are imported once via @font-face rules before toggling classes.
function stopFontSyncInterval() {
  if (fontSyncInterval) {
    clearInterval(fontSyncInterval);
    fontSyncInterval = null;
  }
  pendingFontSync = false;
}

function cancelPendingFontUpdate() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }
}

export function setMessageSelector(selector) {
  messageSelector = selector || '*';
}

export function apply(settings) {
  cachedSettings = { ...cachedSettings, ...(settings || {}) };
  if (!root) {
    return;
  }
  const enabled = isActive(cachedSettings);
  root.classList.toggle('chatgpt-font-control-enabled', enabled);
  if (!enabled) {
    root.style.removeProperty('--chatgpt-font-english');
    SUPPORTED_LANGUAGES.forEach((lang) => {
      root.style.removeProperty(lang.variable);
    });
    clearGlobalFontVariables(FONT_VARIABLES);
    resetMessageFontClasses(messageSelector, FONT_VARIABLES);
    stopFontSyncInterval();
    cancelPendingFontUpdate();
    return;
  }

  ensureFontImports();

  const fontSettings = buildFontSettings(cachedSettings);
  setGlobalFontVariables(fontSettings.english);
  applyRootFontVariables(fontSettings);
  updateFontsForExistingMessages(fontSettings);
}

export function update(changes) {
  if (!changes) {
    return;
  }
  const next = { ...cachedSettings };
  const keys = ['enableFix', 'fontsEnabled', 'fontEnglish', ...SUPPORTED_LANGUAGES.map((lang) => lang.settingsKey)];
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(changes, key) && changes[key]) {
      next[key] = changes[key].newValue;
    }
  });
  apply(next);
}

export const FontManager = {
  init(settings) {
    apply(settings);
  },
  update(changes) {
    update(changes);
  },
  apply,
  isActive,
  handleFontMutations,
  resetMessageFontClasses,
  applyFontsToMessage,
  clearGlobalFontVariables,
  setMessageSelector
};

function ensureFontImports() {
  // Inject @font-face rules derived from the build assets so fonts stay available in the page context.
  if (fontImportStyle || !document.head) {
    return;
  }
  const rules = FONT_FACE_DEFINITIONS.map((definition) => {
    const url = resolveRuntimeUrl(definition.path);
    if (!url) {
      return '';
    }
    return `
@font-face {
  font-family: "${definition.family}";
  font-style: normal;
  font-weight: ${definition.weight};
  font-display: swap;
  src: url("${url}") format("woff2");
}
`;
  }).filter(Boolean).join('\n');
  if (!rules) {
    return;
  }
  fontImportStyle = document.createElement('style');
  fontImportStyle.textContent = rules;
  document.head.appendChild(fontImportStyle);
}

function updateFontsForExistingMessages(fontSettings) {
  if (!isActive()) {
    return;
  }
  const settings = fontSettings || buildFontSettings(cachedSettings);
  document.querySelectorAll(messageSelector || '*').forEach((message) => {
    applyFontsToMessage(message, settings);
  });
}

function resolveRuntimeUrl(path) {
  // Prefer the Chrome extension’s runtime URL when available; otherwise, return the provided path.
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    try {
      return chrome.runtime.getURL(path);
    } catch (error) {
      return path;
    }
  }
  return path;
}

function buildFontSettings(settings = cachedSettings) {
  const englishKey = settings.fontEnglish || DEFAULT_SETTINGS.fontEnglish;
  const englishFont =
    FONT_STACKS.english[englishKey] || FONT_STACKS.english[DEFAULT_SETTINGS.fontEnglish];
  const fontSettings = { english: englishFont };
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const defaultKey = DEFAULT_SETTINGS[lang.settingsKey];
    const langKey = settings[lang.settingsKey] || defaultKey;
    const stackMap = FONT_STACKS[lang.id] || {};
    const stack =
      stackMap[langKey] || (defaultKey ? stackMap[defaultKey] : undefined);
    if (stack) {
      fontSettings[lang.id] = stack;
    }
  });
  return fontSettings;
}

function applyRootFontVariables(fontSettings) {
  if (!root) {
    return;
  }
  if (fontSettings.english) {
    root.style.setProperty('--chatgpt-font-english', fontSettings.english);
  } else {
    root.style.removeProperty('--chatgpt-font-english');
  }
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const value = fontSettings[lang.id];
    if (value) {
      root.style.setProperty(lang.variable, value);
    } else {
      root.style.removeProperty(lang.variable);
    }
  });
}
