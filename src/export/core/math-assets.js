import css from 'katex/dist/katex.min.css?raw';
import { loadDocumentFonts } from '../../common/fonts.js';

// Package only WOFF2; all math resources ship with the extension.
const urls = import.meta.glob('../../../node_modules/katex/dist/fonts/*.woff2', {
  eager: true, query: '?url', import: 'default'
});
export const MATH_FONTS = [];
export const MATH_STYLE = css.replace(/@font-face\{([^}]+)\}/g, (_rule, descriptors) => {
  const file = descriptors.match(/url\(fonts\/([^)]*\.woff2)\)/)?.[1];
  const path = Object.entries(urls).find(([key]) => key.endsWith(`/${file}`))?.[1];
  if (!path) throw new Error('A bundled math font is missing.');
  MATH_FONTS.push({
    family: descriptors.match(/font-family:([^;]+)/)[1],
    weight: descriptors.match(/font-weight:([^;]+)/)[1],
    style: descriptors.match(/font-style:([^;]+)/)[1], path
  });
  return '';
});

export function loadMathFonts(targetDocument) {
  return loadDocumentFonts(targetDocument, MATH_FONTS);
}
