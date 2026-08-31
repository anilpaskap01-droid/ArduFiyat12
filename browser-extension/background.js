const DEFAULT_BASE = 'https://ardufiyat12-tr.up.railway.app';

async function settings() {
  const data = await chrome.storage.sync.get({ baseUrl: DEFAULT_BASE, apiKey: '' });
  return { baseUrl: String(data.baseUrl || DEFAULT_BASE).replace(/\/$/, ''), apiKey: String(data.apiKey || '') };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ARDUFIYAT_MATCH') return;
  (async () => {
    try {
      const cfg = await settings();
      const query = String(message.title || message.url || '').trim();
      const endpoint = `${cfg.baseUrl}/api/v2/match?q=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, { headers: cfg.apiKey ? { 'x-api-key': cfg.apiKey } : {} });
      const data = await response.json();
      sendResponse({ ok: response.ok, data, baseUrl: cfg.baseUrl });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true;
});
