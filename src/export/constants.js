/**
 * Configuration constants, class names, and regex patterns used throughout the export module.
 */

import { EXPORT_MESSAGE_TYPE } from '../common/constants.js';

export { EXPORT_MESSAGE_TYPE };
export const EXPORT_ROOT_CLASS = 'gpt-export-root';
export const EXPORT_TURN_CLASS = 'gpt-export-turn';
export const EXPORT_EQUATION_CLASS = 'gpt-export-equation';
export const RTL_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g;
export const LTR_CHAR_REGEX = /[A-Za-z\u00C0-\u024F]/g;
