/**
 * Registry and factory method for instantiating the appropriate export generator.
 */
import { exportAsDocx } from './docx.js';
import { exportAsMarkdown, exportAsTxt } from './text.js';
import { exportAsPdf } from './pdf.js';

const registry = {
  docx: exportAsDocx,
  markdown: exportAsMarkdown,
  txt: exportAsTxt,
  pdf: exportAsPdf
};

export function getGenerator(format) {
  return registry[format] || null;
}
