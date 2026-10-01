import { PRINT_STYLE_BLOCK } from '../styles.js';

export function fitEquationsForPrint(root) {
  const printWindow = root.ownerDocument.defaultView;
  // Fit unusually wide display equations without cropping them at the page edge.
  root.querySelectorAll('.katex').forEach((math) => {
    // The HTML wrapper is constrained to the page while its children can overflow.
    // Measuring its rectangle misses that overflow and makes Chrome shrink every page.
    const width = Math.max(math.scrollWidth, math.querySelector('.katex-html')?.scrollWidth || 0,
      math.querySelector('math')?.scrollWidth || 0);
    const block = math.closest('.gpt-export-math,td,th,p,h1,h2,h3,h4,h5,h6') || root;
    const available = Math.min(block.clientWidth, root.getBoundingClientRect().width) - 1;
    if (width > available && available > 0) {
      math.style.fontSize = `${parseFloat(printWindow.getComputedStyle(math).fontSize) * available / width}px`;
    }
  });
}

// The caller has already rendered the content and awaited this document's fonts/images.
export async function exportAsPdf(root, _root, { signal } = {}) {
  const printDocument = root.ownerDocument;
  const printWindow = printDocument.defaultView;
  const style = printDocument.createElement('style');
  style.textContent = PRINT_STYLE_BLOCK;
  printDocument.head.appendChild(style);
  root.style.maxWidth = '174mm';
  root.style.width = '100%';
  fitEquationsForPrint(root);
  void printDocument.body.offsetHeight;
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      printWindow.removeEventListener('afterprint', onAfterPrint);
      signal?.removeEventListener('abort', onAbort);
      error ? reject(error) : resolve();
    };
    const onAfterPrint = () => finish();
    const onAbort = () => finish(new Error('Export was cancelled.'));
    const timeout = setTimeout(() => finish(new Error('PDF print timed out.')), 120000);
    printWindow.addEventListener('afterprint', onAfterPrint, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) { finish(error); }
  });
}
