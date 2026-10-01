import { TocManager } from '../src/content/toc.js';
import { QuickActionManager } from '../src/content/quick-actions/index.js';
import { applyTheme } from '../src/content/theme/index.js';
const id = '00000000-0000-4000-8000-000000000000';
const mapping = { root: { id: 'root', parent: null, message: null } };
for (let i = 0; i < 121; i++) {
  const key = `a${i}`;
  mapping[key] = { id: key, parent: i ? `a${i-1}` : 'root', message: {
    id: key, author: { role: 'assistant' }, recipient: 'all', channel: 'final',
    status: 'finished_successfully', end_turn: true, metadata: {},
    content: { content_type: 'text', parts: [i % 2 ? `# English topic ${i+1}\n\nAn explanation with $x^2+y^2$.` :
      `# مفهوم ${i+1}: مشتق و انتگرال\n\nاین متن فارسی با عبارت English و معادلهٔ \\(x^2+y^2\\) است.\n\n\\[\\frac{d}{dx}x^2=2x\\]\n\n~~~js\nconst x = 2;\n~~~`] }
  } };
}
const originalFetch = window.fetch.bind(window);
window.fetch = (url, options) => url.endsWith('/api/auth/session')
  ? Promise.resolve({ ok: true, json: async () => ({ accessToken: 'synthetic-probe' }) })
  : url.includes('/backend-api/conversation/')
    ? Promise.resolve({ ok: true, json: async () => ({ current_node: 'a120', mapping }) }) : originalFetch(url, options);
window.chrome = { storage: { sync: { set: (patch, done) => { window.__controlSave = patch; done(); } } },
  runtime: { getURL: (path) => `${location.origin}/${path}` } };
history.replaceState(null, '', `/c/${id}`);
applyTheme('original', 'dark');
TocManager.init({ enableFix: true, tableOfContents: true });
QuickActionManager.init({ enableFix: true, exportQuickAction: true });
