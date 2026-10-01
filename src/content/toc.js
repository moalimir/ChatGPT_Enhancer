import { DEFAULT_SETTINGS } from '../common/config.js';
import { conversationIdFromUrl, loadConversationFromApi } from '../export/core/conversation-source.js';
import { getMessageId, getMessageRole, selectMessageNodes } from './selectors.js';

let settings = { ...DEFAULT_SETTINGS };
let routeId = null;
let panel = null;
let list = null;
let status = null;
let preview = null;
let toggle = null;
let messages = [];
let opened = false;
let loadNumber = 0;
let listening = false;

function enabled() {
  return Boolean(settings.enableFix && settings.tableOfContents);
}

function titleFor(markdown, number) {
  const lines = String(markdown || '').replace(/\uE100IMG\d+\uE101/g, '').split('\n');
  const heading = lines.slice(0, 12).find((line) => /^#{1,6}\s+\S/.test(line));
  const first = heading || lines.find((line) => line.trim() && !/^```|^~~~/.test(line));
  const title = (first || `Reply ${number}`).replace(/^#{1,6}\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
  return title.length > 70 ? `${title.slice(0, 69)}…` : title;
}

function findMounted(id) {
  if (!id) return null;
  return selectMessageNodes().nodes.find((node) => getMessageRole(node) === 'assistant' && getMessageId(node) === id) || null;
}

function render() {
  if (!list) return;
  list.replaceChildren();
  const fragment = document.createDocumentFragment();
  messages.forEach((message, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gpt-toc-entry';
    button.textContent = `${index + 1}. ${message.title}`;
    button.addEventListener('click', () => {
      const mounted = findMounted(message.id);
      if (mounted) {
        preview.hidden = true;
        mounted.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mounted.classList.add('gpt-toc-target');
        setTimeout(() => mounted.classList.remove('gpt-toc-target'), 1600);
      } else {
        preview.hidden = false;
        preview.textContent = message.preview;
        preview.focus();
      }
    });
    item.appendChild(button);
    fragment.appendChild(item);
  });
  list.appendChild(fragment);
  status.textContent = `${messages.length} replies in this branch`;
}

async function load() {
  if (!panel || !opened || !routeId) return;
  const request = ++loadNumber;
  status.textContent = 'Loading contents…';
  try {
    const result = await loadConversationFromApi({ scope: 'assistant' });
    if (request !== loadNumber || !panel || !opened || conversationIdFromUrl() !== routeId) return;
    messages = result.messages.map((message, index) => ({
      id: message.id,
      title: titleFor(message.markdown, index + 1),
      preview: message.markdown.replace(/\uE100IMG\d+\uE101/g, '[Image]').slice(0, 2400) || '[Image]'
    }));
    render();
  } catch {
    if (request !== loadNumber || !panel) return;
    messages = [];
    list.replaceChildren();
    status.textContent = 'Contents unavailable. Try Refresh after the reply finishes.';
  }
}

function ensurePanel() {
  if (panel?.isConnected || !document.body) return;
  panel = document.createElement('aside');
  panel.className = 'gpt-toc';
  panel.setAttribute('aria-label', 'Conversation contents');
  toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'gpt-toc-toggle';
  toggle.textContent = 'Contents';
  toggle.setAttribute('aria-expanded', 'false');
  const body = document.createElement('div');
  body.className = 'gpt-toc-body';
  body.id = 'gpt-enhancer-toc-body';
  toggle.setAttribute('aria-controls', body.id);
  body.hidden = true;
  const header = document.createElement('div');
  header.className = 'gpt-toc-header';
  const heading = document.createElement('strong');
  heading.textContent = 'Conversation contents';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Refresh';
  refresh.addEventListener('click', () => void load());
  header.append(heading, refresh);
  status = document.createElement('p');
  status.className = 'gpt-toc-status';
  status.setAttribute('aria-live', 'polite');
  list = document.createElement('ol');
  list.className = 'gpt-toc-list';
  preview = document.createElement('div');
  preview.className = 'gpt-toc-preview';
  preview.hidden = true;
  preview.dir = 'auto';
  preview.tabIndex = -1;
  preview.setAttribute('role', 'region');
  preview.setAttribute('aria-label', 'Reply preview');
  body.append(header, status, list, preview);
  panel.append(toggle, body);
  toggle.addEventListener('click', () => {
    opened = !opened;
    body.hidden = !opened;
    toggle.setAttribute('aria-expanded', String(opened));
    if (opened && !messages.length) void load();
  });
  document.body.appendChild(panel);
}

function removePanel() {
  ++loadNumber;
  panel?.remove();
  panel = list = status = preview = toggle = null;
  messages = [];
  opened = false;
}

function syncRoute() {
  const nextId = enabled() ? conversationIdFromUrl() : null;
  if (nextId !== routeId) {
    routeId = nextId;
    ++loadNumber;
    messages = [];
    if (list) list.replaceChildren();
    if (preview) preview.hidden = true;
    if (status) status.textContent = '';
    if (opened && nextId) void load();
  }
  if (nextId) ensurePanel();
  else removePanel();
}

function syncNavigation() {
  setTimeout(syncRoute, 0);
}

export const TocManager = {
  init(next) {
    settings = { ...settings, ...(next || {}) };
    if (!listening) {
      window.addEventListener('popstate', syncNavigation);
      window.navigation?.addEventListener('navigate', syncNavigation);
      listening = true;
    }
    syncRoute();
  },
  update(changes) {
    for (const key of ['enableFix', 'tableOfContents']) {
      if (changes?.[key]) settings[key] = changes[key].newValue;
    }
    syncRoute();
  },
  handleMutations() {
    if (enabled()) syncRoute();
  },
  syncRoute
};
