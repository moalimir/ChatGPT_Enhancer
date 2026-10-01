import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const probe = readFileSync(new URL('../spikes/isolated-world-fetch/probe.js', import.meta.url), 'utf8');

test('live contract probe counts the active branch without logging private values', async () => {
  const dom = new JSDOM('<main><div data-turn-key="turn"><div data-content-search-unit-key="turn:assistant" data-chatgpt-selection-message-id="private-id"></div></div></main>', {
    url: 'https://chatgpt.com/c/00000000-0000-0000-0000-000000000001'
  });
  const logs = [];
  const mapping = {
    root: { parent: null, message: null },
    user: { parent: 'root', message: { author: { role: 'user' } } },
    hidden: { parent: 'user', message: { author: { role: 'assistant' }, metadata: { is_visually_hidden_from_conversation: true } } },
    latest: { parent: 'hidden', message: { author: { role: 'assistant' }, metadata: { channel: 'final' } } },
    alternate: { parent: 'root', message: { author: { role: 'assistant' } } }
  };
  const fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => url.endsWith('/api/auth/session')
      ? { accessToken: 'private-token' }
      : { mapping, current_node: 'latest', title: 'private-title' }
  });

  await runInNewContext(probe, {
    location: dom.window.location,
    document: dom.window.document,
    fetch,
    console: { log: (...args) => logs.push(args) },
    Set
  });

  assert.equal(logs.length, 1);
  const output = logs[0].join(' ');
  assert.equal(output.includes('private-'), false);
  const result = JSON.parse(logs[0][1]);
  assert.deepEqual(result.api, {
    sessionStatus: 200,
    hasToken: true,
    conversationStatus: 200,
    shapeValid: true,
    branchNodes: 4,
    branchMessages: 3,
    visibleUser: 1,
    visibleAssistant: 1,
    ok: true
  });
  assert.equal(result.dom.newUnits, 1);
  assert.equal(result.dom.messagesWithId, 1);
});
