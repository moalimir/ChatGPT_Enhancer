/**
 * Manages UI state and persistence for extension settings.
 */
import { DEFAULT_SETTINGS, THEME_COMPATIBILITY } from '../common/config.js';

export const FONT_DEFAULTS = {
  english: 'inter',
  persian: 'vazirmatn'
};

export const FONT_LANGUAGES = ['english', 'persian'];

export function normalizeThemeAlias(theme) {
  if (typeof theme !== 'string') {
    return theme;
  }
  const normalized = theme.trim().toLowerCase();
  return normalized === 'daybreak' ? 'skylight' : normalized;
}

export function normalizeExportFormat(format) {
  if (!format || typeof format !== 'string') {
    return DEFAULT_SETTINGS.exportFormat;
  }
  const normalized = format.trim().toLowerCase();
  if (normalized === 'md') {
    return 'markdown';
  }
  if (['pdf', 'docx', 'markdown', 'txt'].includes(normalized)) {
    return normalized;
  }
  return DEFAULT_SETTINGS.exportFormat;
}

export function normalizeExportScope(scope) {
  if (!scope || typeof scope !== 'string') {
    return DEFAULT_SETTINGS.exportScope;
  }
  const normalized = scope.trim().toLowerCase();
  if (normalized === 'assistant' || normalized === 'all') {
    return normalized;
  }
  return DEFAULT_SETTINGS.exportScope;
}

export function setActiveTheme(controls, theme) {
  const normalized = normalizeThemeAlias(theme);
  if (!controls.themeCards) {
    return;
  }
  controls.themeCards.forEach((card) => {
    const isActive = card.dataset.theme === normalized;
    card.classList.toggle('is-active', isActive);
    card.setAttribute('aria-pressed', String(isActive));
  });
}

export function setThemeCardsDisabled(controls, disabled) {
  if (!controls.themeCards) {
    return;
  }
  controls.themeCards.forEach((card) => {
    if (!card) {
      return;
    }
    card.dataset.dependentsDisabled = String(Boolean(disabled));
  });
}

export function updateThemeCardAvailability(controls, chatBaseThemeMode) {
  if (!controls.themeCards) {
    return;
  }
  controls.themeCards.forEach((card) => {
    if (!card) {
      return;
    }
    const dependentsDisabled = card.dataset.dependentsDisabled === 'true';
    const { theme } = card.dataset;
    const requiredMode = theme ? THEME_COMPATIBILITY[theme] : null;
    const incompatibilityKnown = Boolean(requiredMode && chatBaseThemeMode);
    const incompatible =
      incompatibilityKnown && requiredMode && chatBaseThemeMode && requiredMode !== chatBaseThemeMode;
    card.classList.toggle('theme-card--forbidden', incompatible);
    const disableForDependents = dependentsDisabled;
    const disableForIncompatibility = incompatible;
    const finalDisabled = disableForDependents || disableForIncompatibility;
    card.disabled = finalDisabled;
    card.classList.toggle('is-disabled', disableForDependents);
    if (finalDisabled) {
      card.setAttribute('aria-disabled', 'true');
    } else {
      card.removeAttribute('aria-disabled');
    }
    if (incompatible) {
      const message = requiredMode === 'dark' ? 'For Dark Theme' : 'For Light Theme';
      card.dataset.forbiddenTooltip = message;
      card.title = message;
    } else if (card.dataset.forbiddenTooltip) {
      card.removeAttribute('title');
      delete card.dataset.forbiddenTooltip;
    }
  });
}

export function setActiveFontTab(controls, language, currentFontTabRef) {
  const selectedLang = FONT_LANGUAGES.includes(language) ? language : FONT_LANGUAGES[0];
  currentFontTabRef.value = selectedLang;
  if (controls.fontTabs) {
    controls.fontTabs.forEach((tab) => {
      if (!tab) {
        return;
      }
      const { lang } = tab.dataset;
      const isActive = lang === selectedLang;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        tab.removeAttribute('tabindex');
      } else {
        tab.setAttribute('tabindex', '-1');
      }
    });
  }
  if (controls.fontOptionLists) {
    controls.fontOptionLists.forEach((group) => {
      if (!group) {
        return;
      }
      const isActive = group.dataset.lang === selectedLang;
      group.classList.toggle('is-active', isActive);
      if (isActive) {
        group.removeAttribute('hidden');
      } else {
        group.setAttribute('hidden', 'true');
      }
    });
  }
}

export function updateFontOptionSelection(controls, language, value, currentSettings, updateSettingFn) {
  if (!controls.fontOptions) {
    return;
  }
  const options = controls.fontOptions.filter(
    (option) => option && option.dataset.lang === language
  );
  if (!options.length) {
    return;
  }
  const hasExactMatch =
    typeof value === 'string' && options.some((option) => option.dataset.value === value);
  const defaultOption = options.find((option) => option.dataset.value === FONT_DEFAULTS[language]);
  const fallback =
    (defaultOption && defaultOption.dataset.value) ||
    (options[0] ? options[0].dataset.value : null);
  const selectedValue = hasExactMatch ? value : fallback;
  const settingsKey = language === 'persian' ? 'fontPersian' : 'fontEnglish';
  if (currentSettings[settingsKey] !== selectedValue) {
    currentSettings[settingsKey] = selectedValue;
    if (!hasExactMatch && selectedValue) {
      updateSettingFn(settingsKey, selectedValue);
    }
  }
  options.forEach((option) => {
    const isActive = option.dataset.value === selectedValue;
    option.classList.toggle('is-active', isActive);
    option.setAttribute('aria-pressed', String(isActive));
  });
}

export function setFontControlsDisabled(controls, disabled) {
  if (controls.fontControl) {
    controls.fontControl.classList.toggle('font-control--disabled', disabled);
  }
  controls.fontTabs.forEach((tab) => {
    if (!tab) {
      return;
    }
    tab.disabled = disabled;
    if (disabled) {
      tab.setAttribute('aria-disabled', 'true');
    } else {
      tab.removeAttribute('aria-disabled');
    }
  });
  controls.fontOptions.forEach((option) => {
    if (!option) {
      return;
    }
    option.disabled = disabled;
    if (disabled) {
      option.setAttribute('aria-disabled', 'true');
    } else {
      option.removeAttribute('aria-disabled');
    }
  });
}

export function attachSettingsListeners(controls, deps) {
  const { getSettings, updateSetting, currentFontTabRef, currentSettingsRef } = deps;

  const getCurrentSettings = () => getSettings?.() || currentSettingsRef.value || DEFAULT_SETTINGS;

  Object.entries({
    enableFix: controls.enableFix,
    fixKatex: controls.fixKatex,
    fixCode: controls.fixCode,
    copyKatex: controls.copyKatex,
    exportQuickAction: controls.exportQuickAction
  }).forEach(([key, input]) => {
    if (!input) {
      return;
    }
    input.addEventListener('change', () => {
      if (deps.isBusy?.()) {
        return;
      }
      updateSetting(key, input.checked);
    });
  });

  if (controls.fontToggle) {
    controls.fontToggle.addEventListener('change', () => {
      const settings = getCurrentSettings();
      if (deps.isBusy?.()) {
        return;
      }
      const enabled = controls.fontToggle.checked && settings.enableFix;
      const toggledOn = enabled;
      if (!enabled) {
        controls.fontToggle.checked = false;
      }
      deps.setFontControlsDisabled?.(controls, !toggledOn);
      if (enabled !== settings.fontsEnabled) {
        updateSetting('fontsEnabled', enabled);
      }
    });
  }

  controls.fontTabs?.forEach((tab) => {
    tab.addEventListener('click', () => {
      const { lang } = tab.dataset;
      if (!lang || lang === currentFontTabRef.value) {
        return;
      }
      deps.onUserFontTab?.();
      setActiveFontTab(controls, lang, currentFontTabRef);
    });
  });

  controls.fontOptions?.forEach((option) => {
    option.addEventListener('click', () => {
      if (deps.isBusy?.()) {
        return;
      }
      if (controls.fontToggle && !controls.fontToggle.checked) {
        return;
      }
      const { lang, value } = option.dataset;
      if (!lang || !value) {
        return;
      }
      const targetKey = lang === 'persian' ? 'fontPersian' : 'fontEnglish';
      const settings = getCurrentSettings();
      if (settings[targetKey] === value) {
        return;
      }
      updateSetting(targetKey, value);
    });
  });

  controls.exportFormatRadios?.forEach((input) => {
    input.addEventListener('change', () => {
      if (deps.isBusy?.()) {
        return;
      }
      updateSetting('exportFormat', normalizeExportFormat(input.value));
    });
  });

  controls.exportScopeRadios?.forEach((input) => {
    input.addEventListener('change', () => {
      if (deps.isBusy?.()) {
        return;
      }
      updateSetting('exportScope', normalizeExportScope(input.value));
    });
  });

  controls.themeCards?.forEach((card) => {
    card.addEventListener('click', () => {
      const settings = getCurrentSettings();
      if (card.disabled || !settings.enableFix) {
        return;
      }
      const { theme } = card.dataset;
      if (!theme || theme === settings.theme) {
        return;
      }
      setActiveTheme(controls, theme);
      updateSetting('theme', theme);
    });
  });
}

export function applySettingsToUI(controls, settings, deps) {
  const {
    updateSetting,
    currentSettingsRef,
    chatBaseThemeMode,
    isBusyRef,
    currentFontTabRef,
    labels
  } = deps || {};
  const busyRef = isBusyRef || { value: false };
  busyRef.value = true;

  let nextSettings = settings || { ...DEFAULT_SETTINGS };

  if (nextSettings && typeof nextSettings.theme === 'string') {
    const normalizedTheme = normalizeThemeAlias(nextSettings.theme);
    if (normalizedTheme !== nextSettings.theme) {
      nextSettings = { ...nextSettings, theme: normalizedTheme };
      updateSetting?.('theme', normalizedTheme);
    }
  }
  if (nextSettings && nextSettings.exportFormat) {
    const normalizedExportFormat = normalizeExportFormat(nextSettings.exportFormat);
    if (normalizedExportFormat !== nextSettings.exportFormat) {
      nextSettings = { ...nextSettings, exportFormat: normalizedExportFormat };
      updateSetting?.('exportFormat', normalizedExportFormat);
    }
  }
  if (nextSettings && nextSettings.exportScope) {
    const normalizedExportScope = normalizeExportScope(nextSettings.exportScope);
    if (normalizedExportScope !== nextSettings.exportScope) {
      nextSettings = { ...nextSettings, exportScope: normalizedExportScope };
      updateSetting?.('exportScope', normalizedExportScope);
    }
  }

  if (currentSettingsRef) {
    currentSettingsRef.value = nextSettings;
  }

  if (controls.enableFix) {
    controls.enableFix.checked = nextSettings.enableFix;
  }
  if (controls.fixKatex) {
    controls.fixKatex.checked = nextSettings.fixKatex;
  }
  if (controls.fixCode) {
    controls.fixCode.checked = nextSettings.fixCode;
  }
  if (controls.copyKatex) {
    controls.copyKatex.checked = nextSettings.copyKatex;
  }
  if (controls.exportQuickAction) {
    controls.exportQuickAction.checked = nextSettings.exportQuickAction;
  }
  if (controls.fontToggle) {
    controls.fontToggle.checked = nextSettings.fontsEnabled;
    controls.fontToggle.disabled = !nextSettings.enableFix;
    const toggle = controls.fontToggle.closest('.toggle');
    if (toggle) {
      toggle.classList.toggle('toggle--disabled', !nextSettings.enableFix);
    }
  }

  updateFontOptionSelection(controls, 'english', nextSettings.fontEnglish, nextSettings, updateSetting);
  updateFontOptionSelection(controls, 'persian', nextSettings.fontPersian, nextSettings, updateSetting);
  setActiveFontTab(controls, currentFontTabRef?.value || FONT_LANGUAGES[0], currentFontTabRef);
  // Disable font controls when the extension is off or fonts are toggled off.
  setFontControlsDisabled(controls, !(nextSettings.enableFix && nextSettings.fontsEnabled));

  const targetFormat = normalizeExportFormat(nextSettings.exportFormat || DEFAULT_SETTINGS.exportFormat);
  controls.exportFormatRadios?.forEach((input) => {
    input.checked = input.value === targetFormat;
  });
  const targetScope = normalizeExportScope(nextSettings.exportScope || DEFAULT_SETTINGS.exportScope);
  controls.exportScopeRadios?.forEach((input) => {
    input.checked = input.value === targetScope;
  });

  const dependentsDisabled = !nextSettings.enableFix;
  [
    controls.fixKatex,
    controls.fixCode,
    controls.copyKatex,
    controls.exportQuickAction
  ].forEach((input) => {
    if (!input) {
      return;
    }
    input.disabled = dependentsDisabled;
    const toggle = input.closest('.toggle');
    if (toggle) {
      toggle.classList.toggle('toggle--disabled', dependentsDisabled);
    }
  });

  if (controls.refreshBtn) {
    controls.refreshBtn.disabled = false;
    controls.refreshBtn.textContent = labels?.refresh || 'Refresh ChatGPT';
  }
  if (controls.donateBtn) {
    controls.donateBtn.disabled = false;
    controls.donateBtn.textContent = labels?.donate || 'Support';
  }

  setActiveTheme(controls, nextSettings.theme);
  setThemeCardsDisabled(controls, dependentsDisabled);
  updateThemeCardAvailability(controls, chatBaseThemeMode);

  busyRef.value = false;
  return nextSettings;
}
