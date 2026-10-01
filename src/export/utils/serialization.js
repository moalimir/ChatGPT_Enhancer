/**
 * Serialization helpers for exports.
 *
 * Responsibilities:
 * - Traverse the sanitized export DOM and emit structured JSON/Markdown/CSV representations.
 * - Preserve layout semantics (blocks, lists, tables, equations, RTL) even when ChatGPT's DOM shifts.
 * - Normalize text (strip zero-width chars, collapse whitespace) for stable downstream formatting.
 * - Handle block/inline nuances (code, images, tables, equations) and flatten tables for CSV.
 *
 * Key considerations:
 * - JSON_BLOCK_LEVEL_SELECTOR + display heuristics keep paragraphs separate across DOM variants.
 * - blockToPlainText/blocksToPlainText are used by CSV/text exporters; keep changes compatible.
 * - Equation nodes and images are sanitized earlier; serializers avoid mutating the DOM.
 */

import { EXPORT_EQUATION_CLASS, RTL_CHAR_REGEX, LTR_CHAR_REGEX } from '../constants.js';
import { getMessageRole } from '../../content/selectors.js';

// Broader block selector helps preserve structure when ChatGPT wraps text in generic containers.
const JSON_BLOCK_LEVEL_SELECTOR = [
  'p',
  'div',
  'section',
  'article',
  'main',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'table',
  'hr',
  'figure',
  '.katex',
  '.' + EXPORT_EQUATION_CLASS
].join(', ');
const KATEX_DISPLAY_SELECTOR = '.katex-display';
const BLOCK_EQUATION_TAGS = new Set(['div']);

const MARKDOWN_BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'canvas',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'noscript',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'thead',
  'tfoot',
  'ul'
]);

const INLINE_BLOCK_SELECTOR = Array.from(MARKDOWN_BLOCK_TAGS).join(', ');

const MARKDOWN_CODE_LANGUAGE_REGEX = /language-([a-z0-9+-]+)/i;

const SUPERSCRIPT_MAP = {
  '0': '\u2070',
  '1': '\u00b9',
  '2': '\u00b2',
  '3': '\u00b3',
  '4': '\u2074',
  '5': '\u2075',
  '6': '\u2076',
  '7': '\u2077',
  '8': '\u2078',
  '9': '\u2079',
  '+': '\u207a',
  '-': '\u207b',
  '=': '\u207c',
  '(': '\u207d',
  ')': '\u207e'
};

const SUBSCRIPT_MAP = {
  '0': '\u2080',
  '1': '\u2081',
  '2': '\u2082',
  '3': '\u2083',
  '4': '\u2084',
  '5': '\u2085',
  '6': '\u2086',
  '7': '\u2087',
  '8': '\u2088',
  '9': '\u2089',
  '+': '\u208a',
  '-': '\u208b',
  '=': '\u208c',
  '(': '\u208d',
  ')': '\u208e'
};

function serializeInlineFragmentsExcludingBlocks(container) {
  if (!container) {
    return [];
  }
  const clone = container.cloneNode(true);
  clone.querySelectorAll(INLINE_BLOCK_SELECTOR).forEach((block) => block.remove());
  return serializeInlineFragments(clone);
}

export function detectTurnRole(turnNode) {
  const exportRole = (turnNode.getAttribute('data-gpt-enhancer-role') || '').trim();
  if (exportRole) return exportRole.toLowerCase();
  const role = getMessageRole(turnNode);
  if (role) return role;
  const testId = (turnNode.getAttribute('data-testid') || '').toLowerCase();
  if (testId.includes('user')) {
    return 'user';
  }
  if (testId.includes('assistant')) {
    return 'assistant';
  }
  return 'unknown';
}

function resolveNodeDirection(node, fallbackText) {
  if (!node) {
    return null;
  }
  const dirAttr = node.getAttribute && node.getAttribute('dir');
  if (dirAttr === 'rtl' || dirAttr === 'ltr') {
    return dirAttr;
  }
  const sourceText = fallbackText && fallbackText.trim() ? fallbackText : extractRelevantText(node);
  if (!sourceText) {
    return null;
  }
  const { rtlCount, ltrCount } = countDirectionCharacters(sourceText);
  if (rtlCount === 0 && ltrCount === 0) {
    return null;
  }
  return rtlCount > ltrCount ? 'rtl' : 'ltr';
}

function isBlockLevel(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  if (node.matches(JSON_BLOCK_LEVEL_SELECTOR)) {
    return true;
  }
  return isDisplayBlock(node);
}

// Treats visually blocky elements as block-level even if tags change,
// so A/B DOM variants don't collapse paragraphs into inline runs.
function isDisplayBlock(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  try {
    const computed = window.getComputedStyle(node);
    return ['block', 'flex', 'grid', 'table', 'flow-root', 'list-item'].includes(computed.display);
  } catch (error) {
    return false;
  }
}

export function serializeChildNodesToBlocks(container, options = {}) {
  const { skipInlineParagraph = false } = options;
  if (!container) {
    return [];
  }

  const blocks = [];
  let inlineGroup = [];

  const flushInlineGroup = () => {
    if (!inlineGroup.length) {
      return;
    }
    const temp = document.createElement('div');
    inlineGroup.forEach((node) => temp.appendChild(node.cloneNode(true)));
    const content = serializeInlineFragments(temp);
    if (content.length && !skipInlineParagraph) {
      blocks.push({
        type: 'paragraph',
        content,
        direction: resolveNodeDirection(temp, serializeInlineText(temp))
      });
    }
    inlineGroup = [];
  };

  Array.from(container.childNodes || []).forEach((node) => {
    if (isBlockLevel(node)) {
      flushInlineGroup();
      const block = serializeBlockToJson(node);
      if (block) {
        if (block.type === 'container' && block.tag === 'div' && Array.isArray(block.blocks)) {
          blocks.push(...block.blocks);
        } else {
          blocks.push(block);
        }
      }
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue && node.nodeValue.trim()) {
        inlineGroup.push(node);
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node;
      if (element.querySelector && element.querySelector(JSON_BLOCK_LEVEL_SELECTOR)) {
        flushInlineGroup();
        const nestedBlocks = serializeChildNodesToBlocks(element, options);
        nestedBlocks.forEach((nested) => {
          if (nested && nested.type === 'container' && nested.tag === 'div' && Array.isArray(nested.blocks)) {
            blocks.push(...nested.blocks);
          } else if (nested) {
            blocks.push(nested);
          }
        });
        return;
      }
      inlineGroup.push(node);
    }
  });

  flushInlineGroup();

  return blocks;
}

export function serializeBlockToJson(node) {
  const tag = node.tagName ? node.tagName.toLowerCase() : '';
  const direction = resolveNodeDirection(node);

  if (isEquationNode(node)) {
    return serializeEquationBlock(node, direction);
  }

  switch (tag) {
    case 'p':
      return serializeParagraphBlock(node, direction);
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return serializeHeadingBlock(node, direction, Number(tag[1]));
    case 'blockquote':
      return serializeBlockquoteBlock(node, direction);
    case 'pre':
      return serializeCodeBlock(node, direction);
    case 'ul':
    case 'ol':
      return serializeListBlock(node, direction, tag === 'ol');
    case 'table':
      return serializeTableBlock(node, direction);
    case 'hr':
      return { type: 'separator', direction };
    case 'figure':
      return serializeFigureBlock(node, direction);
    default:
      return serializeGenericBlock(node, direction);
  }
}

export function serializeParagraphBlock(node, direction) {
  const content = serializeInlineFragments(node);
  if (!content.length) {
    return null;
  }
  return {
    type: 'paragraph',
    content,
    direction
  };
}

export function serializeHeadingBlock(node, direction, level) {
  const content = serializeInlineFragments(node);
  return {
    type: 'heading',
    level: Number.isFinite(level) ? level : null,
    content,
    direction
  };
}

export function serializeBlockquoteBlock(node, direction) {
  const content = serializeInlineFragments(node);
  const nested = serializeNestedBlocks(node);
  return {
    type: 'blockquote',
    content: content.length ? content : undefined,
    blocks: nested.length ? nested : undefined,
    direction
  };
}

export function serializeCodeBlock(node, direction) {
  const codeNode = node.querySelector('code');
  const raw = codeNode ? codeNode.textContent || '' : node.textContent || '';
  const language =
    (codeNode && codeNode.className ? extractCodeLanguage(codeNode.className) : '') ||
    (node.className ? extractCodeLanguage(node.className) : '');
  const code = sanitizeCodeBlockContent(raw);
  return {
    type: 'code',
    language: language || null,
    code,
    direction
  };
}

export function serializeListBlock(node, direction, ordered) {
  const rawStart = ordered ? parseInt(node.getAttribute('start'), 10) : NaN;
  const start = Number.isFinite(rawStart) ? rawStart : null;
  const items = Array.from(node.children || [])
    .filter((child) => child.tagName && child.tagName.toLowerCase() === 'li')
    .map((item, index) => {
      const content = serializeInlineFragmentsExcludingBlocks(item);
      const nestedBlocks = serializeChildNodesToBlocks(item, { skipInlineParagraph: true });
      const childLists = nestedBlocks.filter((block) => block && block.type === 'list');
      const otherBlocks = nestedBlocks.filter((block) => block && block.type !== 'list');
      const number = ordered ? (Number.isFinite(start) ? start + index : index + 1) : null;
      return {
        index,
        number: number ?? undefined,
        content: content.length ? content : undefined,
        direction: resolveNodeDirection(item, serializeInlineText(item)),
        children: childLists.length ? childLists : undefined,
        blocks: otherBlocks.length ? otherBlocks : undefined
      };
    })
    .filter((entry) => entry && (entry.content || (entry.children && entry.children.length) || (entry.blocks && entry.blocks.length)));

  return {
    type: 'list',
    ordered: Boolean(ordered),
    start: start ?? undefined,
    items,
    direction
  };
}

export function serializeTableBlock(table, direction) {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((row) => {
      const cells = Array.from(row.children || [])
        .filter((cell) => cell.tagName && ['td', 'th'].includes(cell.tagName.toLowerCase()))
        .map((cell) => {
          const content = serializeInlineFragmentsExcludingBlocks(cell);
          // Capture nested structures inside table cells (lists, code blocks) so we do not lose structure.
          const nestedBlocks = serializeChildNodesToBlocks(cell, { skipInlineParagraph: true });
          return {
            type: cell.tagName.toLowerCase() === 'th' ? 'header' : 'cell',
            content: content && content.length ? content : undefined,
            blocks: nestedBlocks && nestedBlocks.length ? nestedBlocks : undefined,
            colSpan: parseSpanValue(cell.getAttribute('colspan')),
            rowSpan: parseSpanValue(cell.getAttribute('rowspan')),
            direction: resolveNodeDirection(cell)
          };
        })
        .filter((cell) => (cell.content && cell.content.length) || (cell.blocks && cell.blocks.length) || cell.colSpan || cell.rowSpan);
      if (!cells.length) {
        return null;
      }
      return { cells };
    })
    .filter(Boolean);

  return {
    type: 'table',
    rows,
    direction
  };
}

function parseSpanValue(value) {
  const numeric = parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric <= 1) {
    return null;
  }
  return numeric;
}

export function serializeFigureBlock(node, direction) {
  const image = node.querySelector('img');
  const captionNode = node.querySelector('figcaption');
  const caption = captionNode ? serializeInlineFragments(captionNode) : [];
  const nestedBlocks = serializeChildNodesToBlocks(node).filter((block) => block && block.type !== 'image');
  const imageBlock = image ? serializeImageBlock(image, resolveNodeDirection(image), false) : null;

  return {
    type: 'figure',
    image: imageBlock,
    caption: caption.length ? caption : null,
    blocks: nestedBlocks.length ? nestedBlocks : undefined,
    direction
  };
}

export function serializeImageBlock(node, direction, inline = false) {
  const rawSrc = node.getAttribute ? node.getAttribute('src') || node.src || '' : '';
  const src = sanitizeImageSource(rawSrc);
  const alt = node.getAttribute ? node.getAttribute('alt') || '' : '';
  const title = node.getAttribute ? node.getAttribute('title') || '' : '';
  if (!src && !alt) {
    return null;
  }
  return {
    type: 'image',
    src,
    alt: alt || null,
    title: title || null,
    inline,
    direction
  };
}

export function serializeEquationBlock(node, direction) {
  const latex = extractLatex(node);
  const text = normalizeJsonText(latex || node.textContent || '');
  if (!latex && !text) {
    return null;
  }
  const displayMode = isEquationDisplayNode(node);
  return {
    type: 'equation',
    latex: latex || null,
    text,
    displayMode,
    direction
  };
}

export function serializeGenericBlock(node, direction) {
  const nestedBlocks = serializeNestedBlocks(node);
  if (nestedBlocks.length) {
    return {
      type: 'container',
      tag: node.tagName ? node.tagName.toLowerCase() : null,
      blocks: nestedBlocks,
      direction
    };
  }
  const content = serializeInlineFragments(node);
  if (!content.length) {
    return null;
  }
  return {
    type: 'block',
    tag: node.tagName ? node.tagName.toLowerCase() : null,
    content,
    direction
  };
}

function serializeNestedBlocks(container) {
  return serializeChildNodesToBlocks(container);
}

export function serializeInlineText(element, options = {}) {
  const { excludeSelectors = [] } = options;
  const baseExcludes = ['.' + EXPORT_EQUATION_CLASS, '.katex', '.katex-display'];
  const selectorExtras = Array.isArray(excludeSelectors) ? excludeSelectors : [];
  const selectorParts = [...baseExcludes, ...selectorExtras].filter(Boolean);
  const excludeSelector = selectorParts.length ? selectorParts.join(',') : null;

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (textNode) => {
        if (!textNode || !textNode.nodeValue || !textNode.nodeValue.trim()) {
          return NodeFilter.FILTER_SKIP;
        }
        if (excludeSelector && textNode.parentElement && textNode.parentElement.closest(excludeSelector)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const textParts = [];
  while (walker.nextNode()) {
    textParts.push(textNodeValue(walker.currentNode));
  }
  return normalizeJsonText(textParts.join(' '));
}

function textNodeValue(node) {
  return stripZeroWidth((node && node.nodeValue ? node.nodeValue : '').replace(/\u00a0/g, ' '));
}

export function normalizeJsonText(text) {
  if (!text) {
    return '';
  }
  return stripZeroWidth(text).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderSuperscriptText(text) {
  if (!text) {
    return '';
  }
  const mapped = Array.from(text)
    .map((char) => SUPERSCRIPT_MAP[char] || char)
    .join('');
  if (mapped !== text) {
    return mapped;
  }
  return `^${text}`;
}

function renderSubscriptText(text) {
  if (!text) {
    return '';
  }
  const mapped = Array.from(text)
    .map((char) => SUBSCRIPT_MAP[char] || char)
    .join('');
  if (mapped !== text) {
    return mapped;
  }
  return `_${text}`;
}

export function blocksToPlainText(blocks, depth = 0) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return '';
  }
  const parts = blocks
    .map((block) => blockToPlainText(block, depth))
    .filter((part) => typeof part === 'string' && part.trim());
  return parts.join('\n');
}

export function blockToPlainText(block, depth = 0) {
  if (!block || typeof block !== 'object') {
    return '';
  }

  const parts = [];
  const pushIfText = (value) => {
    if (typeof value === 'string' && value.trim()) {
      parts.push(value);
    }
  };

  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'block':
    case 'container': {
      pushIfText(inlineFragmentsToPlainText(block.content || []));
      pushIfText(blocksToPlainText(block.blocks, depth + 1));
      return parts.join('\n');
    }
    case 'blockquote': {
      pushIfText(inlineFragmentsToPlainText(block.content || []));
      pushIfText(blocksToPlainText(block.blocks, depth + 1));
      return parts.join('\n');
    }
    case 'code':
      return typeof block.code === 'string' ? block.code : '';
    case 'list': {
      const indent = '  '.repeat(Math.max(0, depth));
      const start = Number.isFinite(block.start) ? block.start : 1;
      const isOrdered = Boolean(block.ordered);
      const lines = (block.items || [])
        .map((item, itemIndex) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const itemParts = [];
          const itemContent = inlineFragmentsToPlainText(item.content || []);
          if (itemContent.trim()) {
            itemParts.push(itemContent);
          }
          const nestedBlocks = blocksToPlainText(item.blocks, depth + 1);
          if (nestedBlocks.trim()) {
            itemParts.push(nestedBlocks);
          }
          const childLists = blocksToPlainText(item.children, depth + 1);
          if (childLists.trim()) {
            itemParts.push(childLists);
          }
          const line = itemParts.join('\n').replace(/\s+$/g, '');
          if (!line.trim()) {
            return '';
          }
          const number = Number.isFinite(item.number) ? item.number : start + itemIndex;
          const prefix = isOrdered ? `${number}. ` : '- ';
          return `${indent}${prefix}${line}`;
        })
        .filter((line) => line && line.trim());
      return lines.join('\n');
    }
    case 'table': {
      const lines = (block.rows || [])
        .map((row) => {
          if (!row || !Array.isArray(row.cells)) {
            return '';
          }
          const cellText = row.cells
            .map((cell) => inlineFragmentsToPlainText(cell?.content || []))
            .filter((value) => value && value.trim());
          if (!cellText.length) {
            return '';
          }
          return cellText.join(' | ');
        })
        .filter((line) => line && line.trim());
      return lines.join('\n');
    }
    case 'image':
      return block.alt || block.title || block.src || '[image]';
    case 'figure': {
      const figureParts = [];
      if (block.image) {
        figureParts.push(blockToPlainText(block.image, depth + 1));
      }
      if (Array.isArray(block.caption)) {
        const captionText = inlineFragmentsToPlainText(block.caption);
        if (captionText.trim()) {
          figureParts.push(captionText);
        }
      }
      const nested = blocksToPlainText(block.blocks, depth + 1);
      if (nested.trim()) {
        figureParts.push(nested);
      }
      return figureParts.filter((value) => value && value.trim()).join('\n');
    }
    case 'equation':
      return block.latex || block.text || '';
    case 'separator':
      return '---';
    default: {
      const inline = inlineFragmentsToPlainText(block.content || []);
      const nested = blocksToPlainText(block.blocks, depth + 1);
      pushIfText(inline);
      pushIfText(nested);
      return parts.join('\n');
    }
  }
}

export function inlineFragmentsToPlainText(fragments, options = {}) {
  const { preserveWhitespace = false } = options;
  if (!Array.isArray(fragments)) {
    return '';
  }

  const pieces = [];

  const appendChunk = (chunk, previous, previousType, currentType) => {
    if (!chunk && chunk !== '') {
      return { text: previous, type: previousType };
    }
    if (!preserveWhitespace && shouldInsertSpace(previous, chunk, previousType, currentType)) {
      pieces.push(' ');
    }
    pieces.push(chunk);
    return { text: chunk, type: currentType };
  };

  let previous = { text: '', type: null };

  fragments.forEach((fragment) => {
    if (!fragment || typeof fragment !== 'object') {
      return;
    }
    const chunk = inlineFragmentToText(fragment, options);
    if (chunk === null || chunk === undefined) {
      return;
    }
    previous = appendChunk(chunk, previous.text, previous.type, fragment.type);
  });

  return pieces.join('');
}

function inlineFragmentToText(fragment, options) {
  switch (fragment.type) {
    case 'text':
      return normalizeInlineText(fragment.text || '', options);
    case 'linebreak':
      return '\n';
    case 'strong':
    case 'em':
    case 'link':
      return inlineFragmentsToPlainText(fragment.content || [], options);
    case 'code':
      return fragment.text || '';
    case 'superscript':
      return renderSuperscriptText(
        fragment.text || inlineFragmentsToPlainText(fragment.content || [], options)
      );
    case 'subscript':
      return renderSubscriptText(
        fragment.text || inlineFragmentsToPlainText(fragment.content || [], options)
      );
    case 'image':
      return fragment.alt || fragment.title || fragment.src || '[image]';
    case 'equation':
      return fragment.latex || fragment.text || '';
    default:
      return '';
  }
}

function normalizeInlineText(text, options) {
  const { preserveWhitespace = false } = options || {};
  if (!text) {
    return '';
  }
  const base = text.replace(/\u00a0/g, ' ');
  if (preserveWhitespace) {
    return base;
  }
  return base.replace(/\s+/g, ' ');
}

function shouldInsertSpace(previous, next, previousType, nextType) {
  if (!previous || !next) {
    return false;
  }
  if (
    previousType === 'superscript' ||
    nextType === 'superscript' ||
    previousType === 'subscript' ||
    nextType === 'subscript'
  ) {
    return false;
  }
  const prevEnd = previous[previous.length - 1];
  const nextStart = next[0];
  if (!prevEnd || !nextStart) {
    return false;
  }
  if (/\s/.test(prevEnd) || /\s/.test(nextStart)) {
    return false;
  }
  if (isPunctuation(prevEnd) || isPunctuation(nextStart)) {
    return false;
  }
  return true;
}

function isPunctuation(char) {
  return /[.,!?;:()[\]{}<>]/.test(char);
}

function isEquationNode(node) {
  if (!node || !node.classList) {
    return false;
  }
  return node.classList.contains(EXPORT_EQUATION_CLASS) || node.classList.contains('katex');
}

function isEquationDisplayNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  if (node.classList.contains('katex-display')) {
    return true;
  }
  if (typeof node.closest === 'function' && node.closest(KATEX_DISPLAY_SELECTOR)) {
    return true;
  }
  const tag = node.tagName ? node.tagName.toLowerCase() : '';
  return BLOCK_EQUATION_TAGS.has(tag);
}

export function serializeInlineFragments(container) {
  const fragments = [];

  const appendFragment = (fragment) => {
    if (!fragment) {
      return;
    }
    if (fragment.type === 'text') {
      if (!fragment.text) {
        return;
      }
      const last = fragments[fragments.length - 1];
      if (last && last.type === 'text') {
        last.text += fragment.text;
        return;
      }
    }
    fragments.push(fragment);
  };

  const walk = (node) => {
    if (!node) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      let text = (node.nodeValue || '').replace(/[\r\n\t]+/g, ' ').replace(/\u00a0/g, ' ');
      text = stripZeroWidth(text);
      if (text) {
        appendFragment({ type: 'text', text });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node;
    if (element.classList.contains('katex') || element.classList.contains(EXPORT_EQUATION_CLASS)) {
      const eqFragment = serializeEquationFragment(element);
      if (eqFragment) {
        appendFragment(eqFragment);
      }
      return;
    }

    const tag = element.tagName.toLowerCase();
    switch (tag) {
      case 'br':
        appendFragment({ type: 'linebreak' });
        return;
      case 'strong':
      case 'b':
        appendFragment({
          type: 'strong',
          content: serializeInlineFragments(element)
        });
        return;
      case 'em':
      case 'i':
        appendFragment({
          type: 'em',
          content: serializeInlineFragments(element)
        });
        return;
      case 'code':
        if (!element.closest('pre')) {
          const codeText = extractInlineCodeText(element);
          if (codeText) {
            appendFragment({ type: 'code', text: codeText });
          }
        }
        return;
      case 'a': {
        const href = element.getAttribute('href') || '';
        const title = element.getAttribute('title') || null;
        appendFragment({
          type: 'link',
          href,
          title,
          content: serializeInlineFragments(element)
        });
        return;
      }
      case 'img': {
        const rawSrc = element.getAttribute('src') || element.src || '';
        const src = sanitizeImageSource(rawSrc);
        const alt = element.getAttribute('alt') || '';
        const title = element.getAttribute('title') || null;
        if (!src && !alt && !title) {
          return;
        }
        appendFragment({
          type: 'image',
          src,
          alt,
          title
        });
        return;
      }
      case 'sup': {
        const content = serializeInlineFragments(element);
        appendFragment({
          type: 'superscript',
          text: inlineFragmentsToPlainText(content),
          content
        });
        return;
      }
      case 'sub': {
        const content = serializeInlineFragments(element);
        appendFragment({
          type: 'subscript',
          text: inlineFragmentsToPlainText(content),
          content
        });
        return;
      }
      default: {
        serializeInlineFragments(element).forEach(appendFragment);
      }
    }
  };

  Array.from(container.childNodes || []).forEach(walk);

  // Trim leading/trailing text fragments.
  if (fragments.length > 0 && fragments[0].type === 'text') {
    fragments[0].text = fragments[0].text.trimStart();
  }
  if (fragments.length > 0 && fragments[fragments.length - 1].type === 'text') {
    fragments[fragments.length - 1].text = fragments[fragments.length - 1].text.trimEnd();
  }

  return fragments.filter((fragment) => {
    if (fragment.type === 'text') {
      return typeof fragment.text === 'string' && fragment.text.length > 0;
    }
    return true;
  });
}

export function serializeEquationFragment(node) {
  const latex = extractLatex(node);
  const text = normalizeJsonText(latex || node.textContent || '');
  const direction = resolveNodeDirection(node, text);
  if (!latex && !text) {
    return null;
  }
  const displayMode = isEquationDisplayNode(node);
  return {
    type: 'equation',
    latex: latex || null,
    text,
    displayMode,
    direction
  };
}

function extractLatex(element) {
  const annotation = element.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
  if (annotation && annotation.textContent) {
    return annotation.textContent.trim();
  }
  const fallback = element.querySelector('.katex-mathml annotation');
  if (fallback && fallback.textContent) {
    return fallback.textContent.trim();
  }
  return element.textContent ? element.textContent.trim() : '';
}

function buildMarkdownMetadata() {
  const title = typeof document !== 'undefined' && document.title ? document.title.trim() : '';
  const url = typeof window !== 'undefined' && window.location ? window.location.href : '';
  const exportedAt = new Date().toISOString();

  const headingText = title ? escapeMarkdownText(title) : 'ChatGPT Conversation';
  const lines = [`# ${headingText}`];

  const meta = [];
  if (url) {
    const escapedUrl = escapeLinkDestination(url);
    meta.push(`**URL:** [${escapeMarkdownText(url)}](${escapedUrl})`);
  }
  meta.push(`**Exported:** ${exportedAt}`);

  lines.push(meta.join('\n\n'));
  return lines.join('\n\n');
}

function formatRoleHeading(role, index) {
  const normalized = typeof role === 'string' ? role.toLowerCase() : '';
  let label;
  if (normalized === 'user') {
    label = 'User';
  } else if (normalized === 'assistant') {
    label = 'ChatGPT';
  } else if (normalized) {
    label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  if (!label) {
    label = `Message ${index + 1}`;
  }
  return `### ${escapeMarkdownText(label)}`;
}

export function serializeExportRootToMarkdown(root) {
  const parts = [];
  const metadata = buildMarkdownMetadata();
  if (metadata) {
    parts.push(metadata);
  }

  const turns = Array.from(root?.children || []);
  turns.forEach((turn, index) => {
    if (!turn || turn.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const body = serializeBlockChildren(turn, { listDepth: 0, preserveWhitespace: false, inLink: false }).trim();
    if (!body) {
      return;
    }
    const heading = formatRoleHeading(detectTurnRole(turn), index);
    parts.push(heading, body);
  });

  return parts.join('\n\n');
}

export function serializeMessagesToMarkdown(messages) {
  const parts = [buildMarkdownMetadata()];
  messages.forEach((message, index) => {
    const body = message.markdown.replace(/\uE100IMG\d+\uE101/g, '[Image attachment]').trim();
    if (body) parts.push(formatRoleHeading(message.role, index), body);
  });
  return parts.join('\n\n');
}

function serializeNodeToMarkdown(node, context) {
  if (node.nodeType === Node.TEXT_NODE) {
    return serializeTextNode(node, context);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  if (isEquationNode(node)) {
    return serializeEquationMarkdown(node);
  }

  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'br':
      return '<br>';
    case 'hr':
      return '---';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const depth = Number(tag[1]);
      const headingContent = serializeInlineChildren(node, context).trim();
      if (!headingContent) {
        return '';
      }
      return `${'#'.repeat(depth)} ${headingContent}`;
    }
    case 'p':
      return serializeInlineChildren(node, context).trim();
    case 'blockquote':
      return serializeBlockquote(node, context);
    case 'pre':
      return serializePreformattedBlock(node);
    case 'ul':
      return serializeList(node, context, false);
    case 'ol':
      return serializeList(node, context, true);
    case 'table':
      return serializeTable(node, context);
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return serializeBlockChildren(node, context);
    case 'li':
      return serializeBlockChildren(node, context);
    case 'strong':
    case 'b': {
      const strongContent = serializeInlineChildren(node, context).trim();
      return strongContent ? `**${strongContent}**` : '';
    }
    case 'em':
    case 'i': {
      const italicContent = serializeInlineChildren(node, context).trim();
      return italicContent ? `*${italicContent}*` : '';
    }
    case 'del':
    case 's': {
      const strikeContent = serializeInlineChildren(node, context).trim();
      return strikeContent ? `~~${strikeContent}~~` : '';
    }
    case 'code':
    case 'kbd':
      return serializeInlineCode(node, context);
    case 'a':
      return serializeLink(node, context);
    case 'img':
      return serializeImage(node);
    case 'sup': {
      const supContent = serializeInlineChildren(node, context).trim();
      return supContent ? `^(${supContent})` : '';
    }
    case 'sub': {
      const subContent = serializeInlineChildren(node, context).trim();
      return subContent ? `~(${subContent})` : '';
    }
    case 'mark': {
      const markContent = serializeInlineChildren(node, context).trim();
      return markContent ? `==${markContent}==` : '';
    }
    case 'span':
    case 'small':
    case 'label':
    case 'summary':
    case 'details':
    case 'figure':
    case 'figcaption':
    case 'section':
    case 'article':
    case 'main':
    case 'header':
    case 'footer':
    case 'aside':
    case 'div':
      return serializeGenericMarkdownBlock(node, context);
    default:
      return serializeGenericMarkdownBlock(node, context);
  }
}

function serializeEquationMarkdown(node) {
  const fragment = serializeEquationFragment(node);
  const latex = fragment?.latex || fragment?.text || '';
  if (!latex.trim()) {
    return '';
  }
  const content = stripZeroWidth(latex.trim());
  const isBlock = fragment?.displayMode || content.includes('\\begin{') || content.includes('\\[');
  if (isBlock) {
    return `$$\n${content}\n$$`;
  }
  return `$${content}$`;
}

function serializeGenericMarkdownBlock(node, context) {
  if (hasBlockDescendant(node)) {
    return serializeBlockChildren(node, context);
  }
  return serializeInlineChildren(node, context).trim();
}

function serializeInlineChildren(node, context) {
  const childContext = { ...context };
  const parts = [];
  node.childNodes.forEach((child) => {
    const chunk = serializeNodeToMarkdown(child, childContext);
    if (chunk) {
      parts.push(chunk);
    }
  });
  const combined = parts.join('');
  if (context && context.preserveWhitespace) {
    return combined;
  }
  return combined.replace(/\s*\n\s*/g, '\n').replace(/[ \t]{2,}/g, ' ');
}

function serializeBlockChildren(node, context) {
  const childContext = { ...context };
  const pieces = [];
  node.childNodes.forEach((child) => {
    const chunk = serializeNodeToMarkdown(child, childContext);
    if (chunk) {
      const trimmed = chunk.replace(/\s+$/g, '');
      if (trimmed.trim()) {
        pieces.push(trimmed);
      }
    }
  });
  return pieces.join('\n\n');
}

function serializeTextNode(node, context) {
  let text = node.nodeValue || '';
  if (!text) {
    return '';
  }
  text = text.replace(/\u00a0/g, ' ');
  if (context && context.preserveWhitespace) {
    return text;
  }
  return escapeMarkdownText(text.replace(/\s+/g, ' '));
}

function serializeBlockquote(node, context) {
  const content = serializeBlockChildren(node, context);
  if (!content) {
    return '';
  }
  return content
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
}

function serializePreformattedBlock(node) {
  const codeNode = node.querySelector('code');
  const raw = codeNode ? codeNode.textContent || '' : node.textContent || '';
  const language =
    (codeNode && codeNode.className ? extractCodeLanguage(codeNode.className) : '') ||
    (node.className ? extractCodeLanguage(node.className) : '');
  const content = sanitizeCodeBlockContent(raw);
  const fenceLength = Math.max(3, longestStreak(content, '`') + 1);
  const fence = '`'.repeat(fenceLength);
  return `${fence}${language}\n${content}\n${fence}`;
}

function serializeInlineCode(node, context) {
  if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
    return '';
  }
  const childContext = { ...context, preserveWhitespace: true };
  let content = serializeInlineChildren(node, childContext);
  if (!content) {
    return '';
  }
  let codeText = content.replace(/\r\n?/g, '\n').replace(/\n/g, ' ');
  const fenceLength = Math.max(1, longestStreak(codeText, '`') + 1);
  if (
    codeText.startsWith(' ') ||
    codeText.endsWith(' ') ||
    codeText.startsWith('`') ||
    codeText.endsWith('`')
  ) {
    codeText = ` ${codeText} `;
  }
  const fence = '`'.repeat(fenceLength);
  return `${fence}${codeText}${fence}`;
}

function serializeLink(node, context) {
  const href = node.getAttribute('href') || '';
  const title = node.getAttribute('title');
  const text = serializeInlineChildren(node, { ...context, inLink: true }).trim() || href;
  if (!href) {
    return text;
  }
  const destination = escapeLinkDestination(href);
  const titlePart = title ? ` "${escapeMarkdownText(title)}"` : '';
  return `[${text}](${destination}${titlePart})`;
}

function serializeImage(node) {
  const alt = escapeMarkdownText((node.getAttribute('alt') || '').trim());
  const src = sanitizeImageSource(node.getAttribute('src') || '');
  if (!src) {
    return alt ? `![${alt}]()` : '';
  }
  const title = node.getAttribute('title');
  const destination = escapeLinkDestination(src);
  const titlePart = title ? ` "${escapeMarkdownText(title)}"` : '';
  return `![${alt}](${destination}${titlePart})`;
}

function serializeList(node, context, ordered) {
  const depth = typeof context.listDepth === 'number' ? context.listDepth : 0;
  const items = [];
  const startAttr = ordered ? parseInt(node.getAttribute('start'), 10) : null;
  let index = Number.isFinite(startAttr) ? startAttr : 1;

  Array.from(node.children).forEach((child) => {
    if (!child || child.nodeType !== Node.ELEMENT_NODE || child.tagName.toLowerCase() !== 'li') {
      return;
    }
    const itemContent = serializeListItem(child, { ...context, listDepth: depth + 1 });
    if (itemContent === null) {
      return;
    }
    const lines = itemContent.split('\n');
    if (!lines.length) {
      return;
    }
    const indent = '  '.repeat(depth);
    const prefix = ordered ? `${index}. ` : '- ';
    const continuationIndent = ordered ? `${indent}${' '.repeat(prefix.length)}` : `${indent}  `;
    const formatted = lines
      .map((line, lineIndex) => {
        if (!line.trim()) {
          return '';
        }
        if (lineIndex === 0) {
          return `${indent}${prefix}${line}`;
        }
        if (/^\s/.test(line)) {
          return line;
        }
        return `${continuationIndent}${line}`;
      })
      .join('\n');
    if (formatted) {
      items.push(formatted);
    }
    if (ordered) {
      index += 1;
    }
  });

  return items.join('\n');
}

function serializeListItem(node, context) {
  const content = serializeBlockChildren(node, context);
  if (!content) {
    return null;
  }
  return content;
}

function serializeTable(node, context) {
  const rows = Array.from(node.querySelectorAll('tr'));
  if (!rows.length) {
    return '';
  }

  const spanTracker = [];
  const matrix = [];
  const headerFlags = [];

  rows.forEach((row) => {
    const cells = Array.from(row.children).filter((cell) => {
      if (!cell || cell.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      const tagName = cell.tagName.toLowerCase();
      return tagName === 'td' || tagName === 'th';
    });

    if (!cells.length) {
      return;
    }

    const rowValues = [];
    let colIndex = 0;

    const advanceThroughSpans = () => {
      while ((spanTracker[colIndex] || 0) > 0) {
        rowValues.push('');
        spanTracker[colIndex] -= 1;
        colIndex += 1;
      }
    };

    advanceThroughSpans();

    cells.forEach((cell) => {
      advanceThroughSpans();

      const content = escapeTableCell(serializeInlineChildren(cell, context).trim());
      const colSpan = parseSpanValue(cell.getAttribute('colspan')) || 1;
      const rowSpan = parseSpanValue(cell.getAttribute('rowspan')) || 1;

      rowValues.push(content);
      for (let i = 1; i < colSpan; i += 1) {
        rowValues.push('');
      }

      if (rowSpan > 1) {
        const remaining = rowSpan - 1;
        for (let offset = 0; offset < colSpan; offset += 1) {
          const targetCol = colIndex + offset;
          spanTracker[targetCol] = (spanTracker[targetCol] || 0) + remaining;
        }
      }

      colIndex += colSpan;
    });

    advanceThroughSpans();

    if (rowValues.length) {
      matrix.push(rowValues);
      headerFlags.push(Boolean(row.querySelector('th')));
    }
  });

  if (!matrix.length) {
    return '';
  }

  const columnCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizedRows = matrix.map((row) => {
    const copy = row.slice();
    while (copy.length < columnCount) {
      copy.push('');
    }
    return copy;
  });

  let headerIndex = headerFlags.findIndex(Boolean);
  if (headerIndex < 0) {
    headerIndex = 0;
  }

  const headerRow = normalizedRows[headerIndex];
  const bodyRows = normalizedRows.filter((_, idx) => idx !== headerIndex);

  const headerLine = `| ${headerRow.join(' | ')} |`;
  const separatorLine = `| ${new Array(columnCount).fill('---').join(' | ')} |`;
  const bodyLines = bodyRows.length ? bodyRows.map((row) => `| ${row.join(' | ')} |`) : [];
  return [headerLine, separatorLine, ...bodyLines].join('\n');
}

function escapeTableCell(text) {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function sanitizeCodeBlockContent(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\s+$/, '');
}

function longestStreak(value, character) {
  if (!value || !character) {
    return 0;
  }
  let max = 0;
  let current = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === character) {
      current += 1;
      if (current > max) {
        max = current;
      }
    } else {
      current = 0;
    }
  }
  return max;
}

function extractCodeLanguage(className) {
  const match = className.match(MARKDOWN_CODE_LANGUAGE_REGEX);
  return match ? match[1].toLowerCase() : '';
}

function escapeMarkdownText(text) {
  if (!text) {
    return '';
  }
  return text
    // 1) Escape backslashes first to avoid double-escaping later.
    .replace(/\\/g, '\\\\')
    // 2) Escape emphasis/code markers globally.
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    // 3) Escape link brackets.
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    // 4) Escape angle brackets to avoid raw HTML.
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 5) Contextual escapes: only when markers start a line.
    .replace(/^(\s*)([-+*])(\s)/gm, '$1\\$2$3') // unordered lists
    .replace(/^(\s*\d+)\.(\s)/gm, '$1\\.$2') // ordered lists
    .replace(/^(\s*)#+/gm, (match) => match.replace(/#/g, '\\#')) // headers
    .replace(/^(\s*)>/gm, '$1\\>'); // blockquotes
}

function escapeLinkDestination(value) {
  if (!value) {
    return '';
  }
  const cleanValue = value.replace(/\u200c/g, '');

  try {
    // Preserve structure, encode spaces/specials; tolerate already-encoded input.
    const encoded = encodeURI(decodeURI(cleanValue));
    return encoded.replace(/[()]/g, (char) => (char === '(' ? '%28' : '%29'));
  } catch (error) {
    return cleanValue
      .replace(/[()]/g, (char) => (char === '(' ? '%28' : '%29'))
      .replace(/\s/g, '%20');
  }
}

function stripZeroWidth(value) {
  if (!value) {
    return '';
  }
  return value.replace(/\u200c/g, '');
}

function sanitizeImageSource(src) {
  if (!src) {
    return '';
  }
  const trimmed = src.trim();
  if (!trimmed) {
    return '';
  }
  if (/^data:/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function hasBlockDescendant(node) {
  return Array.from(node.childNodes).some((child) => {
    if (!child || child.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    return MARKDOWN_BLOCK_TAGS.has(child.tagName.toLowerCase());
  });
}

function extractRelevantText(element) {
  if (!element.textContent) {
    return '';
  }
  return element.textContent.replace(/\s+/g, ' ').trim();
}

function countDirectionCharacters(text) {
  const rtlMatches = text.match(RTL_CHAR_REGEX);
  const ltrMatches = text.match(LTR_CHAR_REGEX);
  return {
    rtlCount: rtlMatches ? rtlMatches.length : 0,
    ltrCount: ltrMatches ? ltrMatches.length : 0
  };
}

function extractInlineCodeText(element) {
  if (!element) {
    return '';
  }
  const raw = element.textContent || '';
  if (!raw) {
    return '';
  }
  const normalized = raw.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  if (!/\S/.test(normalized)) {
    return '';
  }
  return normalized.replace(/\n/g, ' ');
}

export function serializeExportRootToPlainText(root) {
  const parts = [];
  const metadata = buildPlainTextMetadata();
  if (metadata) {
    parts.push(metadata);
  }

  const turns = Array.from(root?.children || []);
  turns.forEach((turn, index) => {
    if (!turn || turn.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const blocks = serializeChildNodesToBlocks(turn);
    const body = blocksToPlainText(blocks).trim();
    if (!body) {
      return;
    }
    parts.push(`${formatRolePlainLabel(detectTurnRole(turn), index)}:`, body);
  });

  return parts.join('\n\n');
}

function buildPlainTextMetadata() {
  const title = typeof document !== 'undefined' && document.title ? document.title.trim() : '';
  const url = typeof window !== 'undefined' && window.location ? window.location.href : '';
  const exportedAt = new Date().toISOString();
  const lines = [title || 'ChatGPT Conversation'];
  if (url) {
    lines.push(`URL: ${url}`);
  }
  lines.push(`Exported: ${exportedAt}`);
  return lines.join('\n');
}

function formatRolePlainLabel(role, index) {
  const normalized = typeof role === 'string' ? role.toLowerCase() : '';
  if (normalized === 'user') {
    return 'User';
  }
  if (normalized === 'assistant') {
    return 'ChatGPT';
  }
  if (normalized) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return `Message ${index + 1}`;
}
