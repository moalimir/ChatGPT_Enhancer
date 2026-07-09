/**
 * Primary controller for the popup UI, handling initialization and global event delegation.
 */
import { DEFAULT_SETTINGS } from '../common/config.js';
import { loadSettings, saveSettings } from '../common/storage.js';
import { PROMPTS_STORAGE_KEY, PROMPTS_REVISION_KEY } from './prompts/manager.js';
import { createPromptController } from './prompts/controller.js';
import { PROMPTS_EMPTY_MESSAGES, EXPORT_ERROR_MESSAGES, POPUP_LABELS, POPUP_COPY } from '../common/i18n.js';
import {
  clearPromptError,
  initPromptUI,
  normalizePromptCollection,
  generatePromptId,
  setAccordionExpanded,
  showPromptError
} from './prompts/ui.js';
import {
  attachSettingsListeners,
  FONT_LANGUAGES,
  normalizeExportFormat,
  normalizeExportScope,
  setActiveFontTab,
  setFontControlsDisabled,
  updateThemeCardAvailability,
  applySettingsToUI
} from './settings.js';
import {
  LANGUAGE_HINT_DEFAULT,
  LANGUAGE_HINT_MESSAGE_TYPE,
  LANGUAGE_DETECTION_MAX_MESSAGES,
  LANGUAGE_DETECTION_MAX_CHARS,
  EXPORT_MESSAGE_TYPE
} from '../common/constants.js';
const STORAGE_THEME_MODE_KEY = 'chatgptEnhancerBaseTheme';
const PROMPT_TEXT_MAX_LENGTH = 8000; // NEW CONSTANT
const {
  defaultPrimary: PROMPTS_EMPTY_DEFAULT_PRIMARY,
  defaultSecondary: PROMPTS_EMPTY_DEFAULT_SECONDARY,
  filteredPrimary: PROMPTS_EMPTY_FILTERED_PRIMARY,
  filteredSecondary: PROMPTS_EMPTY_FILTERED_SECONDARY
} = PROMPTS_EMPTY_MESSAGES;
const { refresh: REFRESH_LABELS, donate: DONATE_LABELS, export: EXPORT_LABELS, prompts: PROMPT_LABELS } =
  POPUP_LABELS;
const CHAT_URL_HOSTS = ['chat.openai.com', 'chatgpt.com'];
const CHAT_URL_DEFAULT = 'https://chat.openai.com/';

const controls = {};
let currentSettings = { ...DEFAULT_SETTINGS };
let isBusy = false;
const currentFontTabRef = { value: FONT_LANGUAGES[0] };
let chatBaseThemeMode = null;
let activePanelView = 'settings';
const promptCopyTimers = new Map();
const promptController = createPromptController({
  controls,
  normalizePromptCollection,
  generatePromptId,
  PROMPT_TEXT_MAX_LENGTH,
  PROMPTS_EMPTY_DEFAULT_PRIMARY,
  PROMPTS_EMPTY_DEFAULT_SECONDARY,
  PROMPTS_EMPTY_FILTERED_PRIMARY,
  PROMPTS_EMPTY_FILTERED_SECONDARY,
  setAccordionExpanded,
  promptSearchQueryRef: { value: '' },
  promptCopyTimers,
  showPromptError: (message) => showPromptError(controls, message),
  clearPromptError: () => clearPromptError(controls),
  setPromptsCountLabel: (count) => {
    if (controls.promptsCountLabel) {
      controls.promptsCountLabel.textContent =
        count === 1 ? PROMPT_LABELS.countSingular : PROMPT_LABELS.countPlural;
    }
  },
  focusPromptHandle: (id) => {
    const handle = controls.promptList?.querySelector(`.prompt-card[data-id="${id}"] .prompt-card__handle`);
    if (handle && typeof handle.focus === 'function') {
      handle.focus();
    }
  }
});
let hasUserSetFontTab = false;
const REFRESH_LABEL_DEFAULT = REFRESH_LABELS.default;
const REFRESH_LABEL_OPEN = REFRESH_LABELS.open;
const REFRESH_LABEL_BUSY = REFRESH_LABELS.busy;
const DONATION_URL = 'https://donito.me/u-qd7d6';
const DONATE_LABEL_DEFAULT = DONATE_LABELS.default;
const DONATE_LABEL_BUSY = DONATE_LABELS.busy;
const EXPORT_LABEL_DEFAULT = EXPORT_LABELS.default;
const EXPORT_LABEL_BUSY = EXPORT_LABELS.busy;
const EXPORT_LABEL_ERROR = EXPORT_LABELS.error;
const EXPORT_LABEL_UNAVAILABLE = EXPORT_LABELS.unavailable;
const EXPORT_ERRORS = EXPORT_ERROR_MESSAGES;
const PIN_BANNER_STORAGE_KEY = 'chatgptEnhancerPinBannerSeen';

document.addEventListener('DOMContentLoaded', () => {
  controls.enableFix = document.getElementById('toggle-enable');
  controls.fixKatex = document.getElementById('toggle-katex');
  controls.fixCode = document.getElementById('toggle-code');
  controls.copyKatex = document.getElementById('toggle-copy');
  controls.exportQuickAction = document.getElementById('toggle-export-quick-action');
  controls.refreshBtn = document.getElementById('refresh-btn');
  controls.donateBtn = document.getElementById('donate-btn');
  controls.themeCards = Array.from(document.querySelectorAll('.theme-card'));
  controls.accordionHeaders = Array.from(document.querySelectorAll('.accordion__header'));
  controls.promptFormAccordionHeader = document.getElementById('prompt-form-accordion-header');
  controls.promptFormSection = document.getElementById('prompt-form-section');
  if (
    controls.promptFormAccordionHeader &&
    !controls.accordionHeaders.includes(controls.promptFormAccordionHeader)
  ) {
    controls.accordionHeaders.push(controls.promptFormAccordionHeader);
  }
  controls.fontToggle = document.getElementById('toggle-fonts');
  controls.fontControl = document.querySelector('.font-control');
  controls.fontTabs = Array.from(document.querySelectorAll('.font-tab'));
  controls.fontOptionLists = Array.from(document.querySelectorAll('.font-options'));
  controls.fontOptions = Array.from(document.querySelectorAll('.font-option'));
  controls.exportFormatRadios = Array.from(document.querySelectorAll('input[name="export-format"]'));
  controls.exportScopeRadios = Array.from(document.querySelectorAll('input[name="export-scope"]'));
  controls.exportBtn = document.getElementById('export-btn');
  controls.helpBtn = document.getElementById('help-btn');
  controls.pinBanner = document.getElementById('pin-banner');
  controls.pinBannerDismiss = document.getElementById('pin-banner-dismiss');
  controls.tabSettings = document.getElementById('panel-tab-settings');
  controls.tabPrompts = document.getElementById('panel-tab-prompts');
  controls.viewSettings = document.getElementById('panel-view-settings');
  controls.viewPrompts = document.getElementById('panel-view-prompts');
  controls.promptsCount = document.getElementById('prompts-count');
  controls.promptsCountLabel = document.querySelector('.prompts-count__label');
  controls.promptForm = document.getElementById('prompt-form');
  controls.promptNameInput = document.getElementById('prompt-name');
  controls.promptTextInput = document.getElementById('prompt-text');
  controls.promptHeaderTitle =
    controls.promptFormAccordionHeader?.querySelector('.panel__section-title') || null;
  controls.promptNameLabel = document.querySelector('label[for="prompt-name"]');
  controls.promptTextLabel = document.querySelector('label[for="prompt-text"]');
  // NEW: Create and insert the character counter
  if (controls.promptTextInput && controls.promptTextInput.parentElement) {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'prompt-form__meta';

    controls.promptCharCount = document.createElement('span');
    controls.promptCharCount.id = 'prompt-char-count';
    controls.promptCharCount.className = 'prompt-form__char-count';

    metaDiv.appendChild(controls.promptCharCount);

    // MODIFICATION: Insert *after* the parent .prompt-form__field, not inside it.
    // This makes it a sibling to the field and the action buttons.
    controls.promptTextInput.parentElement.after(metaDiv);
  }
  controls.promptCancelButton = document.getElementById('prompt-cancel-button');
  controls.promptSubmitButton = document.querySelector('.prompt-form__submit');
  controls.promptList = document.getElementById('prompt-list');
  controls.promptListContainer = document.querySelector('.prompt-list-container');
  controls.promptsEmpty = document.getElementById('prompts-empty');
  controls.promptsEmptyPrimary = document.querySelector('.prompts-empty__primary');
  controls.promptsEmptySecondary = document.querySelector('.prompts-empty__secondary');
  controls.promptError = document.getElementById('prompt-error');
  controls.promptSearch = document.getElementById('prompt-search');
  applyPromptCopy();
  initPinBanner();
  if (controls.promptsEmptyPrimary) {
    controls.promptsEmptyPrimary.textContent = PROMPTS_EMPTY_DEFAULT_PRIMARY;
  }
  if (controls.promptsEmptySecondary) {
    controls.promptsEmptySecondary.textContent = PROMPTS_EMPTY_DEFAULT_SECONDARY;
  }

  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(STORAGE_THEME_MODE_KEY, (stored) => {
      if (chrome.runtime.lastError) {
        return;
      }
      chatBaseThemeMode =
        stored && typeof stored[STORAGE_THEME_MODE_KEY] === 'string'
          ? stored[STORAGE_THEME_MODE_KEY].toLowerCase()
          : null;
      if (chatBaseThemeMode !== 'dark' && chatBaseThemeMode !== 'light') {
        chatBaseThemeMode = null;
      }
      updateThemeCardAvailability(controls, chatBaseThemeMode);
    });
  }

  loadSettings()
    .then((stored) => {
      applySettings(stored);
      requestConversationLanguageHint();
    })
    .catch(() => {
      applySettings({ ...DEFAULT_SETTINGS });
      requestConversationLanguageHint();
    });

  attachSettingsListeners(controls, {
    getSettings: () => currentSettings,
    updateSetting,
    currentFontTabRef,
    currentSettingsRef: { value: currentSettings },
    isBusy: () => isBusy,
    setFontControlsDisabled,
    onUserFontTab: () => {
      hasUserSetFontTab = true;
    }
  });

  controls.refreshBtn.addEventListener('click', handleRefresh);
  controls.donateBtn.addEventListener('click', handleDonate);
  if (controls.exportBtn) {
    controls.exportBtn.addEventListener('click', handleExport);
  }
  if (controls.helpBtn) {
    controls.helpBtn.addEventListener('click', handleHelp);
  }

  controls.accordionHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const targetId = header.dataset.target;
      if (!targetId) {
        return;
      }
      const content = document.getElementById(targetId);
      if (!content) {
        return;
      }
      const expanded = header.getAttribute('aria-expanded') === 'true';
      setAccordionExpanded(header, content, !expanded);
    });
  });

  setActiveFontTab(controls, currentFontTabRef.value, currentFontTabRef);

  initPanelTabs();
  initPromptUI(controls, promptController, {
    promptTextMaxLength: PROMPT_TEXT_MAX_LENGTH,
    setActivePanelView,
    promptFormAccordionHeader: controls.promptFormAccordionHeader,
    promptFormSection: controls.promptFormSection
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (Object.prototype.hasOwnProperty.call(changes, STORAGE_THEME_MODE_KEY)) {
        const nextValue = changes[STORAGE_THEME_MODE_KEY].newValue;
        chatBaseThemeMode =
          typeof nextValue === 'string' ? nextValue.toLowerCase() : null;
        if (chatBaseThemeMode !== 'dark' && chatBaseThemeMode !== 'light') {
          chatBaseThemeMode = null;
        }
        updateThemeCardAvailability(controls, chatBaseThemeMode);
      }
      const promptsChanged =
        Object.prototype.hasOwnProperty.call(changes, PROMPTS_STORAGE_KEY) ||
        Object.prototype.hasOwnProperty.call(changes, PROMPTS_REVISION_KEY);
      if (promptsChanged) {
        promptController.loadPromptsFromStorage();
      }
    }
    if (area === 'sync' || area === 'local') {
      const settingEntries = Object.entries(changes).filter(([key]) =>
        Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
      );
      if (!settingEntries.length) {
        return;
      }
      const next = { ...currentSettings };
      settingEntries.forEach(([key, { newValue }]) => {
        next[key] = newValue;
      });
      applySettings(next);
    }
  });
});

function updateSetting(key, value) {
  const payload = { [key]: value };
  saveSettings(payload).catch((error) => {
    console.error(error);
  });
}

function applySettings(settings) {
  const currentSettingsRef = { value: currentSettings };
  const isBusyRef = { value: isBusy };
  const next = applySettingsToUI(controls, settings, {
    updateSetting,
    currentSettingsRef,
    chatBaseThemeMode,
    isBusyRef,
    currentFontTabRef,
    labels: {
      refresh: REFRESH_LABEL_DEFAULT,
      donate: DONATE_LABEL_DEFAULT
    }
  });
  currentSettings = next;
  isBusy = isBusyRef.value;
}

function handleRefresh() {
  controls.refreshBtn.disabled = true;
  controls.refreshBtn.textContent = REFRESH_LABEL_BUSY;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs.length) {
      controls.refreshBtn.textContent = REFRESH_LABEL_OPEN;
      controls.refreshBtn.disabled = false;
      return;
    }

    const activeTab = tabs[0];
    const url = activeTab.url || '';
    const onChatGPT = isChatGPTUrl(url);

    if (!onChatGPT) {
      chrome.tabs.update(activeTab.id, { url: CHAT_URL_DEFAULT }, () => {
        if (chrome.runtime.lastError) {
          controls.refreshBtn.textContent = REFRESH_LABEL_OPEN;
          controls.refreshBtn.disabled = false;
          return;
        }
        window.setTimeout(() => window.close(), 300);
      });
      return;
    }

    chrome.tabs.reload(activeTab.id, {}, () => {
      if (chrome.runtime.lastError) {
        controls.refreshBtn.textContent = REFRESH_LABEL_OPEN;
        controls.refreshBtn.disabled = false;
        return;
      }
      window.setTimeout(() => window.close(), 300);
    });
  });
}


function requestConversationLanguageHint() {
  if (!chrome?.tabs?.query) {
    applyConversationPersonalization(LANGUAGE_HINT_DEFAULT);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const queryError = chrome.runtime.lastError;
    if (queryError) {
      applyConversationPersonalization(LANGUAGE_HINT_DEFAULT);
      return;
    }
    if (!tabs || !tabs.length) {
      applyConversationPersonalization(LANGUAGE_HINT_DEFAULT);
      return;
    }
    const [activeTab] = tabs;
    if (!activeTab || !isChatGPTUrl(activeTab.url || '')) {
      applyConversationPersonalization(LANGUAGE_HINT_DEFAULT);
      return;
    }
    chrome.tabs.sendMessage(
      activeTab.id,
      {
        type: LANGUAGE_HINT_MESSAGE_TYPE,
        maxMessages: LANGUAGE_DETECTION_MAX_MESSAGES,
        maxChars: LANGUAGE_DETECTION_MAX_CHARS
      },
      (response) => {
        const messageError = chrome.runtime.lastError;
        if (messageError) {
          applyConversationPersonalization(LANGUAGE_HINT_DEFAULT);
          return;
        }
        if (!response || !response.ok || typeof response.language !== 'string') {
          applyConversationPersonalization(LANGUAGE_HINT_DEFAULT);
          return;
        }
        applyConversationPersonalization(response.language);
      }
    );
  });
}

function applyConversationPersonalization(language) {
  const normalized = normalizeLanguageHint(language);
  if (!hasUserSetFontTab && normalized !== currentFontTabRef.value) {
    setActiveFontTab(controls, normalized, currentFontTabRef);
  }
}

function applyPromptCopy() {
  const copy = (POPUP_COPY && POPUP_COPY.prompts) || {};
  if (controls.promptHeaderTitle && copy.addHeader) {
    controls.promptHeaderTitle.textContent = copy.addHeader;
  }
  if (controls.promptNameLabel && copy.titleLabel) {
    controls.promptNameLabel.textContent = copy.titleLabel;
  }
  if (controls.promptNameInput && copy.titlePlaceholder) {
    controls.promptNameInput.placeholder = copy.titlePlaceholder;
  }
  if (controls.promptTextLabel && copy.promptLabel) {
    controls.promptTextLabel.textContent = copy.promptLabel;
  }
  if (controls.promptTextInput && copy.promptPlaceholder) {
    controls.promptTextInput.placeholder = copy.promptPlaceholder;
  }
  if (controls.promptSubmitButton && copy.save) {
    controls.promptSubmitButton.textContent = copy.save;
  }
  if (controls.promptCancelButton && copy.cancel) {
    controls.promptCancelButton.textContent = copy.cancel;
  }
  if (controls.promptSearch) {
    if (copy.searchPlaceholder) {
      controls.promptSearch.placeholder = copy.searchPlaceholder;
    }
    if (copy.searchAriaLabel) {
      controls.promptSearch.setAttribute('aria-label', copy.searchAriaLabel);
    }
  }
}

function initPinBanner() {
  if (!controls.pinBanner) {
    return;
  }

  if (controls.pinBannerDismiss) {
    controls.pinBannerDismiss.addEventListener('click', () => {
      hidePinBanner();
      markPinBannerSeen();
    });
  }

  if (!chrome?.storage?.local) {
    showPinBanner();
    return;
  }

  chrome.storage.local.get({ [PIN_BANNER_STORAGE_KEY]: false }, (stored) => {
    if (chrome.runtime?.lastError) {
      showPinBanner();
      return;
    }
    const hasSeen = Boolean(stored?.[PIN_BANNER_STORAGE_KEY]);
    if (hasSeen) {
      return;
    }
    resolvePinBannerVisibility();
  });
}

function resolvePinBannerVisibility() {
  if (chrome?.action?.getUserSettings) {
    chrome.action.getUserSettings((settings) => {
      if (chrome.runtime?.lastError) {
        showPinBanner();
        return;
      }
      if (settings && settings.isOnToolbar) {
        markPinBannerSeen();
        return;
      }
      showPinBanner();
    });
    return;
  }
  showPinBanner();
}

function showPinBanner() {
  if (!controls.pinBanner) {
    return;
  }
  controls.pinBanner.hidden = false;
  markPinBannerSeen();
}

function hidePinBanner() {
  if (!controls.pinBanner) {
    return;
  }
  controls.pinBanner.hidden = true;
}

function markPinBannerSeen() {
  if (!chrome?.storage?.local) {
    return;
  }
  chrome.storage.local.set({ [PIN_BANNER_STORAGE_KEY]: true }, () => {});
}

function normalizeLanguageHint(language) {
  return language === 'persian' ? 'persian' : LANGUAGE_HINT_DEFAULT;
}

function handleDonate() {
  controls.donateBtn.disabled = true;
  controls.donateBtn.textContent = DONATE_LABEL_BUSY;

  chrome.tabs.create({ url: DONATION_URL }, () => {
    if (chrome.runtime.lastError) {
      controls.donateBtn.disabled = false;
      controls.donateBtn.textContent = DONATE_LABEL_DEFAULT;
      return;
    }

    window.setTimeout(() => window.close(), 300);
  });
}

function handleExport() {
  if (!controls.exportBtn) {
    return;
  }
  clearExportErrorTooltip();
  setExportBusyState(EXPORT_LABEL_BUSY);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabQueryError = chrome.runtime.lastError;
    if (tabQueryError || !tabs.length) {
      const message =
        buildExportErrorMessage(null, tabQueryError) || EXPORT_ERRORS.accessActiveTab;
      reportExportError(message, { runtimeError: tabQueryError });
      setExportErrorTooltip(message);
      setExportIdleState(EXPORT_LABEL_ERROR);
      resetExportLabelSoon();
      return;
    }

    const activeTab = tabs[0];
    if (!isChatGPTUrl(activeTab.url || '')) {
      const message = EXPORT_ERRORS.mustOpenChat;
      reportExportError(message, { url: activeTab.url });
      setExportErrorTooltip(message);
      setExportIdleState(EXPORT_LABEL_UNAVAILABLE);
      resetExportLabelSoon();
      return;
    }

    chrome.tabs.sendMessage(
      activeTab.id,
      {
        type: EXPORT_MESSAGE_TYPE,
        format: getSelectedExportFormat(),
        scope: getSelectedExportScope()
      },
      (response) => {
        const messageError = chrome.runtime.lastError;
        if (messageError || !response || !response.ok) {
          const { message, originalMessage } = buildHandledExportError({
            response,
            runtimeError: messageError
          });
          reportExportError(message, {
            runtimeError: messageError,
            response,
            originalMessage
          });
          setExportErrorTooltip(message);
          setExportIdleState(EXPORT_LABEL_ERROR);
          resetExportLabelSoon();
          return;
        }
        clearExportErrorTooltip();
        setExportIdleState(EXPORT_LABEL_DEFAULT);
        window.setTimeout(() => window.close(), 400);
      }
    );
  });
}

function setExportBusyState(label) {
  controls.exportBtn.disabled = true;
  controls.exportBtn.textContent = label;
}

function setExportIdleState(label) {
  controls.exportBtn.disabled = false;
  controls.exportBtn.textContent = label;
}

function resetExportLabelSoon() {
  window.setTimeout(() => {
    if (controls.exportBtn && controls.exportBtn.textContent !== EXPORT_LABEL_BUSY) {
      controls.exportBtn.textContent = EXPORT_LABEL_DEFAULT;
    }
  }, 2000);
}

function getSelectedExportFormat() {
  const checked = controls.exportFormatRadios.find((input) => input.checked);
  return normalizeExportFormat(checked ? checked.value : DEFAULT_SETTINGS.exportFormat);
}

function getSelectedExportScope() {
  const checked = controls.exportScopeRadios?.find((input) => input.checked);
  return normalizeExportScope(checked ? checked.value : DEFAULT_SETTINGS.exportScope);
}

function isChatGPTUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') {
      return false;
    }
    const normalizedHost = hostname.toLowerCase().replace(/\.+$/, '');
    return CHAT_URL_HOSTS.includes(normalizedHost);
  } catch {
    return false;
  }
}

function buildExportErrorMessage(response, runtimeError) {
  if (runtimeError) {
    return runtimeError.message || safeStringify(runtimeError);
  }

  if (!response) {
    return EXPORT_ERRORS.noResponse;
  }

  const { error } = response;
  if (!error) {
    return EXPORT_ERRORS.unknownFailure;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error.message === 'string') {
    return error.message;
  }

  return safeStringify(error);
}

function buildHandledExportError({ response, runtimeError }) {
  const baseMessage = buildExportErrorMessage(response, runtimeError);
  if (!runtimeError || !runtimeError.message) {
    return { message: baseMessage, originalMessage: baseMessage };
  }

  if (runtimeError.message.includes('Receiving end does not exist')) {
    const guidance = EXPORT_ERRORS.reloadGuidance;
    return {
      message: guidance,
      originalMessage: baseMessage
    };
  }

  return { message: baseMessage, originalMessage: baseMessage };
}

function reportExportError(message, context) {
  // console.error('[GPT Enhancer] Export failed:', message);
  if (context) {
    const normalized = normalizeErrorContext(context);
    if (normalized !== undefined) {
      // console.error('[GPT Enhancer] Export details:', normalized);
    }
  }
}

function setExportErrorTooltip(message) {
  if (controls.exportBtn) {
    controls.exportBtn.title = message;
  }
}

function clearExportErrorTooltip() {
  if (controls.exportBtn) {
    controls.exportBtn.removeAttribute('title');
  }
}

function normalizeErrorContext(value) {
  return normalizeErrorValue(value, new WeakSet());
}

function normalizeErrorValue(value, seen) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeErrorValue(item, seen));
  }

  if (typeof Node !== 'undefined' && value instanceof Node) {
    return `<${value.nodeName?.toLowerCase() || 'node'}>`;
  }

  const result = {};

  if (typeof value.message === 'string' && !('message' in result)) {
    result.message = value.message;
  }
  if (typeof value.code !== 'undefined' && !('code' in result)) {
    result.code = value.code;
  }
  if (typeof value.stack === 'string' && !('stack' in result)) {
    result.stack = value.stack;
  }

  Object.keys(value).forEach((key) => {
    const entry = value[key];
    if (typeof entry === 'function') {
      return;
    }
    result[key] = normalizeErrorValue(entry, seen);
  });

  const keys = Object.keys(result);
  if (!keys.length) {
    return '[Unserializable object]';
  }

  return result;
}

function initPanelTabs() {
  if (!controls.tabSettings || !controls.tabPrompts || !controls.viewSettings || !controls.viewPrompts) {
    return;
  }

  controls.tabSettings.addEventListener('click', () => setActivePanelView('settings'));
  controls.tabPrompts.addEventListener('click', () => setActivePanelView('prompts'));

  setActivePanelView(activePanelView);
}

function setActivePanelView(view) {
  if (view !== 'settings' && view !== 'prompts') {
    return;
  }
  const hasChanged = activePanelView !== view;
  const mapping = {
    settings: { tab: controls.tabSettings, panel: controls.viewSettings },
    prompts: { tab: controls.tabPrompts, panel: controls.viewPrompts }
  };

  Object.entries(mapping).forEach(([key, entry]) => {
    const isActive = key === view;
    const tab = entry.tab;
    const panel = entry.panel;
    if (tab) {
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    }
    if (panel) {
      panel.classList.toggle('is-active', isActive);
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', 'true');
      }
    }
  });

  activePanelView = view;
  if (view === 'prompts' && controls.promptNameInput && hasChanged) {
    controls.promptNameInput.focus();
  }
}

function handleHelp() {
  // Open help.html in a new tab
  chrome.tabs.create({ url: chrome.runtime.getURL('help/index.html') }, () => {
    if (chrome.runtime.lastError) {
      console.error('[GPT Enhancer] Failed to open help page', chrome.runtime.lastError);
    }
  });
}


function safeStringify(value) {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return value.toString();
    }
  }
  return String(value);
}
