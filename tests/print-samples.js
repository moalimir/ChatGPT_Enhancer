// Synthetic, non-private samples exercise the same document preparation and PDF generator.
import { prepareDocument } from '../src/export/core/prepare-document.js';
import { exportAsPdf } from '../src/export/generators/pdf.js';

const sample = new URLSearchParams(location.search).get('case') || 'mixed';
const english = String.raw`# Calculus study notes

Read this as a compact study sheet. Inline math \(f(x)=x^2\) stays within the sentence, and the derivative is $f'(x)=2x$.

## Fundamental theorem

\[
\int_a^b f'(x)\,dx = f(b)-f(a)
\]

A price is $5 or $10. The code below remains code, including its dollar signs.

~~~python
price = "$5"
def square(x):
    return x ** 2
~~~

| Concept | Formula |
| --- | --- |
| Mean | $\bar{x}=\frac{1}{n}\sum_{i=1}^n x_i$ |
| Variance | $\sigma^2=E[(X-\mu)^2]$ |

- Keep headings with the following explanation.
- Print light code backgrounds and readable equations.

$$
\begin{pmatrix}1&2\\3&4\end{pmatrix}
\begin{pmatrix}x\\y\end{pmatrix}
= \begin{pmatrix}x+2y\\3x+4y\end{pmatrix}
$$`;
const persian = String.raw`# یادداشت‌های مطالعهٔ حسابان

این متن فارسی دربارهٔ تابع \(f(x)=x^2\) است. عبارت English و نام OpenAI در میانهٔ جمله، جهت متن را تغییر نمی‌دهد. **این بخش پررنگ است** و این واژه دارای نیم‌فاصله است: می‌توانیم.

## مشتق و انتگرال

برای هر عدد حقیقی، رابطهٔ زیر را داریم:

\[
\frac{d}{dx}x^n = nx^{n-1}
\]

متن فارسی داخل خود معادله نیز باید پیوسته و خوانا باشد: \(x + \text{بالایی}\).

\[
\frac{\text{بالایی}}{\text{پایینی}} + x^2
\]

این جمله با English شروع نمی‌شود، اما از نام تابع \`calculateTotal\` استفاده می‌کند.

| مفهوم | توضیح |
| --- | --- |
| مشتق | نرخ تغییر تابع در یک نقطه |
| انتگرال | $\int_0^1 x^2\,dx=\frac{1}{3}$ |

- مورد اول برای مرور درس
- مورد دوم با عبارت API و معادلهٔ $x+y=2$

> این نقل‌قول فارسی باید از سمت راست خوانده شود.

~~~javascript
const total = values.reduce((sum, x) => sum + x, 0);
~~~`.replace(/\\`/g, '`');
const mixed = `${persian}\n\n${english}\n\n## ادامهٔ متن فارسی\n\nاین بند پس از متن انگلیسی، دوباره راست‌چین است.\n\nEnglish paragraph after Persian stays left aligned.\n\nاین جمله شامل API Request Handler و **Computer** Science Basics با عدد 2.0 است.\n\nاز [OpenAI API Reference](https://openai.com) و \`getUserById(userId)\` استفاده کن.`;
const base = sample === 'en' ? english : sample === 'fa' ? persian : mixed;
const messages = [{ role: 'user', markdown: sample === 'en' ? 'Please create study notes.' : 'لطفاً یادداشت‌های خوانا برای مطالعه آماده کن.' },
  { role: 'assistant', markdown: base }];
const imageUrls = [];
if (sample === 'images') {
  for (const [name, width, height] of [['Landscape', 1600, 900], ['Portrait', 900, 1800], ['Transparent', 800, 800]]) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (name !== 'Transparent') { context.fillStyle = '#e6eef5'; context.fillRect(0, 0, width, height); }
    context.strokeStyle = '#244b72'; context.lineWidth = 12; context.strokeRect(12, 12, width - 24, height - 24);
    context.fillStyle = '#3974ab'; context.fillRect(width / 4, height / 4, width / 2, height / 2);
    context.fillStyle = '#202124'; context.font = '42px sans-serif'; context.fillText(name, 35, 70);
    const url = URL.createObjectURL(await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')));
    imageUrls.push(url);
    messages.push({ role: 'assistant', markdown: `## ${name} image\n\n\uE100IMG0\uE101\n\nIMAGE-END-${name}`, imageUrls: [url] });
  }
}
if (sample === 'long') {
  for (let i = 0; i < 60; i++) messages.push({ role: 'assistant', markdown: `## Section ${i + 1}\n\n${i % 2 ? persian : english}` });
  messages.push({ role: 'assistant', markdown: 'FINAL-TURN-62: completeness verified.' });
}
if (sample === 'code') {
  messages.push({ role: 'assistant', markdown: '~~~python\n' + Array.from({ length: 150 }, (_, i) => `print("line ${i}")`).join('\n') + '\n~~~\n\nCODE-END-149' });
}
if (sample === 'table') {
  messages.push({ role: 'assistant', markdown: '| Index | Value |\n| --- | --- |\n' +
    Array.from({ length: 100 }, (_, i) => `| ${i} | Study row ${i} |`).join('\n') });
}
if (sample === 'wide') {
  messages.push({ role: 'assistant', markdown: String.raw`## Wide equation

\[
\text{First very long label for the numerator in the study formula} + \text{Second long label after the plus sign} + x^2 = y^2
\]` });
}
const settings = sample === 'fonts' ? { fontsEnabled: true, fontEnglish: 'source-sans-3', fontPersian: 'shabnam' } : {};
try {
  const { root, fontCSS } = await prepareDocument(document, messages, { settings, embedFonts: true });
  const print = window.print;
  window.print = () => window.dispatchEvent(new Event('afterprint'));
  await exportAsPdf(root);
  window.print = print;
  window.__verifyDocxMath = async () => {
    const { convertKatexToImages } = await import('../src/export/core/equations.js');
    await convertKatexToImages(root, fontCSS);
    return { mathImages: root.querySelectorAll('img.gpt-export-equation').length,
      remainingMath: root.querySelectorAll('.katex').length };
  };
  window.__sampleReady = { turns: root.children.length, equations: root.querySelectorAll('.katex').length,
    errors: root.querySelectorAll('.katex-error').length, rtl: root.querySelectorAll('[dir="rtl"]').length,
    images: Array.from(root.querySelectorAll('img'), (img) => ({ embedded: img.src.startsWith('data:image/png;'),
      width: img.naturalWidth, height: img.naturalHeight })),
    font: root.style.fontFamily, fontsLoaded: document.fonts.size };
} catch (error) {
  window.__sampleReady = { error: error.message };
  document.body.textContent = error.message;
} finally {
  imageUrls.forEach((url) => URL.revokeObjectURL(url));
}
