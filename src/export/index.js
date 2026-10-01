import { EXPORT_MESSAGE_TYPE } from '../common/constants.js';
import { loadSettings } from '../common/storage.js';
import { loadConversationFromApi } from '../common/conversation-source.js';

const PROGRESS_EVENT = 'GPT_ENHANCER_EXPORT_PROGRESS';
let busy = false;

function progress(status, format, message) {
  document.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { status, format, message } }));
}

export async function handleExportRequest(format = 'pdf', scope = 'all') {
  format = format === 'md' ? 'markdown' : format;
  if (!['pdf', 'docx', 'markdown', 'txt'].includes(format)) format = 'pdf';
  if (!['all', 'assistant'].includes(scope)) scope = 'all';
  if (busy) throw new Error('An export is already in progress. Please wait for it to finish.');
  busy = true;
  let frame;
  const controller = new AbortController();
  const abort = () => controller.abort();
  window.addEventListener('pagehide', abort, { once: true });
  try {
    progress('loading-content', format);
    const { messages, title } = await loadConversationFromApi({ scope, includeAssets: format === 'pdf' || format === 'docx' });
    if (controller.signal.aborted) throw new Error('Export was cancelled.');
    if (format === 'markdown' || format === 'txt') {
      const text = await import('./generators/text.js');
      if (format === 'markdown') text.exportMessagesAsMarkdown(messages);
      else {
        const { renderConversation } = await import('./core/render-conversation.js');
        text.exportAsTxt(renderConversation(messages));
      }
    } else {
      const [{ createExportFrame }, { prepareDocument }, settings] = await Promise.all([
        import('./core/print-frame.js'), import('./core/prepare-document.js'), loadSettings()
      ]);
      frame = await createExportFrame();
      frame.contentDocument.title = title || document.title || 'Conversation notes';
      progress('fonts', format);
      const { root, fontCSS } = await prepareDocument(frame.contentDocument, messages, {
        settings, signal: controller.signal, embedFonts: format === 'docx'
      });
      progress('generating', format);
      if (format === 'pdf') {
        const { exportAsPdf } = await import('./generators/pdf.js');
        await exportAsPdf(root, root, { signal: controller.signal });
      } else {
        const { exportAsDocx } = await import('./generators/docx.js');
        await exportAsDocx(root, root, { fontCSS });
      }
    }
    document.dispatchEvent(new CustomEvent('GPT_ENHANCER_EXPORT_SUCCESS'));
    progress('done', format);
  } finally {
    frame?.remove();
    window.removeEventListener('pagehide', abort);
    busy = false;
    progress('cleanup', format);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== EXPORT_MESSAGE_TYPE) return;
  handleExportRequest(message.format, message.scope).then(() => sendResponse({ ok: true })).catch((error) => {
    progress('error', message.format, error.message);
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});
document.addEventListener('GPT_ENHANCER_EXPORT_REQUEST', (event) => {
  handleExportRequest(event.detail?.format, event.detail?.scope).catch((error) => {
    progress('error', event.detail?.format, error.message);
  });
});
