export const EXPORT_STYLE_BLOCK = `
.gpt-export-root { font-family: var(--gpt-export-font, "Inter", "Vazirmatn", sans-serif);
  color: #202124; background: #fff; font-size: 11.5pt; line-height: 1.65; overflow-wrap: break-word; }
.gpt-export-root * { box-sizing: border-box; }
.gpt-export-turn + .gpt-export-turn { border-top: 1px solid #d8dadd; margin-top: 20pt; padding-top: 20pt; }
.gpt-export-root p { margin: 0 0 9pt; orphans: 3; widows: 3; }
.gpt-export-root h1 { font-size: 1.65em; }
.gpt-export-root h2 { font-size: 1.35em; }
.gpt-export-root h3 { font-size: 1.15em; }
.gpt-export-root h1,.gpt-export-root h2,.gpt-export-root h3,
.gpt-export-root h4,.gpt-export-root h5,.gpt-export-root h6 {
  line-height: 1.35; margin: 16pt 0 8pt; break-after: avoid; }
.gpt-export-body > :first-child { margin-top: 0; }
.gpt-export-root a { color: #254f8a; text-decoration: underline; }
.gpt-export-root [dir="rtl"] { direction: rtl; text-align: right; unicode-bidi: isolate; }
.gpt-export-root [dir="ltr"] { direction: ltr; text-align: left; unicode-bidi: isolate; }
.gpt-export-root pre,.gpt-export-root code { font-family: Menlo, Consolas, "Courier New", monospace;
  direction: ltr; unicode-bidi: isolate; text-align: left; font-size: .85em; }
.gpt-export-root pre { background: #f5f7fa; color: #243348; border: 1px solid #e3e8ef;
  border-inline-start: 3pt solid #8b9aad; padding: 10pt 12pt;
  border-radius: 5pt; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }
.gpt-export-root pre code { font-size: inherit; }
.gpt-export-root code:not(pre code) { background: #f1f2f3; padding: 1pt 3pt; border-radius: 3pt; }
.gpt-export-root blockquote { border-inline-start: 3pt solid #d8dadd; padding-inline-start: 12pt; margin: 10pt 0; }
.gpt-export-root ul,.gpt-export-root ol { padding-inline: 22pt; margin-block: 8pt; }
.gpt-export-root li { margin-block: 3pt; }
.gpt-export-root table { width: 100%; border-collapse: collapse; font-size: .9em; margin-block: 12pt; }
.gpt-export-root th,.gpt-export-root td { border-bottom: 1px solid #d8dadd; padding: 6pt 8pt;
  vertical-align: top; overflow-wrap: anywhere; }
.gpt-export-root th { background: #f4f6f8; border-bottom: 1.5pt solid #b9c2ce; }
.gpt-export-root tbody tr:nth-child(even) { background: #fafbfc; }
.gpt-export-root thead { display: table-header-group; }
.gpt-export-root tr { break-inside: avoid; }
.gpt-export-root img { max-width: 100%; max-height: 240mm; height: auto; object-fit: contain; }
.gpt-export-root .katex { unicode-bidi: isolate; }
.gpt-export-root .katex-display { text-align: center; margin: 12pt 0; }
.gpt-export-root .katex-display > .katex { text-align: center; }
.gpt-export-root .gpt-export-native-math math { font-family: math; }
.gpt-export-root .gpt-export-native-math mtext { font-family: var(--gpt-export-font); }
.gpt-export-root .gpt-export-native-math math[display="block"] { margin: 12pt 0; }
.gpt-export-math { break-inside: avoid; overflow-wrap: normal; }
.gpt-export-root hr { border: 0; border-top: 1px solid #d8dadd; margin-block: 16pt; }
.gpt-export-equation { vertical-align: middle; }
`;

export const PRINT_STYLE_BLOCK = `
@page { size: A4; margin: 18mm;
  @bottom-center { content: counter(page); font: 9pt sans-serif; color: #73777d; }
}
html,body { height: auto; overflow: visible; margin: 0; background: #fff; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

export const DOCX_EXPORT_STYLE_BLOCK = EXPORT_STYLE_BLOCK;
