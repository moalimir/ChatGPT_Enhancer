/**
 * Centralized loader for external libraries and fonts required by exports.
 *
 * Responsibilities:
 * - Inject and coordinate DOCX generation scripts via page-context IPC.
 * - Resolve runtime asset URLs and ensure export fonts are loaded/registered.
 * - Provide a timeout-bound request/response channel for DOCX generation.
 */


const DOCX_SCRIPT_ATTR = 'data-gpt-enhancer-docx';
const DOCX_RUNNER_ATTR = 'data-gpt-enhancer-docx-runner';
const DOCX_REQUEST_EVENT = 'GPT_ENHANCER_DOCX_REQUEST';
const DOCX_RESULT_EVENT = 'GPT_ENHANCER_DOCX_RESULT';

let docxRunnerReadyPromise = null;

export function ensureDocxRunnerLoaded() {
  if (docxRunnerReadyPromise) {
    return docxRunnerReadyPromise;
  }

  // Injects html-docx + runner into the page context; runner handles IPC to create the blob.
  docxRunnerReadyPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[${DOCX_RUNNER_ATTR}]`)) {
      resolve();
      return;
    }

    injectHtmlDocxScript()
      .then(() => injectDocxRunnerScript())
      .then(resolve)
      .catch(reject);
  });

  return docxRunnerReadyPromise;
}

function injectHtmlDocxScript() {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[${DOCX_SCRIPT_ATTR}]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.dataset.gptEnhancerDocx = 'true';
    script.setAttribute(DOCX_SCRIPT_ATTR, 'true');
    script.src = getExtensionUrl('assets/libs/html-docx.min.js');
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load html-docx library'));
    (document.head || document.documentElement).appendChild(script);
  });
}

function injectDocxRunnerScript() {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[${DOCX_RUNNER_ATTR}]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.setAttribute(DOCX_RUNNER_ATTR, 'true');
    script.dataset.gptEnhancerDocxRunner = 'true';
    script.src = getExtensionUrl('assets/scripts/docx-runner.js');
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load DOCX runner'));
    (document.head || document.documentElement).appendChild(script);
  });
}

export function requestDocxGeneration(htmlContent, filename, timeoutMs = 15000) {
  if (!htmlContent || !filename) {
    return Promise.reject(new Error('DOCX payload is incomplete'));
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    let settled = false;

    // Clears listeners/timers after completion to avoid leaks across exports.
    const cleanup = () => {
      settled = true;
      document.removeEventListener(DOCX_RESULT_EVENT, handleResult);
      window.clearTimeout(timeout);
    };

    const handleResult = (event) => {
      const detail = event?.detail || {};
      if (detail.requestId !== requestId) {
        return;
      }
      cleanup();
      if (detail.ok) {
        resolve();
        return;
      }
      reject(new Error(detail.error || 'DOCX export failed'));
    };

    // Avoid hanging the UI if the runner never responds (CSP or unexpected errors).
    const timeout = window.setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error('DOCX export timed out'));
      }
    }, timeoutMs);

    document.addEventListener(DOCX_RESULT_EVENT, handleResult);
    document.dispatchEvent(
      new CustomEvent(DOCX_REQUEST_EVENT, {
        detail: {
          requestId,
          html: htmlContent,
          filename
        }
      })
    );
  });
}

function getExtensionUrl(path) {
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    return chrome.runtime.getURL(path);
  }
  return path;
}
