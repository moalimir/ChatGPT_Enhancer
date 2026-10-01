/** Print the prepared export in its own document, away from ChatGPT's print CSS. */

import { EXPORT_STYLE_BLOCK } from '../styles.js';

const PRINT_STYLE = `
  @page { margin: 0.6in 0.4in; }
  html, body { height: auto !important; overflow: visible !important; }
  body { margin: 0; background: #fff; }
  .gpt-export-root pre {
    background-color: #000 !important;
    color: #fff !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }
`;

export async function exportAsPdf(root) {
  if (!root) throw new Error('PDF export content is unavailable.');

  const frame = document.createElement('iframe');
  frame.title = 'GPT Enhancer PDF export';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;opacity:0;pointer-events:none;z-index:-1;border:0';
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${EXPORT_STYLE_BLOCK}${PRINT_STYLE}</style></head><body></body></html>`;

  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('PDF print document did not load.')), 10000);
    frame.onload = () => { window.clearTimeout(timeout); resolve(); };
    frame.onerror = () => { window.clearTimeout(timeout); reject(new Error('PDF print document failed to load.')); };
    document.body.appendChild(frame);
  }).catch((error) => {
    frame.remove();
    throw error;
  });

  const printWindow = frame.contentWindow;
  frame.contentDocument.body.appendChild(frame.contentDocument.adoptNode(root));
  void frame.contentDocument.body.offsetHeight;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      printWindow.removeEventListener('afterprint', onAfterPrint);
      frame.remove();
      if (error) reject(error);
      else resolve();
    };
    const onAfterPrint = () => finish();
    const timeout = window.setTimeout(() => finish(new Error('PDF print timed out.')), 120000);
    printWindow.addEventListener('afterprint', onAfterPrint, { once: true });
    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      finish(error);
    }
  });
}
