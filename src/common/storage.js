/**
 * Abstraction layer for Chrome storage operations with fallback and error handling.
 */
import { DEFAULT_SETTINGS } from './config.js';

const RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 50;
const LEGACY_SETTING_KEYS = ['fixTables', 'fixKatex', 'copyKatex'];

function getChromeStorage(preferSync = true) {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return null;
  }
  if (preferSync && chrome.storage.sync) {
    return chrome.storage.sync;
  }
  if (chrome.storage.local) {
    return chrome.storage.local;
  }
  return chrome.storage.sync || null;
}

function readSettings(storage, defaults, retries = RETRY_ATTEMPTS) {
  return new Promise((resolve, reject) => {
    const attemptLoad = (remainingRetries) => {
      try {
        storage.get(DEFAULT_SETTINGS, (stored) => {
          const runtimeError = chrome?.runtime?.lastError || null;
          if (runtimeError) {
            if (remainingRetries > 0) {
              setTimeout(() => attemptLoad(remainingRetries - 1), RETRY_DELAY_MS);
              return;
            }
            reject(runtimeError);
            return;
          }
          resolve({ ...defaults, ...(stored || {}) });
        });
      } catch (error) {
        if (remainingRetries > 0) {
          setTimeout(() => attemptLoad(remainingRetries - 1), RETRY_DELAY_MS);
          return;
        }
        reject(error);
      }
    };

    attemptLoad(retries);
  });
}

function writeSettings(storage, patch) {
  return new Promise((resolve, reject) => {
    try {
      storage.set(patch, () => {
        const runtimeError = chrome?.runtime?.lastError || null;
        if (runtimeError) {
          reject(runtimeError);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function removeKeys(storage, keys) {
  return new Promise((resolve, reject) => {
    try {
      storage.remove(keys, () => {
        const runtimeError = chrome?.runtime?.lastError || null;
        if (runtimeError) {
          reject(runtimeError);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function purgeLegacySettings() {
  const primary = getChromeStorage(true);
  if (!primary) {
    return;
  }
  try {
    await removeKeys(primary, LEGACY_SETTING_KEYS);
  } catch {
    const fallback = getChromeStorage(false);
    if (fallback && fallback !== primary) {
      await removeKeys(fallback, LEGACY_SETTING_KEYS).catch(() => {});
    }
  }
}

export async function loadSettings() {
  const defaults = { ...DEFAULT_SETTINGS };
  const primary = getChromeStorage(true);
  if (!primary) {
    return defaults;
  }
  await purgeLegacySettings();
  try {
    return await readSettings(primary, defaults, RETRY_ATTEMPTS);
  } catch (error) {
    const fallback = getChromeStorage(false);
    if (!fallback || fallback === primary) {
      return defaults;
    }
    try {
      return await readSettings(fallback, defaults, RETRY_ATTEMPTS);
    } catch {
      return defaults;
    }
  }
}

export function saveSettings(patch) {
  const primary = getChromeStorage(true);
  if (!primary || !patch || typeof patch !== 'object') {
    return Promise.reject(new Error('Settings storage unavailable or invalid payload.'));
  }
  return writeSettings(primary, patch).catch((error) => {
    const fallback = getChromeStorage(false);
    if (!fallback || fallback === primary) {
      throw error;
    }
    return writeSettings(fallback, patch);
  });
}
