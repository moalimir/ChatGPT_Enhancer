import { DEFAULT_SETTINGS, FONT_STACKS } from './config.js';

export const FONT_FACE_DEFINITIONS = [
  { family: 'Inter', path: 'assets/fonts/Inter-Variable-latin.woff2', weight: '100 900' },
  { family: 'Source Sans 3', path: 'assets/fonts/SourceSans3-Variable-latin.woff2', weight: '200 900' },
  { family: 'Roboto', path: 'assets/fonts/Roboto-Variable-latin.woff2', weight: '100 900' },
  { family: 'Noto Sans', path: 'assets/fonts/NotoSans-Variable-latin.woff2', weight: '100 900' },
  { family: 'Work Sans', path: 'assets/fonts/WorkSans-Variable-latin.woff2', weight: '200 800' },
  { family: 'Vazirmatn', path: 'assets/fonts/Vazirmatn-VF.woff2', weight: '100 900' },
  { family: 'Noto Sans Arabic', path: 'assets/fonts/NotoSansArabic-400-600.woff2', weight: '400 600' },
  { family: 'Noto Naskh Arabic', path: 'assets/fonts/NotoNaskhArabic-400-600.woff2', weight: '400 600' },
  { family: 'Sahel', path: 'assets/fonts/Sahel-Regular.woff2', weight: '400' },
  { family: 'Sahel', path: 'assets/fonts/Sahel-Bold.woff2', weight: '700' },
  { family: 'Shabnam', path: 'assets/fonts/Shabnam-Regular.woff2', weight: '400' },
  { family: 'Shabnam', path: 'assets/fonts/Shabnam-Bold.woff2', weight: '700' }
];

export function selectedFonts(settings = {}) {
  const english = settings.fontsEnabled ? settings.fontEnglish : DEFAULT_SETTINGS.fontEnglish;
  const persian = settings.fontsEnabled ? settings.fontPersian : DEFAULT_SETTINGS.fontPersian;
  const englishFamily = (FONT_STACKS.english[english] || FONT_STACKS.english.inter).split(',')[0];
  const persianFamily = (FONT_STACKS.persian[persian] || FONT_STACKS.persian.vazirmatn).split(',')[0];
  return {
    stack: `${englishFamily}, ${persianFamily}, system-ui, sans-serif`,
    definitions: FONT_FACE_DEFINITIONS.filter(({ family }) =>
      `"${family}"` === englishFamily || `"${family}"` === persianFamily)
  };
}

const fontBuffers = new Map();
const documentFaces = new WeakMap();
export async function loadDocumentFonts(targetDocument, definitions) {
  const Font = targetDocument.defaultView?.FontFace;
  if (!Font || !targetDocument.fonts) throw new Error('This browser cannot load export fonts.');
  if (!documentFaces.has(targetDocument)) documentFaces.set(targetDocument, new Map());
  const faces = documentFaces.get(targetDocument);
  await Promise.all(definitions.map(({ family, path, weight, style = 'normal' }) => {
    if (faces.has(path)) return faces.get(path);
    const loading = (async () => {
      if (!fontBuffers.has(path)) {
        const url = !/^(data:|https?:|chrome-extension:)/.test(path) && typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL(path.replace(/^\//, '')) : path.startsWith('assets/') ? `/${path}` : path;
        const buffer = fetch(url, { signal: AbortSignal.timeout(10000) }).then((response) => {
          if (!response.ok) throw new Error(`Font could not be loaded (${response.status}).`);
          return response.arrayBuffer();
        }).catch((error) => { fontBuffers.delete(path); throw error; });
        fontBuffers.set(path, buffer);
      }
      const face = new Font(family, await fontBuffers.get(path), { weight, style });
      await face.load();
      targetDocument.fonts.add(face);
    })().catch((error) => { faces.delete(path); throw error; });
    faces.set(path, loading);
    return loading;
  }));
  await targetDocument.fonts.ready;
}

export async function fontEmbedCSS(definitions) {
  return (await Promise.all(definitions.map(async ({ family, path, weight, style = 'normal' }) => {
    const bytes = new Uint8Array(await fontBuffers.get(path));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: ${style};
      src: url(data:font/woff2;base64,${btoa(binary)}) format("woff2"); }`;
  }))).join('\n');
}
