/**
 * Floating export quick action panel with draggable positioning.
 */

import { DEFAULT_SETTINGS } from '../../common/config.js';
import { saveSettings } from '../../common/storage.js';

const EXPORT_REQUEST_EVENT = 'GPT_ENHANCER_EXPORT_REQUEST';
const EXPORT_PROGRESS_EVENT = 'GPT_ENHANCER_EXPORT_PROGRESS';
const QUICK_ACTION_CLASS = 'gpt-export-quick-action';
const QUICK_ACTION_MIN_GAP = 12;
const QUICK_ACTION_DEFAULT_GAP = 20;
const QUICK_ACTION_EXPORT_BUSY_LABEL = 'Exporting...';
const QUICK_ACTION_EXPORT_IDLE_LABEL = 'Export';
const BUSY_STATUSES = new Set(['starting', 'loading-content', 'normalizing', 'fonts', 'images', 'generating']);
const COLLAPSED_STORAGE_KEY = 'gptEnhancerExportQuickActionCollapsed';
const COMPOSER_SELECTORS = [
  'div.ProseMirror[contenteditable="true"][role="textbox"]',
  '[data-composer-markdown][contenteditable="true"][role="textbox"]',
  'textarea[data-testid="prompt-textarea"]',
  'textarea[placeholder*="Ask"]',
  'main textarea',
  'textarea'
];

const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'Word' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'txt', label: 'Text' }
];

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All messages' },
  { value: 'assistant', label: 'Assistant only' }
];

const state = {
  panel: null,
  header: null,
  collapseButton: null,
  exportButton: null,
  formatInputs: [],
  scopeInputs: [],
  listeners: null,
  isCollapsed: false
};

let currentSettings = { ...DEFAULT_SETTINGS };
let progressListenerAttached = false;
let resizeListenerAttached = false;
let collapsedPreference = null;
let positionRafId = null;
let bodyObserver = null;
let drag = null;
let suppressCollapseClick = false;
let snapTimer = null;
let positionWrite = Promise.resolve();
let latestLocalPosition = null;

export const QuickActionManager = {
  init(settings) {
    currentSettings = { ...currentSettings, ...(settings || {}) };
    sync(currentSettings);
    attachResizeListener();
  },
  update(changes) {
    if (!changes) {
      return;
    }
    const next = { ...currentSettings };
    ['enableFix', 'exportQuickAction', 'exportQuickActionPosition', 'exportFormat', 'exportScope'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(changes, key) && changes[key]) {
        const value = changes[key].newValue;
        if (key === 'exportQuickActionPosition' && latestLocalPosition) {
          if (value?.side !== latestLocalPosition.side || value?.y !== latestLocalPosition.y) return;
          latestLocalPosition = null;
        }
        next[key] = value;
      }
    });
    currentSettings = next;
    sync(next);
  },
  isActive,
  sync
};

function isActive(settings = currentSettings) {
  return Boolean(settings?.enableFix && settings.exportQuickAction);
}

function sync(settings = currentSettings) {
  if (!isActive(settings)) {
    teardown();
    return;
  }
  ensurePanel();
  applyCollapsedState(getCollapsedPreference());
  applySelections(settings);
  schedulePositionUpdate();
}

function ensurePanel() {
  if (state.panel && state.panel.isConnected) {
    return;
  }
  if (!document.body) {
    return;
  }

  const panel = document.createElement('aside');
  panel.className = QUICK_ACTION_CLASS;
  panel.setAttribute('role', 'complementary');
  panel.setAttribute('aria-label', 'Quick export');

  const header = document.createElement('div');
  header.className = 'gpt-export-qa-header';
  header.title = 'Drag to move; use arrow keys to change edge or height';
  header.tabIndex = 0;
  header.setAttribute('aria-label', 'Move quick export with arrow keys');

  const title = document.createElement('span');
  title.className = 'gpt-export-qa-title';
  title.textContent = 'Quick export';

  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.className = 'gpt-export-qa-collapse';
  collapseButton.setAttribute('aria-label', 'Collapse quick export');
  collapseButton.textContent = '-';
  collapseButton.addEventListener('click', handleCollapseToggle);

  header.appendChild(title);
  header.appendChild(collapseButton);
  header.addEventListener('pointerdown', startDrag);
  header.addEventListener('keydown', handlePositionKeys);
  panel.appendChild(header);

  const formatGroup = buildOptionGroup('Format', 'gpt-export-qa-format', FORMAT_OPTIONS, handleFormatChange);
  const scopeGroup = buildOptionGroup('Content', 'gpt-export-qa-scope', SCOPE_OPTIONS, handleScopeChange);

  panel.appendChild(formatGroup.container);
  panel.appendChild(scopeGroup.container);

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'gpt-export-qa-button';
  exportButton.textContent = QUICK_ACTION_EXPORT_IDLE_LABEL;
  exportButton.addEventListener('click', handleExportClick);

  panel.appendChild(exportButton);
  document.body.appendChild(panel);

  state.panel = panel;
  state.header = header;
  state.collapseButton = collapseButton;
  state.exportButton = exportButton;
  state.formatInputs = formatGroup.inputs;
  state.scopeInputs = scopeGroup.inputs;
  state.listeners = {};

  if (!progressListenerAttached) {
    document.addEventListener(EXPORT_PROGRESS_EVENT, handleExportProgress);
    progressListenerAttached = true;
  }
}

function teardown() {
  stopDrag();
  if (snapTimer) clearTimeout(snapTimer);
  if (state.collapseButton) {
    state.collapseButton.removeEventListener('click', handleCollapseToggle);
  }
  state.header?.removeEventListener('pointerdown', startDrag);
  state.header?.removeEventListener('keydown', handlePositionKeys);
  if (state.panel && state.panel.parentNode) {
    state.panel.parentNode.removeChild(state.panel);
  }
  state.panel = null;
  state.header = null;
  state.collapseButton = null;
  state.exportButton = null;
  state.formatInputs = [];
  state.scopeInputs = [];
  state.listeners = null;
  state.isCollapsed = false;
  disconnectBodyObserver();
  clearScheduledPositionUpdate();
}

function buildOptionGroup(titleText, groupName, options, onChange) {
  const container = document.createElement('div');
  container.className = 'gpt-export-qa-group';

  const title = document.createElement('span');
  title.className = 'gpt-export-qa-group-title';
  title.textContent = titleText;
  container.appendChild(title);

  const list = document.createElement('div');
  list.className = 'gpt-export-qa-options';

  const inputs = options.map((option) => {
    const label = document.createElement('label');
    label.className = 'gpt-export-qa-option';

    const input = document.createElement('input');
    input.className = 'gpt-export-qa-input';
    input.type = 'radio';
    input.name = groupName;
    input.value = option.value;
    input.addEventListener('change', onChange);

    const span = document.createElement('span');
    span.className = 'gpt-export-qa-label';
    span.textContent = option.label;

    label.appendChild(input);
    label.appendChild(span);
    list.appendChild(label);

    return input;
  });

  container.appendChild(list);
  return { container, inputs };
}

function applySelections(settings) {
  const format = normalizeExportFormat(settings?.exportFormat);
  const scope = normalizeExportScope(settings?.exportScope);
  state.formatInputs.forEach((input) => {
    input.checked = input.value === format;
  });
  state.scopeInputs.forEach((input) => {
    input.checked = input.value === scope;
  });
}

function handleFormatChange(event) {
  const next = normalizeExportFormat(event?.target?.value);
  if (!next || next === currentSettings.exportFormat) {
    return;
  }
  currentSettings.exportFormat = next;
  void saveSettings({ exportFormat: next }).catch(() => {});
}

function handleScopeChange(event) {
  const next = normalizeExportScope(event?.target?.value);
  if (!next || next === currentSettings.exportScope) {
    return;
  }
  currentSettings.exportScope = next;
  void saveSettings({ exportScope: next }).catch(() => {});
}

function handleExportClick() {
  if (!state.panel) {
    return;
  }
  const format = normalizeExportFormat(currentSettings.exportFormat);
  const scope = normalizeExportScope(currentSettings.exportScope);
  const event = new CustomEvent(EXPORT_REQUEST_EVENT, { detail: { format, scope } });
  document.dispatchEvent(event);
}

function handleExportProgress(event) {
  if (!state.exportButton) {
    return;
  }
  const status = event?.detail?.status || '';
  if (BUSY_STATUSES.has(status)) {
    setBusyState(true);
    return;
  }
  if (status === 'done' || status === 'cleanup' || status === 'error' || status === 'aborted') {
    setBusyState(false);
  }
}

function setBusyState(isBusy) {
  if (!state.exportButton) {
    return;
  }
  state.exportButton.disabled = isBusy;
  state.exportButton.textContent = isBusy ? QUICK_ACTION_EXPORT_BUSY_LABEL : QUICK_ACTION_EXPORT_IDLE_LABEL;
  if (state.panel) {
    state.panel.classList.toggle('is-busy', isBusy);
  }
}

function handleCollapseToggle() {
  if (suppressCollapseClick) {
    suppressCollapseClick = false;
    return;
  }
  const nextCollapsed = !state.isCollapsed;
  applyCollapsedState(nextCollapsed);
  persistCollapsedPreference(nextCollapsed);
  schedulePositionUpdate();
}

function applyCollapsedState(collapsed) {
  if (!state.panel || !state.collapseButton) {
    return;
  }
  state.isCollapsed = Boolean(collapsed);
  state.panel.classList.toggle('is-collapsed', state.isCollapsed);
  state.collapseButton.setAttribute(
    'aria-label',
    state.isCollapsed ? 'Expand quick export' : 'Collapse quick export'
  );
  state.collapseButton.setAttribute('aria-pressed', String(state.isCollapsed));
  state.collapseButton.textContent = state.isCollapsed ? 'Quick Export' : '-';
}

function getCollapsedPreference() {
  if (collapsedPreference !== null) {
    return collapsedPreference;
  }
  let raw = null;
  if (typeof window !== 'undefined') {
    try {
      raw = window.localStorage?.getItem(COLLAPSED_STORAGE_KEY) || null;
    } catch (error) {
      raw = null;
    }
  }
  collapsedPreference = raw === 'true';
  return collapsedPreference;
}

function persistCollapsedPreference(next) {
  collapsedPreference = Boolean(next);
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    if (collapsedPreference) {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(COLLAPSED_STORAGE_KEY);
    }
  } catch (error) {
    /* ignore */
  }
}

function attachResizeListener() {
  if (resizeListenerAttached || typeof window === 'undefined') {
    return;
  }
  resizeListenerAttached = true;
  window.addEventListener('resize', schedulePositionUpdate);
}

function clearScheduledPositionUpdate() {
  if (!positionRafId) {
    return;
  }
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(positionRafId);
  } else {
    window.clearTimeout(positionRafId);
  }
  positionRafId = null;
}

function schedulePositionUpdate() {
  if (positionRafId) {
    return;
  }
  const schedule =
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  positionRafId = schedule(() => {
    positionRafId = null;
    updatePanelPosition();
  });
}

function updatePanelPosition() {
  if (!state.panel || drag) {
    return;
  }
  const dock = currentSettings.exportQuickActionPosition;
  if (dock && (dock.side === 'left' || dock.side === 'right') && Number.isFinite(dock.y)) {
    disconnectBodyObserver();
    positionDocked(dock);
    return;
  }
  const anchor = resolveComposerAnchor();
  const panelRect = state.panel.getBoundingClientRect();
  if (!anchor) {
    ensureBodyObserver();
    positionFallback(panelRect);
    return;
  }
  disconnectBodyObserver();
  const anchorRect = anchor.getBoundingClientRect();
  if (!isUsableRect(anchorRect)) {
    positionFallback(panelRect);
    return;
  }
  const leftTarget = window.innerWidth - panelRect.width - QUICK_ACTION_MIN_GAP;
  const topTarget = anchorRect.top + (anchorRect.height - panelRect.height) / 2;
  const left = clamp(leftTarget, QUICK_ACTION_MIN_GAP, window.innerWidth - panelRect.width - QUICK_ACTION_MIN_GAP);
  const top = clamp(topTarget, QUICK_ACTION_MIN_GAP, window.innerHeight - panelRect.height - QUICK_ACTION_MIN_GAP);
  setPanelPosition(left, top);
}

function positionDocked(dock) {
  const rect = state.panel.getBoundingClientRect();
  const travel = Math.max(0, window.innerHeight - rect.height - 2 * QUICK_ACTION_MIN_GAP);
  const left = dock.side === 'left' ? QUICK_ACTION_MIN_GAP : window.innerWidth - rect.width - QUICK_ACTION_MIN_GAP;
  setPanelPosition(
    clamp(left, QUICK_ACTION_MIN_GAP, window.innerWidth - rect.width - QUICK_ACTION_MIN_GAP),
    QUICK_ACTION_MIN_GAP + clamp(dock.y, 0, 1) * travel
  );
}

function startDrag(event) {
  if (event.button !== 0 || !state.panel || (!state.isCollapsed && event.target === state.collapseButton)) return;
  const rect = state.panel.getBoundingClientRect();
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('blur', cancelDrag);
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId || !state.panel) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  try { state.header?.setPointerCapture?.(event.pointerId); } catch { /* pointer already ended */ }
  state.panel.classList.add('is-dragging');
  const rect = state.panel.getBoundingClientRect();
  setPanelPosition(
    clamp(drag.left + dx, QUICK_ACTION_MIN_GAP, window.innerWidth - rect.width - QUICK_ACTION_MIN_GAP),
    clamp(drag.top + dy, QUICK_ACTION_MIN_GAP, window.innerHeight - rect.height - QUICK_ACTION_MIN_GAP)
  );
}

function finishDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const moved = drag.moved;
  stopDrag();
  if (!moved || !state.panel) return;
  suppressCollapseClick = true;
  setTimeout(() => { suppressCollapseClick = false; }, 300);
  const rect = state.panel.getBoundingClientRect();
  const travel = Math.max(0, window.innerHeight - rect.height - 2 * QUICK_ACTION_MIN_GAP);
  const position = {
    side: rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right',
    y: travel ? clamp((rect.top - QUICK_ACTION_MIN_GAP) / travel, 0, 1) : 0
  };
  dockAndSave(position);
}

function handlePositionKeys(event) {
  if (event.target !== state.header || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const rect = state.panel.getBoundingClientRect();
  const travel = Math.max(0, window.innerHeight - rect.height - 2 * QUICK_ACTION_MIN_GAP);
  const current = currentSettings.exportQuickActionPosition || {
    side: rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right',
    y: travel ? (rect.top - QUICK_ACTION_MIN_GAP) / travel : 0
  };
  dockAndSave({
    side: event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : current.side,
    y: clamp(current.y + (event.key === 'ArrowUp' ? -40 : event.key === 'ArrowDown' ? 40 : 0) / (travel || 1), 0, 1)
  });
}

function dockAndSave(position) {
  currentSettings.exportQuickActionPosition = position;
  latestLocalPosition = position;
  state.panel.classList.add('is-snapping');
  positionDocked(position);
  if (snapTimer) clearTimeout(snapTimer);
  snapTimer = setTimeout(() => state.panel?.classList.remove('is-snapping'), 220);
  disconnectBodyObserver();
  positionWrite = positionWrite.then(() => saveSettings({ exportQuickActionPosition: position })).catch(() => {});
}

function cancelDrag() {
  stopDrag();
  schedulePositionUpdate();
}

function stopDrag() {
  if (drag && state.header?.hasPointerCapture?.(drag.pointerId)) {
    try { state.header.releasePointerCapture(drag.pointerId); } catch { /* pointer already ended */ }
  }
  drag = null;
  state.panel?.classList.remove('is-dragging');
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', finishDrag);
  window.removeEventListener('pointercancel', cancelDrag);
  window.removeEventListener('blur', cancelDrag);
}

function positionFallback(panelRect) {
  if (!panelRect) {
    panelRect = state.panel?.getBoundingClientRect() || { width: 0, height: 0 };
  }
  const left = clamp(
    window.innerWidth - panelRect.width - QUICK_ACTION_DEFAULT_GAP,
    QUICK_ACTION_MIN_GAP,
    window.innerWidth - panelRect.width - QUICK_ACTION_MIN_GAP
  );
  const top = clamp(
    window.innerHeight - panelRect.height - QUICK_ACTION_DEFAULT_GAP,
    QUICK_ACTION_MIN_GAP,
    window.innerHeight - panelRect.height - QUICK_ACTION_MIN_GAP
  );
  setPanelPosition(left, top);
}

function resolveComposerAnchor() {
  for (const selector of COMPOSER_SELECTORS) {
    const composer = document.querySelector(selector);
    if (!composer || !isUsableRect(composer.getBoundingClientRect())) {
      continue;
    }
    return composer.closest('form') || composer.parentElement;
  }
  return null;
}

function ensureBodyObserver() {
  if (bodyObserver || !document.body) {
    return;
  }
  bodyObserver = new MutationObserver(() => {
    schedulePositionUpdate();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function disconnectBodyObserver() {
  if (!bodyObserver) {
    return;
  }
  bodyObserver.disconnect();
  bodyObserver = null;
}

function isUsableRect(rect) {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function setPanelPosition(left, top) {
  if (!state.panel) {
    return;
  }
  state.panel.style.left = `${Math.round(left)}px`;
  state.panel.style.top = `${Math.round(top)}px`;
  state.panel.style.right = 'auto';
  state.panel.style.bottom = 'auto';
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function normalizeExportFormat(format) {
  if (!format || typeof format !== 'string') {
    return DEFAULT_SETTINGS.exportFormat;
  }
  const normalized = format.trim().toLowerCase();
  if (normalized === 'md') {
    return 'markdown';
  }
  if (FORMAT_OPTIONS.some((option) => option.value === normalized)) {
    return normalized;
  }
  return DEFAULT_SETTINGS.exportFormat;
}

function normalizeExportScope(scope) {
  if (!scope || typeof scope !== 'string') {
    return DEFAULT_SETTINGS.exportScope;
  }
  const normalized = scope.trim().toLowerCase();
  if (normalized === 'assistant' || normalized === 'all') {
    return normalized;
  }
  return DEFAULT_SETTINGS.exportScope;
}
