import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { activeBranch, loadConversationFromApi, normalizeMessages } from '../src/common/conversation-source.js';
import { renderConversation } from '../src/export/core/render-conversation.js';
import { serializeMessagesToMarkdown, serializeExportRootToPlainText } from '../src/export/utils/serialization.js';
import { setupDom } from './helpers/dom.js';
import { getMessageRole, selectMessageNodes } from '../src/content/selectors.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/conversations/${name}.json`, import.meta.url)));

test('API source follows the visible active branch and rejects broken graphs', () => {
  const branched = normalizeMessages(fixture('branched'));
  assert.deepEqual(branched.map((message) => message.id), ['n1', 'b2', 'b3']);
  assert.deepEqual(normalizeMessages(fixture('hidden-content')).map((message) => message.id), ['u1', 'a1', 'u2']);
  assert.deepEqual(normalizeMessages(fixture('hidden-content'), 'assistant').map((message) => message.id), ['a1']);
  assert.throws(() => activeBranch(fixture('cycle')), /broken conversation branch/);
  assert.throws(() => activeBranch(fixture('broken-parent')), /broken conversation branch/);
});

test('finished reasoning recaps stay out of the exported branch', () => {
  const conversation = fixture('branched');
  conversation.mapping.recap = {
    parent: 'n1',
    message: {
      id: 'recap', author: { role: 'assistant' }, recipient: 'all',
      status: 'finished_successfully', end_turn: false,
      content: { content_type: 'reasoning_recap', parts: [] }, metadata: {}
    }
  };
  conversation.mapping.b2.parent = 'recap';
  assert.deepEqual(normalizeMessages(conversation).map(({ id }) => id), ['n1', 'b2', 'b3']);
  conversation.current_node = 'recap';
  assert.throws(() => normalizeMessages(conversation), /finish responding/);
});

test('API transcript renders every turn for visual and text export without running raw HTML', () => {
  const { cleanup } = setupDom();
  const messages = Array.from({ length: 120 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    markdown: index === 1 ? '# Heading\n\n```js\nconst x = 1;\n```\n\n<script>alert(1)</script>\n\n![remote](https://example.com/track)' : `Turn ${index}`,
    images: []
  }));
  const root = renderConversation(messages);
  assert.equal(root.children.length, 120);
  assert.equal(root.querySelectorAll('script').length, 0);
  assert.equal(root.querySelectorAll('img').length, 0);
  assert.equal(root.querySelectorAll('pre code').length, 1);
  assert.match(serializeExportRootToPlainText(root), /Turn 119/);
  assert.match(serializeMessagesToMarkdown(messages), /---\n\n# Heading/);
  cleanup();
});

test('mounted message selector recognizes current units without selecting page chrome', () => {
  const { cleanup } = setupDom();
  document.body.innerHTML = '<main><article>Page chrome</article><div data-content-search-unit-key="turn:0:user"></div><div data-content-search-unit-key="turn:2:assistant"></div></main>';
  const nodes = selectMessageNodes().nodes;
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes.map(getMessageRole), ['user', 'assistant']);
  cleanup();
});

test('API source keeps code, citations, and image placeholders', () => {
  assert.match(normalizeMessages(fixture('code'))[1].markdown, /```python\nprint\("hello world"\)\n```/);
  assert.match(normalizeMessages(fixture('citations'))[1].markdown, /\[source\]\(https:\/\/example\.com\/a\)/);
  const image = normalizeMessages(fixture('multimodal-image'));
  assert.equal(image[0].images.length, 1);
  assert.match(image[0].markdown, /\uE100IMG0\uE101/);
  assert.match(image[1].markdown, /متن فارسی/);
  assert.throws(() => normalizeMessages(fixture('empty-and-unknown')), /unsupported message/);
  assert.throws(() => normalizeMessages(fixture('streaming-incomplete')), /finish responding/);
});

test('API source resolves visual attachments only during a requested export', async () => {
  const conversation = fixture('multimodal-image');
  global.location = {
    href: `https://chatgpt.com/c/${conversation.conversation_id}`,
    origin: 'https://chatgpt.com'
  };
  global.document = { cookie: '', title: 'Test' };
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => url.endsWith('/api/auth/session') ? { accessToken: 'private-token' } :
        url.includes('/files/download/') ? { download_url: 'https://chatgpt.com/image.png' } : conversation
    };
  };
  try {
    const result = await loadConversationFromApi({ includeAssets: true });
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].imageUrls[0], 'https://chatgpt.com/image.png');
    assert.equal(requests.filter(({ url }) => url.includes('/files/download/')).length, 2);
    assert.equal(requests[1].options.headers.Authorization, 'Bearer private-token');
  } finally {
    delete global.fetch;
    delete global.location;
    delete global.document;
  }
});
