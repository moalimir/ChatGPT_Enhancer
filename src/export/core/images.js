/**
 * Handles fetching and inlining of external images as Base64 data.
 */


// Keep concurrent fetches low to avoid hammering storage buckets or hitting request caps.
const INLINE_CONCURRENCY = 4;
// Bound fetches so one slow image does not stall the entire export.
const FETCH_TIMEOUT_MS = 30000;

export async function inlineImages(root, options = {}) {
  if (!root) {
    return;
  }
  const signal = options.signal;
  if (signal && signal.aborted) {
    return;
  }
  const allImages = Array.from(root.querySelectorAll('img'));
  // Force eager loading so lazily-loaded user attachments render in the hidden export stage.
  allImages.forEach((img) => {
    img.removeAttribute('loading');
    img.setAttribute('loading', 'eager');
  });

  const images = allImages.filter((img) => {
    const src = img.getAttribute('src') || '';
    return src && !src.startsWith('data:');
  });

  await runWithConcurrency(images, INLINE_CONCURRENCY, (img) => inlineSingleImage(img, signal), { signal });
}

async function inlineSingleImage(img, signal) {
  if (signal && signal.aborted) {
    return;
  }
  const absoluteUrl = img.src;
  if (!absoluteUrl) {
    return;
  }

  try {
    setImageData(img, await fetchImageAsDataUrl(absoluteUrl, signal));
  } catch {
    // The preparation step rejects any unresolved attachment before creating a file.
  }
}

function setImageData(img, dataUrl) {
  img.setAttribute('src', dataUrl);
  img.removeAttribute('srcset');
}

function fetchImageAsDataUrl(url, signal) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const handleAbort = () => controller.abort();
  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', handleAbort, { once: true });
    }
  } else if (signal && signal.aborted) {
    controller.abort();
  }
  return fetch(url, { mode: 'cors', credentials: 'include', signal: controller.signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      return response.blob();
    })
    .then((blob) => blobToDataUrl(blob))
    .finally(() => {
      window.clearTimeout(timeout);
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', handleAbort);
      }
    });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function runWithConcurrency(items, limit, worker, options = {}) {
  if (!Array.isArray(items) || !items.length) {
    return Promise.resolve();
  }
  const signal = options.signal;
  if (signal && signal.aborted) {
    return Promise.resolve();
  }

  let index = 0;
  const runners = [];

  const next = async () => {
    if (signal && signal.aborted) {
      return;
    }
    const current = index;
    index += 1;
    const item = items[current];
    if (!item) {
      return;
    }
    try {
      await worker(item);
    } catch {
      // Fail soft: individual errors should not halt the queue.
    }
    if (index < items.length && !(signal && signal.aborted)) {
      await next();
    }
  };

  const bucket = Math.max(1, Math.min(limit || 1, items.length));
  for (let i = 0; i < bucket; i += 1) {
    runners.push(next());
  }
  return Promise.all(runners);
}
