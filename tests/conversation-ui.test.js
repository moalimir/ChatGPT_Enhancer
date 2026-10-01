import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setupDom } from './helpers/dom.js';

test('TOC lists the full branch and scrolls to the start of a matching mounted ID without a preview', async () => {
  const { cleanup } = setupDom();
  const conversation = JSON.parse(readFileSync(new URL('./fixtures/conversations/branched.json', import.meta.url)));
  let parent = 'b3';
  for (let index = 0; index < 120; index += 1) {
    const id = `long-${index}`;
    conversation.mapping[id] = { parent, message: { id, author: { role: 'assistant' }, recipient: 'all',
      end_turn: true, status: 'finished_successfully', content: { content_type: 'text', parts: [`Reply ${index}`] } } };
    parent = id;
  }
  conversation.current_node = parent;
  window.history.replaceState({}, '', `/c/${conversation.conversation_id}`);
  global.location = window.location;
  global.fetch = async (url) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => url.endsWith('/api/auth/session') ? { accessToken: 'test-token' } : conversation });
  window.FontFace = class { async load() { return this; } };
  Object.defineProperty(document, 'fonts', { value: { add() {}, ready: Promise.resolve() } });
  let TocManager;
  try {
    ({ TocManager } = await import('../src/content/toc.js'));
    TocManager.init({ enableFix: true, tableOfContents: true });
    document.querySelector('.gpt-toc-toggle').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(document.querySelectorAll('.gpt-toc-entry').length, 121);
    const entry = document.querySelector('.gpt-toc-entry');
    assert.equal(document.querySelector('.gpt-toc-preview'), null);

    const mounted = document.createElement('div');
    mounted.setAttribute('data-content-search-unit-key', 'turn:2:assistant');
    mounted.innerHTML = '<div data-chatgpt-selection-message-id="b2"></div>';
    const host = document.createElement('div');
    host.style.overflowY = 'auto';
    Object.defineProperties(host, { scrollHeight: { value: 3000 }, clientHeight: { value: 600 } });
    let scrolled = false;
    mounted.getBoundingClientRect = () => ({ top: 2000 - host.scrollTop });
    host.scrollTo = (options) => {
      assert.equal(options.behavior, 'smooth'); scrolled = true;
      host.scrollTop = options.top;
      host.dispatchEvent(new window.Event('scroll'));
      setTimeout(() => host.dispatchEvent(new window.Event('scrollend')), 20);
    };
    host.appendChild(mounted); document.body.appendChild(host);
    entry.click();
    assert.equal(mounted.classList.contains('gpt-toc-target'), true, 'Highlight starts on visibility before scrollend or settling');
    assert.equal(document.querySelector('.gpt-toc-status').textContent, 'Finding reply…');
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(scrolled, true);
    assert.equal(mounted.getBoundingClientRect().top, 64);
    assert.equal(mounted.classList.contains('gpt-toc-target'), true);
    entry.click(); // Selecting the same visible reply restarts its two-second fade.
    await new Promise((resolve) => setTimeout(resolve, 1750));
    assert.equal(mounted.classList.contains('gpt-toc-target'), true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(mounted.classList.contains('gpt-toc-target'), false);
    entry.click();
    TocManager.update({ enableFix: { newValue: false } });
    assert.equal(mounted.classList.contains('gpt-toc-target'), false);
  } finally {
    TocManager?.update({ enableFix: { newValue: false } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    delete global.fetch;
    delete global.location;
    cleanup();
  }
});

test('Persian blocks align right while English, math, and code stay isolated', async () => {
  const { cleanup } = setupDom();
  try {
    const { DirectionFixer } = await import('../src/content/fixers/direction.js');
    document.body.innerHTML = '<main><div data-markdown-text-style="assistant-message">' +
      '<p id="fa">سلام این متن درباره <code>EnglishCodeWithManyLetters</code> است <span class="katex">EquationWithManyLetters</span></p>' +
      '<p id="en">English paragraph only</p></div>' +
      '<div data-user-message-bubble><div data-search-result-target id="user">سلام OpenAI</div></div></main>';
    DirectionFixer.init({ enableFix: true, fixCode: true });
    assert.equal(document.getElementById('fa').classList.contains('gpt-enhancer-text-rtl'), true);
    assert.equal(document.getElementById('en').classList.contains('gpt-enhancer-text-ltr'), true);
    assert.equal(document.getElementById('user').classList.contains('gpt-enhancer-text-rtl'), true);
    DirectionFixer.update({ alignPersian: { newValue: false } });
    assert.equal(document.querySelectorAll('.gpt-enhancer-text-rtl, .gpt-enhancer-text-ltr').length, 0);
    DirectionFixer.update({ alignPersian: { newValue: true } });
    const paragraph = document.getElementById('en');
    paragraph.firstChild.textContent = 'این جمله فارسی است';
    DirectionFixer.handleMutations([{ type: 'characterData', target: paragraph.firstChild }]);
    assert.equal(paragraph.classList.contains('gpt-enhancer-text-rtl'), true);
    DirectionFixer.clear();
    assert.equal(document.querySelectorAll('.gpt-enhancer-text-rtl, .gpt-enhancer-text-ltr').length, 0);
  } finally {
    cleanup();
  }
});

test('TOC finds distant IDs in a reverse scroller and respects cancellation', async () => {
  const { cleanup } = setupDom();
  try {
    const { revealMessage } = await import('../src/content/selectors.js');
    const host = document.createElement('div');
    host.style.cssText = 'overflow-y:auto;display:flex;flex-direction:column-reverse';
    let height = 12000;
    Object.defineProperties(host, { scrollHeight: { get: () => height }, clientHeight: { value: 600 } });
    const ids = Array.from({ length: 12 }, (_, i) => `message-${i}`);
    let position = 0;
    const mount = () => {
      const index = Math.min(11, Math.floor((height - 600 + position) / 1000));
      host.innerHTML = `<div data-content-search-unit-key="turn-0:assistant"><div data-chatgpt-selection-message-id="${ids[index]}"></div></div>`;
      host.firstElementChild.getBoundingClientRect = () => ({ top: 64 });
    };
    let firstJump = true;
    Object.defineProperty(host, 'scrollTop', { get: () => position, set: (next) => {
      position = next;
      if (firstJump) { firstJump = false; height += 1000; return; }
      mount();
    } });
    host.scrollTo = ({ top, behavior }) => {
      assert.equal(behavior, 'smooth'); host.scrollTop = top;
      host.dispatchEvent(new window.Event('scrollend'));
    };
    document.body.appendChild(host); mount();
    for (const index of [0, 5, 11]) {
      const mounted = await revealMessage(ids[index], ids);
      assert.equal(mounted.querySelector('[data-chatgpt-selection-message-id]').getAttribute('data-chatgpt-selection-message-id'), ids[index]);
    }
    const controller = new AbortController(); controller.abort();
    await assert.rejects(revealMessage(ids[0], ids, { signal: controller.signal }), { name: 'AbortError' });
  } finally { cleanup(); }
});

test('TOC realigns a mounted message after virtualization changes its position', async () => {
  const { cleanup } = setupDom();
  try {
    const { revealMessage } = await import('../src/content/selectors.js');
    const mounted = document.createElement('div');
    mounted.setAttribute('data-content-search-unit-key', 'turn-0:assistant');
    mounted.innerHTML = '<div data-chatgpt-selection-message-id="moving"></div>';
    const host = document.createElement('div');
    host.style.overflowY = 'auto';
    Object.defineProperties(host, { scrollHeight: { value: 200000 }, clientHeight: { value: 600 } });
    host.appendChild(mounted); document.body.appendChild(host);
    let top = 80000, scrolls = 0;
    mounted.getBoundingClientRect = () => ({ top: top - host.scrollTop });
    host.scrollTo = ({ top: destination, behavior }) => {
      assert.equal(behavior, 'smooth'); host.scrollTop = destination;
      host.dispatchEvent(new window.Event('scrollend'));
      if (++scrolls === 1) setTimeout(() => { top += 40000; }, 30);
    };
    assert.equal(await revealMessage('moving', ['moving']), mounted);
    assert.equal(scrolls, 2);
    assert.equal(mounted.getBoundingClientRect().top, 64);
  } finally { cleanup(); }
});

test('smooth TOC navigation stops on cancellation and respects reduced motion', async () => {
  const { cleanup } = setupDom();
  try {
    const { revealMessage } = await import('../src/content/selectors.js');
    const host = document.createElement('div'); host.style.overflowY = 'auto';
    Object.defineProperties(host, { scrollHeight: { value: 3000 }, clientHeight: { value: 600 } });
    host.innerHTML = '<div data-content-search-unit-key="turn-0:assistant"><div data-chatgpt-selection-message-id="target"></div></div>';
    const mounted = host.firstElementChild;
    let position = 0, stops = 0;
    Object.defineProperty(host, 'scrollTop', { get: () => position, set: (top) => { position = top; stops++; } });
    mounted.getBoundingClientRect = () => ({ top: 1000 - position });
    document.body.appendChild(host);
    host.scrollTo = ({ behavior }) => assert.equal(behavior, 'smooth');
    const controller = new AbortController();
    const pending = revealMessage('target', ['target'], { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(position, 0); assert.equal(stops, 1);
    window.matchMedia = () => ({ matches: true });
    host.scrollTo = () => assert.fail('Reduced motion must bypass animation');
    assert.equal(await revealMessage('target', ['target']), mounted);
    assert.equal(mounted.getBoundingClientRect().top, 64);
  } finally { cleanup(); }
});

test('quick export drag snaps to an edge and saves its relative height', async () => {
  const { cleanup } = setupDom();
  let saved = null;
  global.chrome = { storage: { sync: { set: (patch, done) => { saved = patch; done(); } } }, runtime: {} };
  try {
    const { QuickActionManager } = await import('../src/content/quick-actions/index.js');
    QuickActionManager.init({ enableFix: true, exportQuickAction: true,
      exportQuickActionPosition: { side: 'right', y: 0.5 } });
    const panel = document.querySelector('.gpt-export-quick-action');
    panel.getBoundingClientRect = () => ({ left: parseFloat(panel.style.left) || 772,
      top: parseFloat(panel.style.top) || 324, width: 240, height: 120 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const header = panel.querySelector('.gpt-export-qa-header');
    header.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 800, clientY: 350 }));
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 180 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 70, clientY: 180 }));
    QuickActionManager.update({ exportQuickActionPosition: { newValue: { side: 'right', y: 0 } } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(saved.exportQuickActionPosition.side, 'left');
    assert.ok(saved.exportQuickActionPosition.y >= 0 && saved.exportQuickActionPosition.y <= 1);
    assert.equal(panel.style.left, '12px');
    QuickActionManager.update({ exportQuickActionPosition: { newValue: saved.exportQuickActionPosition } });
    header.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(saved.exportQuickActionPosition.side, 'right');
    QuickActionManager.update({ exportQuickAction: { newValue: false } });
  } finally {
    delete global.chrome;
    cleanup();
  }
});
