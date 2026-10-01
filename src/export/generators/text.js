/**
 * Generators for text-based formats: Markdown and plain text (TXT).
 */
import { serializeExportRootToPlainText, serializeMessagesToMarkdown } from '../utils/serialization.js';
import { triggerDownload, buildFilename } from '../utils/download.js';

export function exportMessagesAsMarkdown(messages) {
  const markdown = serializeMessagesToMarkdown(messages);
  const blob = new Blob([`${markdown}\n`], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, buildFilename('md'));
}

export function exportAsTxt(root) {
  const text = serializeExportRootToPlainText(root);
  const content = text.endsWith('\n') ? text : `${text}\n`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, buildFilename('txt'));
}
