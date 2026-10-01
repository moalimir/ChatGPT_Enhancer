// Equations and code must not determine the language of surrounding prose.
export const DIRECTION_EXCLUSIONS = 'code, pre, .katex, [data-math-source], [data-markdown-copy="code-block"], [data-markdown-copy="exclude"], .sr-only';

export function textDirection(text) {
  // Mixed headings often begin with a long English term. Their Persian prose
  // still aligns right; native bidi preserves whole English phrases within it.
  return /[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF]/.test(text) ? 'rtl' : /[A-Za-z]/.test(text) ? 'ltr' : 'auto';
}

export function blockDirection(block) {
  const walker = block.ownerDocument.createTreeWalker(block, 4);
  let text = '';
  while (walker.nextNode()) {
    if (!walker.currentNode.parentElement?.closest(DIRECTION_EXCLUSIONS)) text += walker.currentNode.textContent;
  }
  return textDirection(text);
}

export function applyDocumentDirection(root) {
  root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th').forEach((block) => {
    if (!block.closest(DIRECTION_EXCLUSIONS)) block.dir = blockDirection(block);
  });
  root.querySelectorAll('pre,code,.katex,.katex-display').forEach((node) => { node.dir = 'ltr'; });
  root.querySelectorAll('table').forEach((table) => {
    // Chromium shrinks the whole print document for RTL tables. Generated Markdown
    // tables have no spans: reverse their columns and retain each cell's own direction.
    if (blockDirection(table) === 'rtl') {
      table.querySelectorAll('tr').forEach((row) => row.append(...Array.from(row.children).reverse()));
    }
    table.dir = 'ltr';
  });
}
