# GPT Enhancer

A [browser extension](https://chromewebstore.google.com/detail/gpt-enhancer-for-chatgpt/deobmkpgnanhnoojdecfpndfmgjhaddk?authuser=0&hl=en) that polishes the ChatGPT interface. It fixes mixed RTL/LTR layout issues, adds curated font control, includes custom themes, improves KaTeX handling, and lets you export conversations in multiple formats - all from a friendly popup.


<img width="2560" height="1600" alt="Settings" src="https://github.com/user-attachments/assets/65083ccb-c77a-4d12-9dbf-e7e56192172f" />


## Features

- **Directional fixes** - stabilises mixed RTL/LTR text, KaTeX blocks, and code snippets so chats stay readable.
- **Fonts panel** – toggle custom English and Persian font stacks; the extension auto-detects Persian messages and applies the right typeface.
- **Themes** – apply handcrafted themes (Midnight, Aurora, Paper, Nebula, Skyblue); the extension only enables themes that match ChatGPT’s current light/dark mode.
- **One-tap KaTeX copy** – click any KaTeX formula to copy its LaTeX.
- **Prompt library** – create, edit, and reorder reusable prompts from the popup, and copy them into ChatGPT in one click.
- **Conversation export** – save the current ChatGPT conversation as PDF, DOCX, PNG, JSON, Markdown, or CSV, and choose all messages or assistant-only.
- **Quick export panel** – floating, draggable export control on the ChatGPT page with format + scope selection.
- **In-app help** – slide-in guide (English/Farsi) that explains every toggle.

## Install

- Chrome Web Store: [Link](https://chromewebstore.google.com/detail/gpt-enhancer-for-chatgpt/deobmkpgnanhnoojdecfpndfmgjhaddk?authuser=0&hl=en)
- Manual (unpacked):
  1. `npm install`
  2. `npm run build`
  3. Open Chrome extensions, enable Developer mode, and load `dist` as an unpacked extension.


## Privacy

See `PRIVACY.md`.
