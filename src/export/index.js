/**
 * Main orchestrator for the export pipeline, managing the lifecycle from request to download.
 *
 * Responsibilities:
 * - Gate exports to single-flight per tab and clean up orphaned stages/styles.
 * - Coordinate preload steps (virtualized scrape, normalization, fonts, images).
 * - Route to format-specific generators and emit progress/error events for the UI.
 */

import { EXPORT_MESSAGE_TYPE, EXPORT_STAGE_CLASS } from './constants.js';
import { EXPORT_STYLE_BLOCK } from './styles.js';
import { ensureExportFontsLoaded } from './utils/assets.js';
import { ensureConversationContentLoaded, collectConversation } from './core/scraper.js';
import { sanitizeExportNode, removeTrailingWhitespace, hasRenderableContent } from './core/sanitizer.js';
import {
  normalizeUnsupportedColors,
  ensureDirectionalConsistency,
  insertRtlWeightBoundaries
} from './core/normalizer.js';
import { inlineImages } from './core/images.js';
import { getGenerator } from './generators/index.js';
import { detectTurnRole } from './utils/serialization.js';

// UI progress bridge; consumed by content script to show toast updates.
const PROGRESS_EVENT = 'GPT_ENHANCER_EXPORT_PROGRESS';
const EXPORT_REQUEST_EVENT = 'GPT_ENHANCER_EXPORT_REQUEST';
// Single-flight guard to prevent overlapping exports in the same tab.
let activeExportRun = null;

function normalizeExportFormat(format) {
  if (!format || typeof format !== 'string') {
    return 'pdf';
  }
  const normalized = format.trim().toLowerCase();
  if (normalized === 'md') {
    return 'markdown';
  }
  if (['pdf', 'docx', 'markdown', 'txt'].includes(normalized)) {
    return normalized;
  }
  return 'pdf';
}

function normalizeExportScope(scope) {
  if (!scope || typeof scope !== 'string') {
    return 'all';
  }
  const normalized = scope.trim().toLowerCase();
  if (normalized === 'assistant' || normalized === 'all') {
    return normalized;
  }
  return 'all';
}

function isTextExportFormat(format) {
  return format === 'markdown' || format === 'txt';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== EXPORT_MESSAGE_TYPE) {
    return undefined;
  }

  const format = message.format || 'pdf';
  const scope = message.scope || 'all';
  handleExportRequest(format, scope)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      dispatchProgress('error', {
        format: normalizeExportFormat(format),
        message: error instanceof Error ? error.message : String(error)
      });
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
});

if (typeof document !== 'undefined') {
  document.addEventListener(EXPORT_REQUEST_EVENT, (event) => {
    const detail = event?.detail || {};
    const format = detail.format || 'pdf';
    const scope = detail.scope || 'all';
    handleExportRequest(format, scope).catch((error) => {
      dispatchProgress('error', {
        format: normalizeExportFormat(format),
        message: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

function dispatchExportSuccessEvent() {
  if (typeof document === 'undefined') {
    return;
  }
  const event = new CustomEvent('GPT_ENHANCER_EXPORT_SUCCESS');
  document.dispatchEvent(event);
}

async function handleExportRequest(format, scope) {
  if (activeExportRun) {
    // Enforce single-flight: returning early avoids stage DOM conflicts and double work.
    throw new Error('An export is already in progress. Please wait for it to finish.');
  }

  const exportFormat = normalizeExportFormat(format);
  const exportScope = normalizeExportScope(scope);
  const run = createExportRun(exportFormat);
  activeExportRun = run;

  try {
    dispatchProgress('starting', { format: exportFormat });
    removeOrphanedStages();
    dispatchProgress('loading-content', { format: exportFormat });

    const { root, stage, styleNode } = await prepareExportStage(exportScope);
    run.stage = stage;
    run.styleNode = styleNode;
    attachUnloadGuards(run);
    throwIfAborted(run);

    dispatchProgress('normalizing', { format: exportFormat });
    normalizeUnsupportedColors(root);
    ensureDirectionalConsistency(root);
    if (!isTextExportFormat(exportFormat)) {
      insertRtlWeightBoundaries(root);
    }
    dispatchProgress('fonts', { format: exportFormat });
    await ensureExportFontsLoaded();
    throwIfAborted(run);

    if (!isTextExportFormat(exportFormat)) {
      dispatchProgress('images', { format: exportFormat });
      await inlineImages(root, { signal: run.abortController ? run.abortController.signal : null });
    }

    throwIfAborted(run);

    const generator = getGenerator(exportFormat);
    if (!generator) {
      throw new Error(`No generator available for format: ${exportFormat}`);
    }
    dispatchProgress('generating', { format: exportFormat });
    await generator(exportFormat === 'png' ? stage : root, root);
    dispatchExportSuccessEvent();
    dispatchProgress('done', { format: exportFormat });
  } finally {
    dispatchProgress('cleanup', { format: exportFormat });
    detachUnloadGuards(run);
    cleanupStage(run.stage, run.styleNode);
    activeExportRun = null;
  }
}

async function prepareExportStage(scope) {
  await ensureConversationContentLoaded();
  const exportRoot = collectConversation(sanitizeExportNode, hasRenderableContent, removeTrailingWhitespace);
  if (!exportRoot) {
    throw new Error('Unable to locate conversation content on this page.');
  }
  filterExportRootByScope(exportRoot, scope);
  if (!exportRoot.children.length) {
    if (scope === 'assistant') {
      throw new Error('No assistant messages found to export.');
    }
    throw new Error('Unable to locate conversation content on this page.');
  }

  const stage = document.createElement('div');
  stage.className = EXPORT_STAGE_CLASS;
  stage.style.position = 'fixed';
  stage.style.top = '0';
  stage.style.left = '0';
  stage.style.width = '672px';
  stage.style.opacity = '0';
  stage.style.zIndex = '-1';
  stage.style.pointerEvents = 'none';
  stage.style.userSelect = 'none';
  stage.setAttribute('aria-hidden', 'true');
  stage.setAttribute('role', 'presentation');

  const styleNode = document.createElement('style');
  styleNode.textContent = EXPORT_STYLE_BLOCK;
  stage.appendChild(styleNode);
  stage.appendChild(exportRoot);
  document.body.appendChild(stage);

  return { root: exportRoot, stage, styleNode };
}

export { handleExportRequest };

function dispatchProgress(status, detail = {}) {
  if (typeof document === 'undefined') {
    return;
  }
  const event = new CustomEvent(PROGRESS_EVENT, { detail: { status, ...detail } });
  document.dispatchEvent(event);
}

// Tracks a single export run; used as a mutex and lifecycle container.
function createExportRun(format) {
  return {
    format,
    aborted: false,
    stage: null,
    styleNode: null,
    teardownHandlers: [],
    abortController: typeof AbortController === 'function' ? new AbortController() : null
  };
}

function throwIfAborted(run) {
  if (run && run.aborted) {
    const error = new Error('Export was aborted because the page was closed or hidden.');
    error.code = 'export-aborted';
    throw error;
  }
}

function attachUnloadGuards(run) {
  if (!run) {
    return;
  }
  // If the tab is hidden or navigated away, mark the run as aborted and tear down the stage
  // so we do not leave heavy DOM nodes attached.
  const abort = () => {
    run.aborted = true;
    if (run.abortController && typeof run.abortController.abort === 'function') {
      run.abortController.abort();
    }
    dispatchProgress('aborted', { format: run.format });
    cleanupStage(run.stage, run.styleNode);
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      abort();
    }
  };

  window.addEventListener('pagehide', abort, { once: true });
  document.addEventListener('visibilitychange', handleVisibility);
  run.teardownHandlers.push(() => window.removeEventListener('pagehide', abort));
  run.teardownHandlers.push(() => document.removeEventListener('visibilitychange', handleVisibility));
}

function detachUnloadGuards(run) {
  if (!run || !Array.isArray(run.teardownHandlers)) {
    return;
  }
  run.teardownHandlers.forEach((dispose) => {
    try {
      dispose();
    } catch (error) {
      /* ignore */
    }
  });
  run.teardownHandlers = [];
}

function cleanupStage(stage, styleNode) {
  if (styleNode && styleNode.parentNode) {
    styleNode.parentNode.removeChild(styleNode);
  }
  if (stage && typeof stage.remove === 'function') {
    stage.remove();
  } else if (stage && stage.parentNode) {
    stage.parentNode.removeChild(stage);
  }
}

function removeOrphanedStages() {
  const staleStages = document.querySelectorAll(`.${EXPORT_STAGE_CLASS}`);
  staleStages.forEach((node) => {
    // Defensive cleanup: if a previous export crashed, remove hidden containers before starting anew.
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  });
}

function filterExportRootByScope(root, scope) {
  if (!root || scope !== 'assistant') {
    return;
  }
  Array.from(root.children).forEach((turn) => {
    if (detectTurnRole(turn) !== 'assistant') {
      turn.remove();
    }
  });
}
