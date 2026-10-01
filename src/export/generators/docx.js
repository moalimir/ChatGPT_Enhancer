import { DOCX_EXPORT_STYLE_BLOCK } from '../styles.js';
import { buildFilename } from '../utils/download.js';
import { ensureDocxRunnerLoaded, requestDocxGeneration } from '../utils/assets.js';
import { convertKatexToImages } from '../core/equations.js';

export async function exportAsDocx(_stage, root, { fontCSS } = {}) {
  await convertKatexToImages(root, fontCSS);
  root.querySelectorAll('.gpt-export-turn').forEach((turn, index) => {
    if (!index) return;
    // Explicit rules survive Word's limited CSS selector support.
    turn.prepend(root.ownerDocument.createElement('hr'));
    turn.style.borderTop = '0';
  });
  // Word's HTML import does not implement CSS logical properties or bidi isolation.
  root.querySelectorAll('[dir]').forEach((node) => {
    if (!['rtl','ltr'].includes(node.dir)) return;
    node.style.direction = node.dir;
    node.style.textAlign = node.dir === 'rtl' ? 'right' : 'left';
  });
  root.querySelectorAll('blockquote').forEach((node) => {
    node.style.setProperty(node.dir === 'rtl' ? 'border-right' : 'border-left', '3px solid #d8dadd');
    node.style.setProperty(node.dir === 'rtl' ? 'padding-right' : 'padding-left', '12px');
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${DOCX_EXPORT_STYLE_BLOCK}</style></head><body>${root.outerHTML}</body></html>`;
  await ensureDocxRunnerLoaded();
  await requestDocxGeneration(html, buildFilename('docx'));
}
