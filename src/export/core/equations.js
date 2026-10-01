import { toPng } from 'html-to-image';
import { EXPORT_EQUATION_CLASS } from '../constants.js';

// Word cannot import KaTeX's HTML layout. Rasterize only the equations, including inline/table math.
export async function convertKatexToImages(root, fontEmbedCSS) {
  for (const node of root.querySelectorAll('.katex')) {
    const target = node.closest('.gpt-export-native-math') ? node.querySelector('math') : node;
    const bounds = target.getBoundingClientRect();
    const latex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent || '';
    try {
      const dataUrl = await toPng(target, { pixelRatio: 2, backgroundColor: '#fff', fontEmbedCSS,
        width: Math.ceil(bounds.width), height: Math.ceil(bounds.height),
        style: { display: 'inline-block', margin: '0', direction: 'ltr' } });
      const image = root.ownerDocument.createElement('img');
      image.src = dataUrl; image.alt = `TeX: ${latex}`; image.className = EXPORT_EQUATION_CLASS;
      image.width = Math.ceil(bounds.width); image.height = Math.ceil(bounds.height);
      image.style.cssText = 'display:inline-block;vertical-align:middle;max-width:100%;height:auto;direction:ltr';
      node.replaceWith(image);
    } catch {
      throw new Error('An equation could not be prepared for Word. Try PDF or Markdown.');
    }
  }
}
