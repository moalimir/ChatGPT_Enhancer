import { renderConversation } from './render-conversation.js';
import { selectedFonts, loadDocumentFonts, fontEmbedCSS } from '../../common/fonts.js';
import { EXPORT_STYLE_BLOCK } from '../styles.js';
import { inlineImages } from './images.js';

// Shared by print and DOCX. Readiness belongs to this document.
export async function prepareDocument(targetDocument, messages, { settings = {}, signal, embedFonts = false } = {}) {
  const root = renderConversation(messages, { targetDocument });
  const style = targetDocument.createElement('style');
  style.textContent = EXPORT_STYLE_BLOCK;
  const fonts = selectedFonts(settings);
  let definitions = fonts.definitions;
  root.style.setProperty('--gpt-export-font', fonts.stack);
  root.style.fontFamily = fonts.stack; // Also carried in Word's imported HTML.
  targetDocument.head.appendChild(style);
  targetDocument.body.appendChild(root);
  try {
    await loadDocumentFonts(targetDocument, fonts.definitions);
    if (root.querySelector('.katex')) {
      const { MATH_STYLE, MATH_FONTS, loadMathFonts } = await import('./math-assets.js');
      style.textContent += MATH_STYLE;
      await loadMathFonts(targetDocument);
      definitions = [...definitions, ...MATH_FONTS];
    }
    const errors = root.querySelectorAll('.katex-error').length;
    if (errors) throw new Error(`${errors} equation(s) could not be rendered. Export Markdown to preserve their source.`);
    await inlineImages(root, { signal });
    if (root.querySelector('img:not([src^="data:"])')) throw new Error('An image could not be embedded. Please retry.');
    await Promise.all(Array.from(root.querySelectorAll('img'), (img) => img.decode()));
    if (signal?.aborted) throw new Error('Export was cancelled.');
    await targetDocument.fonts.ready;
    return { root, fontCSS: embedFonts ? await fontEmbedCSS(definitions) : '',
      dispose: () => { root.remove(); style.remove(); } };
  } catch (error) {
    root.remove(); style.remove();
    throw error;
  }
}
