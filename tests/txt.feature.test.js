import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeExportRootToPlainText } from '../src/export/utils/serialization.js';
import { setupDom } from './helpers/dom.js';

function createTurn(role = 'user') {
  const turn = document.createElement('article');
  turn.setAttribute('data-message-author-role', role);
  return turn;
}

test('txt export separates messages with dividers and emits plain text without markdown syntax', () => {
  const { cleanup } = setupDom();
  document.title = 'Txt Test';

  const root = document.createElement('div');
  const user = createTurn('user');
  user.innerHTML = '<p>Hello world</p>';
  const assistant = createTurn('assistant');
  assistant.innerHTML =
    '<h2>Section</h2><p>Answer text</p><pre class="language-js"><code>const x = 1;</code></pre>';
  root.appendChild(user);
  root.appendChild(assistant);

  const output = serializeExportRootToPlainText(root);

  assert.ok(output.startsWith('Txt Test'));
  assert.equal(output.includes('User:'), false);
  assert.ok(output.includes('────────────────────'));
  assert.ok(output.includes('Hello world'));
  assert.equal(output.includes('ChatGPT:'), false);
  assert.ok(output.includes('Section'));
  assert.ok(output.includes('Answer text'));
  assert.ok(output.includes('const x = 1;'));
  // Plain text must not carry markdown heading or code-fence syntax.
  assert.equal(output.includes('##'), false);
  assert.equal(output.includes('```'), false);

  cleanup();
});

test('txt export skips empty turns', () => {
  const { cleanup } = setupDom();
  document.title = 'Txt Test';

  const root = document.createElement('div');
  const empty = createTurn('user');
  empty.innerHTML = '<p>   </p>';
  const filled = createTurn('assistant');
  filled.innerHTML = '<p>Real content</p>';
  root.appendChild(empty);
  root.appendChild(filled);

  const output = serializeExportRootToPlainText(root);

  assert.ok(output.includes('Real content'));
  assert.equal((output.match(/Real content/g) || []).length, 1);
  assert.equal(output.includes('User:'), false);

  cleanup();
});
