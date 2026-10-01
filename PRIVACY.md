Privacy Policy for GPT Enhancer for ChatGPT
===========================================

GPT Enhancer for ChatGPT does not collect, sell, or share personal data.

What we store locally
---------------------
- Settings, prompts, and preferences are saved in Chrome's local/sync storage.

What we do not collect
----------------------
- No analytics, tracking, or advertising identifiers.
- No account creation, sign-in, or server-side storage.

Network access
--------------
When you open Conversation contents or request an export, the extension reads your ChatGPT session access token from
`chatgpt.com/api/auth/session` and uses it to request the current conversation from
`chatgpt.com/backend-api/conversation/<id>`. For visual exports with attachments, it may
also request ChatGPT image download links and fetch those images for embedding. The token
and conversation response are not saved or logged by the extension. The Contents panel keeps
short reply previews in memory while the page is open. The extension does not send this data
to our servers or third parties.

Data stays on your device
-------------------------
All processing happens locally in your browser.

Open source
-----------
You can review the source code on GitHub.
