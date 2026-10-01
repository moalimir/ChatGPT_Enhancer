import MarkdownIt from 'markdown-it';
import { tex } from '@mdit/plugin-tex';
import { renderToString } from 'katex';
import { applyDocumentDirection, textDirection } from '../../common/direction.js';
import { EXPORT_ROOT_CLASS, EXPORT_TURN_CLASS } from '../constants.js';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });
markdown.use(tex, {
  delimiters: 'all',
  render(source, displayMode) {
    // No page HTML, trusted TeX commands, persistent macros, or source logging.
    // KaTeX's HTML fonts have no Arabic metrics. Native MathML shapes these labels.
    const native = /\p{Script=Arabic}/u.test(source);
    const html = renderToString(source, { displayMode, throwOnError: false, trust: false,
      output: native ? 'mathml' : 'htmlAndMathml', strict: 'ignore', maxExpand: 1000, maxSize: 20 });
    const equation = native ? `<span class="gpt-export-native-math">${html}</span>` : html;
    return displayMode ? `<div class="gpt-export-math">${equation}</div>\n` : equation;
  }
});
markdown.renderer.rules.image = (tokens, index) =>
  `<span>[External image: ${markdown.utils.escapeHtml(tokens[index].content || 'image')}]</span>`;
const IMAGE_MARKER = /\uE100IMG(\d+)\uE101/g;

export function renderConversation(messages, { targetDocument = document } = {}) {
  const root = targetDocument.createElement('div');
  root.className = EXPORT_ROOT_CLASS;
  for (const message of messages) {
    const turn = targetDocument.createElement('section');
    turn.className = EXPORT_TURN_CLASS;
    turn.setAttribute('data-gpt-enhancer-role', message.role);

    const body = targetDocument.createElement('div');
    body.className = 'gpt-export-body';
    body.setAttribute('dir', 'auto');
    message.markdown.split(IMAGE_MARKER).forEach((piece, index) => {
      if (!piece) return;
      if (index % 2 === 1) {
        const url = message.imageUrls?.[Number(piece)];
        if (url) {
          const img = targetDocument.createElement('img');
          img.alt = 'Image attachment';
          img.src = url;
          body.appendChild(img);
        } else {
          const placeholder = targetDocument.createElement('p');
          placeholder.textContent = '[Image attachment]';
          body.appendChild(placeholder);
        }
      } else {
        const fragment = targetDocument.createElement('template');
        fragment.innerHTML = markdown.render(piece);
        body.appendChild(fragment.content);
      }
    });
    turn.appendChild(body);
    root.appendChild(turn);
  }
  applyDocumentDirection(root);
  root.querySelectorAll('.gpt-export-native-math mtext').forEach((label) => {
    label.setAttribute('dir', textDirection(label.textContent) === 'rtl' ? 'rtl' : 'ltr');
  });
  return root;
}
