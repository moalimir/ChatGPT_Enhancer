import { DEFAULT_SETTINGS } from '../common/config.js';
import { saveSettings } from '../common/storage.js';
import { selectedFonts } from '../common/fonts.js';
import { textDirection } from '../common/direction.js';
import { conversationIdFromUrl, loadConversationFromApi } from '../common/conversation-source.js';
import { getMessageId, getScrollHost, revealMessage, selectMessageNodes } from './selectors.js';
import { attachFloatingPanel } from './floating-panel.js';

let settings = { ...DEFAULT_SETTINGS };
let routeId = null;
let panel, list, status, toggle, body, floating, sizeObserver;
let messages = [];
let opened = false;
let loadNumber = 0;
let navigation;
let listening = false;
let sizeTimer;
let checkVisibility;
let highlighted, highlightTimer;

function enabled() { return Boolean(settings.enableFix && settings.tableOfContents); }
function cancelNavigation() { navigation?.abort(); navigation = null; checkVisibility = null; }
function clearHighlight() {
  clearTimeout(highlightTimer);
  highlighted?.classList.remove('gpt-toc-target'); highlighted = null;
}
function highlight(node) {
  clearHighlight();
  void node.offsetWidth; // Restart the CSS fade when the same reply is selected again.
  node.classList.add('gpt-toc-target'); highlighted = node;
  highlightTimer = setTimeout(clearHighlight, 2000);
}
async function activate(message, button) {
  cancelNavigation(); clearHighlight();
  const controller = new AbortController();
  navigation = controller;
  list.querySelector('.is-active')?.classList.remove('is-active');
  button.classList.add('is-active');
  status.textContent = 'Finding reply…';
  const cancel = () => controller.abort();
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  events.forEach((event) => window.addEventListener(event, cancel, { passive: true, capture: true }));
  let shown = false;
  const highlightVisible = () => {
    if (shown || controller.signal.aborted) return;
    const mounted = selectMessageNodes().nodes.find((node) => getMessageId(node) === message.id);
    if (!mounted) return;
    const host = getScrollHost(mounted);
    const viewportTop = Math.max(0, host?.getBoundingClientRect().top || 0);
    const viewportBottom = Math.min(window.innerHeight, viewportTop + (host?.clientHeight || window.innerHeight));
    const top = mounted.getBoundingClientRect().top;
    if (top < viewportTop || top >= viewportBottom) return;
    shown = true; highlight(mounted);
    window.removeEventListener('scroll', highlightVisible, true);
  };
  checkVisibility = highlightVisible;
  window.addEventListener('scroll', highlightVisible, { passive: true, capture: true });
  highlightVisible();
  let error;
  try {
    await revealMessage(message.id, messages.map((entry) => entry.id), { signal: controller.signal });
    controller.signal.throwIfAborted();
    highlightVisible();
  } catch (failure) {
    if (!controller.signal.aborted) error = failure.message;
  } finally {
    events.forEach((event) => window.removeEventListener(event, cancel, true));
    window.removeEventListener('scroll', highlightVisible, true);
    if (checkVisibility === highlightVisible) checkVisibility = null;
    if (navigation === controller) {
      navigation = null;
      if (status) status.textContent = error || `${messages.length} replies`;
    }
  }
}
function outlineTitle(parser, source, number) {
  const tokens = parser.parse(source, {});
  const heading = tokens.findIndex((token) => token.type === 'heading_open');
  const inline = heading >= 0 ? tokens[heading + 1] : tokens.find((token) => token.type === 'inline');
  const title = (inline?.children?.filter((token) => token.type !== 'image')
    .map((token) => token.content).join('') || `Reply ${number}`).replace(/\s+/g, ' ').trim();
  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
}
function render() {
  list.replaceChildren();
  const fragment = document.createDocumentFragment();
  messages.forEach((message, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'gpt-toc-entry';
    button.dir = textDirection(message.title);
    const number = document.createElement('span');
    number.className = 'gpt-toc-number'; number.textContent = String(index + 1);
    const title = document.createElement('span'); title.textContent = message.title;
    button.append(number, title);
    button.addEventListener('click', () => void activate(message, button));
    item.appendChild(button); fragment.appendChild(item);
  });
  list.appendChild(fragment);
  status.textContent = `${messages.length} replies`;
}
async function load() {
  if (!panel || !opened || !routeId) return;
  const request = ++loadNumber;
  cancelNavigation();
  status.textContent = 'Loading contents…';
  try {
    const [result, { default: MarkdownIt }] = await Promise.all([
      loadConversationFromApi({ scope: 'assistant' }), import('markdown-it')
    ]);
    if (request !== loadNumber || !panel || !opened || conversationIdFromUrl() !== routeId) return;
    const parser = new MarkdownIt();
    messages = result.messages.map((message, index) => ({ id: message.id,
      title: outlineTitle(parser, message.markdown.replace(/\uE100IMG\d+\uE101/g, '[Image attachment]'), index + 1) }));
    render();
  } catch {
    if (request !== loadNumber || !panel) return;
    messages = []; list.replaceChildren();
    status.textContent = 'Contents unavailable. Refresh after the reply finishes.';
  }
}
function applySize() {
  const size = settings.tocSize;
  if (!panel || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height)) return;
  panel.style.width = `${Math.min(420, Math.max(190, size.width))}px`;
  panel.style.height = `${Math.min(window.innerHeight * .72, Math.max(180, size.height))}px`;
}
function setOpen(next) {
  opened = next;
  body.hidden = !opened;
  panel.classList.toggle('is-collapsed', !opened);
  toggle.setAttribute('aria-expanded', String(opened));
  toggle.setAttribute('aria-label', opened ? 'Collapse contents' : 'Expand contents');
  toggle.textContent = opened ? '−' : '+';
  floating.layout();
  if (opened && !messages.length) void load();
  if (!opened) cancelNavigation();
}
function ensurePanel() {
  if (panel?.isConnected || !document.body) return;
  panel = document.createElement('aside'); panel.className = 'gpt-toc is-collapsed';
  panel.setAttribute('aria-label', 'Conversation contents');
  const header = document.createElement('div'); header.className = 'gpt-toc-header';
  header.setAttribute('aria-label', 'Move contents with arrow keys');
  const heading = document.createElement('span'); heading.className = 'gpt-toc-title'; heading.textContent = 'Contents';
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'gpt-toc-refresh';
  refresh.textContent = '↻'; refresh.title = 'Refresh contents'; refresh.setAttribute('aria-label', 'Refresh contents');
  refresh.addEventListener('click', () => void load());
  toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'gpt-toc-toggle';
  body = document.createElement('div'); body.className = 'gpt-toc-body'; body.id = 'gpt-enhancer-toc-body'; body.hidden = true;
  toggle.setAttribute('aria-controls', body.id);
  status = document.createElement('p'); status.className = 'gpt-toc-status'; status.setAttribute('aria-live', 'polite');
  list = document.createElement('ol'); list.className = 'gpt-toc-list';
  body.append(status, list); header.append(heading, refresh, toggle); panel.append(header, body);
  document.body.appendChild(panel);
  floating = attachFloatingPanel(panel, header, {
    position: settings.tocPosition || { side: 'right', y: 0.12 },
    onSave: (position) => { settings.tocPosition = position; return saveSettings({ tocPosition: position }); }
  });
  toggle.addEventListener('click', () => setOpen(!opened));
  header.addEventListener('click', (event) => { if (!opened && !event.target.closest('button')) setOpen(true); });
  panel.style.fontFamily = selectedFonts(settings).stack;
  applySize(); setOpen(false);
  if (typeof ResizeObserver === 'function') {
    sizeObserver = new ResizeObserver(() => {
      clearTimeout(sizeTimer);
      if (!opened) return;
      sizeTimer = setTimeout(() => {
        const width = panel.getBoundingClientRect().width;
        const height = panel.getBoundingClientRect().height;
        if (width < 190 || height < 180) return;
        if (settings.tocSize?.width === width && settings.tocSize?.height === height) return;
        settings.tocSize = { width, height };
        void saveSettings({ tocSize: settings.tocSize }).catch(() => {});
      }, 250);
    });
    sizeObserver.observe(panel);
  }
}
function removePanel() {
  ++loadNumber; cancelNavigation(); clearHighlight(); clearTimeout(sizeTimer);
  sizeObserver?.disconnect(); sizeObserver = null;
  floating?.dispose(); floating = null;
  panel?.remove(); panel = list = status = toggle = body = null;
  messages = []; opened = false;
}
function syncRoute() {
  const nextId = enabled() ? conversationIdFromUrl() : null;
  if (nextId !== routeId) {
    routeId = nextId; ++loadNumber; messages = []; cancelNavigation(); clearHighlight();
    list?.replaceChildren(); if (status) status.textContent = '';
    if (opened && nextId) void load();
  }
  if (nextId) ensurePanel(); else removePanel();
}
function syncNavigation() { setTimeout(syncRoute, 0); }
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
    for (const key of ['enableFix', 'tableOfContents', 'tocPosition', 'tocSize', 'fontsEnabled', 'fontEnglish', 'fontPersian']) {
      if (changes?.[key]) settings[key] = changes[key].newValue;
    }
    syncRoute(); floating?.update(settings.tocPosition); applySize();
    if (panel) panel.style.fontFamily = selectedFonts(settings).stack;
  },
  handleMutations() { if (enabled()) { syncRoute(); checkVisibility?.(); } },
  syncRoute
};
