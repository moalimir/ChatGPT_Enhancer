/**
 * Registry and factory method for instantiating the appropriate export generator.
 */
import { exportAsDocx } from './docx.js';
import { exportAsTxt } from './text.js';
import { exportAsPdf } from './pdf.js';

const registry = {
  docx: exportAsDocx,
  txt: exportAsTxt,
  pdf: exportAsPdf
};

export function getGenerator(format) {
  return registry[format] || null;
}
