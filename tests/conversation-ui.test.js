import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setupDom } from './helpers/dom.js';

test('TOC previews unmounted replies and scrolls to a matching mounted ID', async () => {
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
  global.fetch = async (url) => ({ ok: true, json: async () => url.endsWith('/api/auth/session')
    ? { accessToken: 'test-token' } : conversation });
  try {
    const { TocManager } = await import('../src/content/toc.js');
    TocManager.init({ enableFix: true, tableOfContents: true });
    document.querySelector('.gpt-toc-toggle').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelectorAll('.gpt-toc-entry').length, 121);
    const entry = document.querySelector('.gpt-toc-entry');
    entry.click();
    assert.match(document.querySelector('.gpt-toc-preview').textContent, /Active regenerated answer/);

    const mounted = document.createElement('div');
    mounted.setAttribute('data-content-search-unit-key', 'turn:2:assistant');
    mounted.innerHTML = '<div data-chatgpt-selection-message-id="b2"></div>';
    let scrolled = false;
    mounted.scrollIntoView = () => { scrolled = true; };
    document.body.appendChild(mounted);
    entry.click();
    assert.equal(scrolled, true);
    assert.equal(document.querySelector('.gpt-toc-preview').hidden, true);
    TocManager.update({ enableFix: { newValue: false } });
  } finally {
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
