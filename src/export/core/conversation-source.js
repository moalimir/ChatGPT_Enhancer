// ChatGPT's private endpoint is used only while the user exports a conversation.
// Credentials and the response stay in this call; neither is cached or logged.
const CITATION = /\uE200[^\uE201]*\uE201/g;

export function conversationIdFromUrl(href = location.href) {
  return new URL(href).pathname.match(/(?:^|\/)c\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\/|$)/i)?.[1] || null;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function cleanCitations(text, references = []) {
  for (const ref of Array.isArray(references) ? references : []) {
    if (!ref?.matched_text) continue;
    const url = safeUrl(ref.url || ref.safe_urls?.[0] || ref.items?.[0]?.url);
    text = text.split(ref.matched_text).join(url ? `[source](${url.replace(/[()]/g, encodeURIComponent)})` : '');
  }
  return text.replace(CITATION, '');
}

export function activeBranch(conversation) {
  const mapping = conversation?.mapping;
  let id = conversation?.current_node;
  if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object' || typeof id !== 'string') {
    throw new Error('ChatGPT returned an unfamiliar conversation structure.');
  }
  const seen = new Set();
  const path = [];
  while (id) {
    if (seen.has(id) || !Object.prototype.hasOwnProperty.call(mapping, id) || !mapping[id]) {
      throw new Error('ChatGPT returned a broken conversation branch.');
    }
    seen.add(id);
    const node = mapping[id];
    path.push(node.message);
    if (node.parent !== null && typeof node.parent !== 'string') {
      throw new Error('ChatGPT returned a broken conversation branch.');
    }
    id = node.parent;
  }
  return path.reverse().filter(Boolean);
}

function visible(message) {
  const role = message?.author?.role;
  if (role !== 'user' && role !== 'assistant') return false;
  if (role === 'assistant' && message.end_turn === false) return false;
  if (message.recipient && message.recipient !== 'all') return false;
  if (message.metadata?.is_visually_hidden_from_conversation) return false;
  const channel = message.channel || message.metadata?.channel;
  return !channel || channel === 'final';
}

export function normalizeMessages(conversation, scope = 'all') {
  const branch = activeBranch(conversation);
  const tip = branch.at(-1);
  if (tip?.author?.role === 'assistant' && (tip.status === 'in_progress' || tip.end_turn === false)) {
    throw new Error('Wait for ChatGPT to finish responding before exporting.');
  }
  return branch.filter(visible).filter((message) =>
    scope === 'all' || message.author.role === 'assistant'
  ).map((message) => {
    if (message.status === 'in_progress' || message.end_turn === false) {
      throw new Error('Wait for ChatGPT to finish responding before exporting.');
    }
    const content = message.content || {};
    const type = content.content_type;
    const images = [];
    let markdown = '';
    if (type === 'code') {
      if (typeof content.text !== 'string') throw new Error('This conversation contains an unsupported code message.');
      const language = String(content.language || '').replace(/[^\w+-]/g, '');
      const fence = '`'.repeat((content.text.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length + 1), 3));
      markdown = `${fence}${language}\n${content.text}\n${fence}`;
    } else if (type === 'text' || type === 'multimodal_text') {
      if (!Array.isArray(content.parts)) throw new Error('This conversation contains an unsupported text message.');
      for (const part of content.parts) {
        if (typeof part === 'string') markdown += part;
        else if (part?.content_type === 'image_asset_pointer' && typeof part.asset_pointer === 'string') {
          markdown += `\n\n\uE100IMG${images.length}\uE101\n\n`;
          images.push(part.asset_pointer);
        } else if (typeof part?.text === 'string') markdown += part.text;
        else throw new Error('This conversation contains an unsupported message part.');
      }
    } else {
      throw new Error('This conversation contains an unsupported message format.');
    }
    return {
      id: message.id || null,
      role: message.author.role,
      markdown: cleanCitations(markdown, message.metadata?.content_references).trim(),
      images
    };
  }).filter((message) => message.markdown || message.images.length);
}

export async function loadConversationFromApi({ scope = 'all', includeAssets = false } = {}) {
  const id = conversationIdFromUrl();
  if (!id) throw new Error('Open a ChatGPT conversation before exporting.');
  const session = await fetch(`${location.origin}/api/auth/session`, { credentials: 'include' });
  if (!session.ok) throw new Error('ChatGPT session is unavailable. Sign in and retry.');
  const token = (await session.json())?.accessToken;
  if (!token) throw new Error('ChatGPT session has no access token. Sign in and retry.');

  const headers = { Authorization: `Bearer ${token}` };
  const account = document.cookie.match(/(?:^|;\s*)_account=([^;]+)/)?.[1];
  if (account && account !== 'personal') {
    try { headers['ChatGPT-Account-Id'] = decodeURIComponent(account); }
    catch { headers['ChatGPT-Account-Id'] = account; }
  }
  const response = await fetch(`${location.origin}/backend-api/conversation/${id}`, {
    credentials: 'include', headers
  });
  if (!response.ok) throw new Error(`ChatGPT conversation request failed (HTTP ${response.status}).`);
  const conversation = await response.json();
  const messages = normalizeMessages(conversation, scope);
  if (!messages.length) throw new Error('No supported messages found in this conversation.');
  if (includeAssets) {
    const urls = new Map();
    for (const pointer of new Set(messages.flatMap((message) => message.images))) {
      const fileId = pointer.match(/^(?:sediment|file-service):\/\/(file_[\w-]+)$/)?.[1];
      if (!fileId) throw new Error('This conversation contains an unsupported image reference.');
      const asset = await fetch(`${location.origin}/backend-api/files/download/${fileId}`, {
        credentials: 'include', headers
      });
      if (!asset.ok) throw new Error(`An image could not be retrieved (HTTP ${asset.status}).`);
      const url = safeUrl((await asset.json())?.download_url);
      if (!url) throw new Error('An image download link was unavailable.');
      urls.set(pointer, url);
    }
    messages.forEach((message) => { message.imageUrls = message.images.map((pointer) => urls.get(pointer)); });
  }
  return { messages, title: conversation.title || document.title || 'ChatGPT conversation' };
}
