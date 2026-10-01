export async function createExportFrame() {
  const frame = document.createElement('iframe');
  frame.title = 'GPT Enhancer export document';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;opacity:0;pointer-events:none;z-index:-1;border:0';
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { frame.onload = frame.onerror = null; reject(new Error('Export document did not load.')); }, 10000);
      frame.onload = () => { clearTimeout(timeout); resolve(); };
      frame.onerror = () => { clearTimeout(timeout); reject(new Error('Export document failed to load.')); };
      document.body.appendChild(frame);
    });
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}
