import { readDb } from './store.js';
import { getGeminiPriceSyncJob, startGeminiPriceSync } from './gemini-price-sync.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000;

function isEnabled() {
  return String(process.env.AUTO_GEMINI_DAILY_SYNC ?? 'true').toLowerCase() !== 'false';
}

function hasApiKey() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

function latestGeminiSyncTime() {
  try {
    const db = readDb();
    const logs = Array.isArray(db.syncLogs) ? db.syncLogs : [];
    let latest = 0;

    for (const log of logs) {
      const isGemini =
        String(log?.trigger || '').startsWith('gemini_') ||
        String(log?.model || '').startsWith('gemini-');
      if (!isGemini) continue;

      const timestamp = Date.parse(log.finishedAt || log.startedAt || '');
      if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
    }

    return latest;
  } catch {
    return 0;
  }
}

function maybeRunDailyGeminiSync() {
  if (!isEnabled() || !hasApiKey()) return;

  const current = getGeminiPriceSyncJob();
  if (current?.status === 'running') return;

  const latest = latestGeminiSyncTime();
  if (latest && Date.now() - latest < DAY_MS) return;

  try {
    const job = startGeminiPriceSync();
    console.log(`Günlük Gemini stok/fiyat kontrolü başlatıldı: ${job.id}`);
  } catch (error) {
    console.error('Günlük Gemini stok/fiyat kontrolü başlatılamadı:', error?.message || error);
  }
}

if (isEnabled()) {
  setTimeout(maybeRunDailyGeminiSync, STARTUP_DELAY_MS).unref();
  setInterval(maybeRunDailyGeminiSync, CHECK_INTERVAL_MS).unref();
}
