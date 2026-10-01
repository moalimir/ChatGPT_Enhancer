import assert from 'node:assert/strict';
import test from 'node:test';
import { renderConversation } from '../src/export/core/render-conversation.js';
import { selectedFonts, loadDocumentFonts } from '../src/common/fonts.js';
import { setupDom } from './helpers/dom.js';
import { fitEquationsForPrint } from '../src/export/generators/pdf.js';

test('study renderer supports both math delimiter families and keeps code, currency, and mixed prose intact', () => {
  const { cleanup } = setupDom();
  try {
    const source = String.raw`# یادداشت Calculus

این جمله شامل \(x^2 + y^2\) و عبارت English است.

English prose with $a+b$ and prices $5 and $10.

$$
\frac{1}{2} + \sqrt{x}
$$

\[
\begin{pmatrix}1&2\\3&4\end{pmatrix}
\]

\`$literal$\`

\`\`\`js
const price = '$5';
\`\`\`
`.replace(/\\`/g, '`');
    const root = renderConversation([{ role: 'assistant', markdown: source }, { role: 'user', markdown: 'Final turn' }]);
    assert.equal(root.querySelectorAll('.katex').length, 4);
    assert.equal(root.querySelectorAll('.katex-error').length, 0);
    assert.equal(root.querySelector('h1').dir, 'rtl');
    assert.equal(root.querySelector('p').dir, 'rtl');
    assert.equal(root.querySelectorAll('p')[1].dir, 'ltr');
    assert.match(root.textContent, /prices \$5 and \$10/);
    assert.equal(root.querySelector('code').textContent, '$literal$');
    assert.match(root.querySelector('pre code').textContent, /const price/);
    assert.equal(root.querySelector('.gpt-export-role'), null);
    const table = renderConversation([{ role: 'assistant', markdown: '| مفهوم | توضیح |\n|---|---|\n| مشتق | نرخ تغییر |' }]).querySelector('table');
    assert.equal(table.dir, 'ltr');
    assert.equal(table.querySelector('th').textContent, 'توضیح');
    assert.equal(table.querySelector('th').dir, 'rtl');
  } finally { cleanup(); }
});

test('wide equation overflow is fitted individually so Chrome does not shrink the document', () => {
  const { cleanup } = setupDom();
  try {
    const root = renderConversation([{ role: 'assistant', markdown: '$x+y$' }]);
    document.body.appendChild(root);
    const math = root.querySelector('.katex');
    math.style.fontSize = '20px';
    Object.defineProperty(math, 'scrollWidth', { value: 1200 });
    Object.defineProperty(math.closest('p'), 'clientWidth', { value: 600 });
    root.getBoundingClientRect = () => ({ width: 658 });
    fitEquationsForPrint(root);
    assert.ok(parseFloat(math.style.fontSize) < 10);
    assert.equal(root.style.fontSize, '');
  } finally { cleanup(); }
});

test('chosen fonts are loaded in each target document and reused for repeated exports', async () => {
  const { cleanup } = setupDom();
  const originalFetch = global.fetch;
  try {
    const fonts = selectedFonts({ fontsEnabled: true, fontEnglish: 'roboto', fontPersian: 'shabnam' });
    assert.match(fonts.stack, /^"Roboto", "Shabnam",/);
    assert.equal(fonts.definitions.length, 3);
    let added = 0;
    window.FontFace = class { async load() { return this; } };
    Object.defineProperty(document, 'fonts', { value: { add() { added++; }, ready: Promise.resolve() } });
    global.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    await loadDocumentFonts(document, fonts.definitions);
    await loadDocumentFonts(document, fonts.definitions);
    assert.equal(added, 3);
    const other = document.implementation.createHTMLDocument();
    Object.defineProperty(other, 'defaultView', { value: window });
    Object.defineProperty(other, 'fonts', { value: { add() { added++; }, ready: Promise.resolve() } });
    await loadDocumentFonts(other, fonts.definitions);
    assert.equal(added, 6);
  } finally { global.fetch = originalFetch; cleanup(); }
});

test('Persian labels inside equations use native MathML without missing character metrics', () => {
  const { cleanup } = setupDom();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const root = renderConversation([{ role: 'assistant', markdown: String.raw`این فرمول \(x + \text{بالایی}\) است.

\[
\frac{\text{بالایی}}{\text{پایینی}} + x^2
\]

Standard math: $\frac{1}{2}$.` }]);
    assert.equal(warnings.length, 0);
    assert.equal(root.querySelectorAll('.gpt-export-native-math math').length, 2);
    assert.equal(root.querySelectorAll('.gpt-export-native-math .katex-html').length, 0);
    assert.equal(root.querySelector('math mtext').getAttribute('dir'), 'rtl');
    assert.equal(root.querySelectorAll('.katex-html').length, 1);
    assert.equal(root.querySelectorAll('.katex-error').length, 0);
  } finally { console.warn = originalWarn; cleanup(); }
});
