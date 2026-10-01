import MarkdownIt from 'markdown-it';
import { EXPORT_ROOT_CLASS, EXPORT_TURN_CLASS } from '../constants.js';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });
markdown.renderer.rules.image = (tokens, index) =>
  `<span>[External image: ${markdown.utils.escapeHtml(tokens[index].content || 'image')}]</span>`;
const IMAGE_MARKER = /\uE100IMG(\d+)\uE101/g;

export function renderConversation(messages, { labels = true } = {}) {
  const root = document.createElement('div');
  root.className = EXPORT_ROOT_CLASS;
  for (const message of messages) {
    const turn = document.createElement('section');
    turn.className = EXPORT_TURN_CLASS;
    turn.setAttribute('data-gpt-enhancer-role', message.role);

    if (labels) {
      const label = document.createElement('h3');
      label.className = 'gpt-export-role';
      label.textContent = message.role === 'user' ? 'User' : 'ChatGPT';
      turn.appendChild(label);
    }

    const body = document.createElement('div');
    body.className = 'gpt-export-body';
    body.setAttribute('dir', 'auto');
    message.markdown.split(IMAGE_MARKER).forEach((piece, index) => {
      if (!piece) return;
      if (index % 2 === 1) {
        const url = message.imageUrls?.[Number(piece)];
        if (url) {
          const img = document.createElement('img');
          img.alt = 'Image attachment';
          img.src = url;
          body.appendChild(img);
        } else {
          const placeholder = document.createElement('p');
          placeholder.textContent = '[Image attachment]';
          body.appendChild(placeholder);
        }
      } else {
        const fragment = document.createElement('template');
        fragment.innerHTML = markdown.render(piece);
        body.appendChild(fragment.content);
      }
    });
    turn.appendChild(body);
    root.appendChild(turn);
  }
  return root;
}
