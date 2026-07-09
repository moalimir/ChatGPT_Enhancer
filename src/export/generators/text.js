/**
 * Generators for text-based formats: Markdown and plain text (TXT).
 */
import { serializeExportRootToMarkdown, serializeExportRootToPlainText } from '../utils/serialization.js';
import { triggerDownload, buildFilename } from '../utils/download.js';

export function exportAsMarkdown(root) {
  const markdown = serializeExportRootToMarkdown(root);
  const content = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, buildFilename('md'));
}

export function exportAsTxt(root) {
  const text = serializeExportRootToPlainText(root);
  const content = text.endsWith('\n') ? text : `${text}\n`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, buildFilename('txt'));
}
