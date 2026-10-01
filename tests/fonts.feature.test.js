import assert from 'node:assert/strict';
import test from 'node:test';

import { FONT_STACKS } from '../src/common/config.js';
import { setupDom } from './helpers/dom.js';

let fontModuleCounter = 0;
async function loadFontModule() {
  fontModuleCounter += 1;
  const url = new URL(`../src/content/fonts/index.js?test=${fontModuleCounter}`, import.meta.url);
  return import(url.href);
}

function createMessage(text) {
  const message = document.createElement('article');
  message.setAttribute('data-testid', 'conversation-turn');
  message.textContent = text;
  return message;
}

test('font stack prefers English for mixed Persian messages', async () => {
  const { cleanup } = setupDom();
  const { FontManager, applyFontsToMessage } = await loadFontModule();

  FontManager.setMessageSelector('[data-testid="conversation-turn"]');
  FontManager.apply({ enableFix: true, fontsEnabled: true, fontEnglish: 'inter', fontPersian: 'vazirmatn' });

  const englishStack = FONT_STACKS.english.inter;
  const persianStack = FONT_STACKS.persian.vazirmatn;
  const expected = '"Inter", "Vazirmatn", system-ui, sans-serif';

  const message = createMessage('سلام Hello');
  applyFontsToMessage(message, { english: englishStack, persian: persianStack });

  assert.ok(message.classList.contains('chatgpt-font-message'));
  assert.ok(message.classList.contains('chatgpt-font-persian'));
  assert.equal(message.style.getPropertyValue('--chatgpt-font-message-persian'), expected);
  assert.equal(message.style.getPropertyValue('--font-body'), expected);

  cleanup();
});

test('english-only messages keep the English stack and no Persian override', async () => {
  const { cleanup } = setupDom();
  const { FontManager, applyFontsToMessage } = await loadFontModule();

  FontManager.setMessageSelector('[data-testid="conversation-turn"]');
  FontManager.apply({ enableFix: true, fontsEnabled: true, fontEnglish: 'inter', fontPersian: 'vazirmatn' });

  const englishStack = FONT_STACKS.english.inter;
  const persianStack = FONT_STACKS.persian.vazirmatn;

  const message = createMessage('Hello world');
  applyFontsToMessage(message, { english: englishStack, persian: persianStack });

  assert.ok(message.classList.contains('chatgpt-font-message'));
  assert.equal(message.classList.contains('chatgpt-font-persian'), false);
  assert.equal(message.style.getPropertyValue('--font-body'), englishStack);
  assert.equal(message.style.getPropertyValue('--chatgpt-font-message-persian'), '');

  cleanup();
});
