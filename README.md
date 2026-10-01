# GPT Enhancer

A [browser extension](https://chromewebstore.google.com/detail/gpt-enhancer-for-chatgpt/deobmkpgnanhnoojdecfpndfmgjhaddk?authuser=0&hl=en) that polishes the ChatGPT interface. It fixes mixed RTL/LTR layout issues, adds curated font control, includes custom themes, and lets you export conversations in multiple formats - all from a friendly popup.


<img width="2560" height="1600" alt="Settings" src="https://github.com/user-attachments/assets/65083ccb-c77a-4d12-9dbf-e7e56192172f" />


## Features

- **Directional fixes** - stabilises mixed RTL/LTR text and code snippets so chats stay readable.
- **Fonts panel** – toggle custom English and Persian font stacks; the extension auto-detects Persian messages and applies the right typeface.
- **Stabilize** – Contents comes first; Persian alignment and code direction can be toggled independently. English phrases retain native bidirectional ordering.
- **Themes** – apply handcrafted themes (Midnight, Aurora, Paper, Nebula, Skyblue); the extension only enables themes that match ChatGPT’s current light/dark mode.
- **Prompt library** – create, edit, and reorder reusable prompts from the popup, and copy them into ChatGPT in one click.
- **Conversation export** – save the active branch of a signed-in ChatGPT conversation as PDF, DOCX, Markdown, or TXT, including long chats whose older messages are not mounted on the page. Choose all messages or assistant-only. Export uses ChatGPT's private web endpoint and reports an error if that endpoint or a message format changes.
- **Conversation contents** – open an outline of every assistant reply in the active branch. Click a reply to jump to its start; distant replies are located by their message ID. Drag the header, resize the panel, or collapse it.
- **Quick export panel** – drag the header to dock the control at either screen edge; its height and edge are saved across visits.
- **In-app help** – slide-in guide (English/Farsi) that explains every toggle.

## Install

- Chrome Web Store: [Link](https://chromewebstore.google.com/detail/gpt-enhancer-for-chatgpt/deobmkpgnanhnoojdecfpndfmgjhaddk?authuser=0&hl=en)
- Manual (unpacked):
  1. Use Node.js 22 or newer and run `npm install`
  2. `npm run build`
  3. Open Chrome extensions, enable Developer mode, and load `dist` as an unpacked extension.


## Checks

Run `npm test`, `npm run lint`, and `npm run build`.
For visual checks, run `npm exec vite -- --config tests/print.vite.config.js`, then open
`http://127.0.0.1:4179/tests/print-samples.html?case=mixed` and print it.
Cases: `en`, `fa`, `mixed`, `fonts`, `table`, `long`, `code`.
The samples use the production renderer and PDF styles; all content is synthetic.
`/tests/control-samples.html` checks the panels against a synthetic 121-reply branch.

PDF uses A4, 18 mm margins, selected English/Persian fonts (Inter/Vazirmatn when custom
fonts are disabled), typeset equations, message dividers, and page numbers. Disable
Chrome's **Headers and footers** in the print dialog to avoid its URL/date header.
DOCX uses images for equations because Word does not support KaTeX's HTML layout.

## Privacy

See `PRIVACY.md`.
