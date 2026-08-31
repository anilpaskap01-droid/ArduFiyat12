import http from 'node:http';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { loadEnv } from './src/env.js';
import { readDb, mutateDb, slugify, id } from './src/store.js';
import { bearer, verifyToken } from './src/auth.js';
import { getGeminiPriceSyncConfig, getGeminiPriceSyncJob } from './src/gemini-price-sync.js';

loadEnv();

const externalPort = Number(process.env.PORT || 4173);
const internalPort = externalPort >= 65534 ? 4174 : externalPort + 1;
const originalPort = process.env.PORT;
process.env.PORT = String(internalPort);

await import('./server.js');

if (originalPort === undefined) delete process.env.PORT;
else process.env.PORT = originalPort;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FEATURE_VERSION = '20260831-1';
const rateBuckets = new Map();

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...securityHeaders, ...headers });
  res.end(body);
}

function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
}

function text(res, status, data, contentType = 'text/plain; charset=utf-8') {
  send(res, status, data, { 'Content-Type': contentType });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function currentUser(req, db = readDb()) {
  const payload = verifyToken(bearer(req), 'user');
  if (!payload?.userId) return null;
  return db.users.find((user) => user.id === payload.userId && user.active !== false) || null;
}

function requireUser(req, res, db = readDb()) {
  const user = currentUser(req, db);
  if (!user) {
    json(res, 401, { error: 'Bu özellik için giriş yapmalısın.' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const payload = verifyToken(bearer(req), 'admin');
  if (!payload) {
    json(res, 401, { error: 'Yetkisiz erişim.' });
    return null;
  }
  return payload;
}

function isProUser(user) {
  if (!user?.proActive) return false;
  if (!user.proExpiresAt) return true;
  const expiresAt = Date.parse(user.proExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function publicBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.SITE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

async function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('İstek çok büyük.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) return resolve({ raw: buffer, json: {} });
      try {
        return resolve({ raw: buffer, json: JSON.parse(buffer.toString('utf8')) });
      } catch {
        return resolve({ raw: buffer, json: null });
      }
    });
    req.on('error', reject);
  });
}

function productMap(db) {
  return new Map(db.products.map((product) => [product.id, product]));
}

function storeMap(db) {
  return new Map(db.stores.map((store) => [store.id, store]));
}

function validOffer(db, offer) {
  const store = db.stores.find((item) => item.id === offer.storeId);
  const price = Number(offer.price);
  return Boolean(offer.active !== false && store?.active !== false && Number.isFinite(price) && price > 0);
}

function offersForProduct(db, productId) {
  return db.offers
    .filter((offer) => offer.productId === productId && validOffer(db, offer))
    .sort((a, b) => Number(a.price) + Number(a.shippingCost || 0) - Number(b.price) - Number(b.shippingCost || 0));
}

function bestOffer(db, productId) {
  const offers = offersForProduct(db, productId);
  return offers.find((offer) => offer.stock !== 'out_of_stock') || offers[0] || null;
}

function buildHistoryIndex(db, days = 365) {
  const cutoff = Date.now() - days * DAY_MS;
  const index = new Map();
  for (const entry of db.priceHistory || []) {
    const timestamp = Date.parse(entry.capturedAt || '');
    const price = Number(entry.price);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || !Number.isFinite(price) || price <= 0) continue;
    if (!index.has(entry.productId)) index.set(entry.productId, []);
    index.get(entry.productId).push({
      price,
      capturedAt: entry.capturedAt,
      storeId: entry.storeId
    });
  }
  for (const entries of index.values()) entries.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  return index;
}

function productInsight(db, product, historyIndex) {
  const offer = bestOffer(db, product.id);
  const current = Number(offer?.price);
  const entries = historyIndex.get(product.id) || [];
  const historicalPrices = entries.map((entry) => Number(entry.price)).filter((price) => Number.isFinite(price) && price > 0);
  const sample = Number.isFinite(current) && current > 0 ? [...historicalPrices, current] : historicalPrices;
  const min = sample.length ? Math.min(...sample) : null;
  const max = sample.length ? Math.max(...sample) : null;
  const avg = sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null;
  const med = median(sample);
  const previous = historicalPrices.length ? historicalPrices[historicalPrices.length - 1] : null;
  const delta = previous && Number.isFinite(current) ? ((current - previous) / previous) * 100 : 0;

  let score = 50;
  let label = 'Yeni veri';
  if (Number.isFinite(current) && sample.length >= 2 && Number.isFinite(avg)) {
    if (min && current <= min * 1.03) {
      score = 96;
      label = 'Çok iyi fiyat';
    } else if (current <= avg * 0.9) {
      score = 88;
      label = 'İyi fiyat';
    } else if (current <= avg * 1.03) {
      score = 72;
      label = 'Normal fiyat';
    } else if (current <= avg * 1.15) {
      score = 48;
      label = 'Biraz pahalı';
    } else {
      score = 28;
      label = 'Pahalı';
    }
  }

  return {
    current: Number.isFinite(current) ? round(current) : null,
    min: min === null ? null : round(min),
    max: max === null ? null : round(max),
    average: avg === null ? null : round(avg),
    median: med === null ? null : round(med),
    previous: previous === null ? null : round(previous),
    changePct: round(delta, 1),
    sampleCount: sample.length,
    buyScore: score,
    buyLabel: label,
    verifiedAt: offer?.verifiedAt || offer?.updatedAt || null,
    stock: offer?.stock || 'unknown',
    offerId: offer?.id || null,
    bestStoreId: offer?.storeId || null
  };
}

function productSummary(db, product, historyIndex) {
  const insight = productInsight(db, product, historyIndex);
  const offers = offersForProduct(db, product.id);
  const store = db.stores.find((item) => item.id === insight.bestStoreId);
  const category = db.categories.find((item) => item.id === product.categoryId);
  return {
    id: product.id,
    slug: slugify(product.name),
    name: product.name,
    sku: product.sku || '',
    brand: product.brand || '',
    description: product.description || '',
    tags: Array.isArray(product.tags) ? product.tags : [],
    category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
    imageUrl: product.imageUrl || '',
    bestPrice: insight.current,
    bestStore: store ? { id: store.id, name: store.name, logoText: store.logoText || '' } : null,
    offerCount: offers.length,
    insight
  };
}

function trustScores(db) {
  const staleHours = Number(db.settings?.staleHours || 24);
  const now = Date.now();
  return (db.stores || []).filter((store) => store.active !== false).map((store) => {
    const offers = (db.offers || []).filter((offer) => offer.storeId === store.id);
    const usable = offers.filter((offer) => Number(offer.price) > 0);
    const recent = usable.filter((offer) => {
      const verified = Date.parse(offer.verifiedAt || offer.updatedAt || '');
      return Number.isFinite(verified) && now - verified <= staleHours * HOUR_MS;
    });
    const active = usable.filter((offer) => offer.active !== false && offer.stock !== 'out_of_stock');
    const verifiedRatio = usable.length ? recent.length / usable.length : 0;
    const activeRatio = usable.length ? active.length / usable.length : 0;
    const sourceBonus = usable.some((offer) => ['official_api', 'merchant_csv', 'gemini_url_context'].includes(offer.sourceType)) ? 10 : 5;
    const score = Math.round(clamp(50 + verifiedRatio * 30 + activeRatio * 10 + sourceBonus, 0, 100));
    const latest = usable
      .map((offer) => offer.verifiedAt || offer.updatedAt)
      .filter(Boolean)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
    return {
      id: store.id,
      name: store.name,
      score,
      verifiedRatio: round(verifiedRatio * 100, 0),
      activeOfferCount: active.length,
      offerCount: usable.length,
      lastCheckedAt: latest
    };
  }).sort((a, b) => b.score - a.score);
}

function dealLists(db, summaries) {
  const deals = summaries
    .filter((item) => item.insight.sampleCount >= 2 && item.bestPrice && item.insight.average && item.bestPrice < item.insight.average)
    .map((item) => ({
      ...item,
      discountPct: round(((item.insight.average - item.bestPrice) / item.insight.average) * 100, 1)
    }))
    .filter((item) => item.discountPct >= 3)
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, 40);

  const drops = summaries
    .filter((item) => item.bestPrice && item.insight.previous && item.bestPrice < item.insight.previous)
    .map((item) => ({ ...item, dropPct: round(Math.abs(item.insight.changePct), 1) }))
    .sort((a, b) => b.dropPct - a.dropPct)
    .slice(0, 40);

  return { deals, drops };
}

async function ensureFeatureShape() {
  await mutateDb((db) => {
    if (!Array.isArray(db.priceAlerts)) db.priceAlerts = [];
    if (!Array.isArray(db.reports)) db.reports = [];
    if (!Array.isArray(db.qualityFlags)) db.qualityFlags = [];
    if (!Array.isArray(db.alertNotifications)) db.alertNotifications = [];
    for (const user of db.users || []) if (!Array.isArray(user.favorites)) user.favorites = [];
    if (!db.settings || typeof db.settings !== 'object') db.settings = {};
    if (!db.settings.features || typeof db.settings.features !== 'object') {
      db.settings.features = { priceAlerts: true, favorites: true, compare: true, publicApi: true, pwa: true };
    }
  });
}

function featureLimits(user) {
  const pro = isProUser(user);
  return { pro, favorites: pro ? 200 : 5, alerts: pro ? 100 : 1, historyDays: pro ? 365 : 90 };
}

function userAlerts(db, userId) {
  return (db.priceAlerts || []).filter((alert) => alert.userId === userId && alert.active !== false);
}

function dashboardPayload(req) {
  const db = readDb();
  const user = currentUser(req, db);
  const limits = featureLimits(user);
  const historyIndex = buildHistoryIndex(db, 365);
  const summaries = db.products
    .filter((product) => product.active !== false)
    .map((product) => productSummary(db, product, historyIndex))
    .filter((product) => product.bestPrice !== null);
  const lists = dealLists(db, summaries);
  return {
    user: user ? { id: user.id, isPro: limits.pro } : null,
    limits,
    favorites: user ? (user.favorites || []) : [],
    alerts: user ? userAlerts(db, user.id).map((alert) => ({
      id: alert.id,
      productId: alert.productId,
      type: alert.type,
      targetPrice: alert.targetPrice || null,
      createdAt: alert.createdAt,
      lastTriggeredAt: alert.lastTriggeredAt || null
    })) : [],
    products: summaries,
    deals: lists.deals,
    drops: lists.drops,
    stores: trustScores(db),
    meta: {
      generatedAt: new Date().toISOString(),
      openReports: (db.reports || []).filter((report) => report.status === 'open').length,
      openQualityFlags: (db.qualityFlags || []).filter((flag) => flag.status === 'open').length
    }
  };
}

function historyPayload(req, productId, requestedDays) {
  const db = readDb();
  const user = currentUser(req, db);
  const limits = featureLimits(user);
  const days = clamp(Number(requestedDays || limits.historyDays), 7, limits.historyDays);
  const cutoff = Date.now() - days * DAY_MS;
  const stores = storeMap(db);
  const raw = (db.priceHistory || [])
    .filter((entry) => entry.productId === productId && Date.parse(entry.capturedAt || '') >= cutoff)
    .map((entry) => ({
      date: entry.capturedAt,
      price: Number(entry.price),
      storeId: entry.storeId,
      storeName: stores.get(entry.storeId)?.name || ''
    }))
    .filter((entry) => Number.isFinite(entry.price) && entry.price > 0)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  const byDay = new Map();
  for (const entry of raw) {
    const key = new Date(entry.date).toISOString().slice(0, 10);
    const current = byDay.get(key);
    if (!current || entry.price < current.price) byDay.set(key, entry);
  }

  const current = bestOffer(db, productId);
  const points = [...byDay.entries()].map(([date, entry]) => ({ date, price: entry.price, storeName: entry.storeName }));
  if (current?.price) {
    const today = new Date().toISOString().slice(0, 10);
    const currentStore = stores.get(current.storeId);
    const existing = byDay.get(today);
    if (!existing || Number(current.price) < existing.price) {
      const withoutToday = points.filter((point) => point.date !== today);
      withoutToday.push({ date: today, price: Number(current.price), storeName: currentStore?.name || '' });
      withoutToday.sort((a, b) => a.date.localeCompare(b.date));
      return { days, proExtended: limits.pro, points: withoutToday };
    }
  }
  return { days, proExtended: limits.pro, points };
}

async function toggleFavorite(req, res, productId) {
  const snapshot = readDb();
  const user = requireUser(req, res, snapshot);
  if (!user) return;
  if (!snapshot.products.some((product) => product.id === productId && product.active !== false)) return json(res, 404, { error: 'Ürün bulunamadı.' });
  const limits = featureLimits(user);
  let result = null;
  await mutateDb((db) => {
    const target = db.users.find((item) => item.id === user.id);
    if (!Array.isArray(target.favorites)) target.favorites = [];
    const exists = target.favorites.includes(productId);
    if (exists) target.favorites = target.favorites.filter((idValue) => idValue !== productId);
    else {
      if (target.favorites.length >= limits.favorites) {
        result = { error: `Ücretsiz planda en fazla ${limits.favorites} favori eklenebilir. Pro ile limit yükselir.`, code: 'LIMIT' };
        return;
      }
      target.favorites.push(productId);
    }
    result = { active: !exists, favorites: target.favorites };
  });
  if (result?.error) return json(res, 403, result);
  return json(res, 200, result);
}

async function createAlert(req, res, body) {
  const snapshot = readDb();
  const user = requireUser(req, res, snapshot);
  if (!user) return;
  const productId = String(body?.productId || '').trim();
  const type = body?.type === 'stock' ? 'stock' : 'price';
  const product = snapshot.products.find((item) => item.id === productId && item.active !== false);
  if (!product) return json(res, 404, { error: 'Ürün bulunamadı.' });
  const limits = featureLimits(user);
  const existing = userAlerts(snapshot, user.id);
  if (existing.length >= limits.alerts) return json(res, 403, { error: `Planında en fazla ${limits.alerts} aktif alarm kullanılabilir.`, code: 'LIMIT' });
  const targetPrice = type === 'price' ? Number(body?.targetPrice) : null;
  if (type === 'price' && (!Number.isFinite(targetPrice) || targetPrice <= 0)) return json(res, 400, { error: 'Geçerli bir hedef fiyat gir.' });
  const alert = {
    id: id('alert'), userId: user.id, productId, type,
    targetPrice: type === 'price' ? round(targetPrice) : null,
    active: true, createdAt: new Date().toISOString(), lastTriggeredAt: null, lastStateKey: null
  };
  await mutateDb((db) => db.priceAlerts.push(alert));
  return json(res, 201, alert);
}

async function deleteAlert(req, res, alertId) {
  const snapshot = readDb();
  const user = requireUser(req, res, snapshot);
  if (!user) return;
  let removed = false;
  await mutateDb((db) => {
    const before = db.priceAlerts.length;
    db.priceAlerts = db.priceAlerts.filter((alert) => !(alert.id === alertId && alert.userId === user.id));
    removed = db.priceAlerts.length !== before;
  });
  return json(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Alarm bulunamadı.' });
}

async function createReport(req, res, body) {
  const snapshot = readDb();
  const user = currentUser(req, snapshot);
  const productId = String(body?.productId || '').trim();
  const offerId = String(body?.offerId || '').trim();
  const type = ['wrong_price', 'wrong_stock', 'broken_link', 'other'].includes(body?.type) ? body.type : 'other';
  const message = String(body?.message || '').trim().slice(0, 500);
  if (!snapshot.products.some((product) => product.id === productId)) return json(res, 404, { error: 'Ürün bulunamadı.' });
  if (offerId && !snapshot.offers.some((offer) => offer.id === offerId && offer.productId === productId)) return json(res, 400, { error: 'Teklif ürüne ait değil.' });
  const report = {
    id: id('report'), userId: user?.id || null, productId, offerId: offerId || null, type, message,
    status: 'open', createdAt: new Date().toISOString(), resolvedAt: null
  };
  await mutateDb((db) => db.reports.unshift(report));
  return json(res, 201, { ok: true, reportId: report.id });
}

function searchProducts(db, query, limit = 10) {
  const q = String(query || '').trim().toLocaleLowerCase('tr-TR');
  if (!q) return [];
  const history = buildHistoryIndex(db, 365);
  return db.products
    .filter((product) => product.active !== false)
    .filter((product) => [product.name, product.brand, product.sku, product.description, ...(product.tags || [])].join(' ').toLocaleLowerCase('tr-TR').includes(q))
    .map((product) => productSummary(db, product, history))
    .filter((product) => product.bestPrice !== null)
    .sort((a, b) => Number(a.bestPrice) - Number(b.bestPrice))
    .slice(0, limit);
}

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value || 0));
}

function botPriceText(db, query) {
  const matches = searchProducts(db, query, 5);
  if (!matches.length) return `“${query}” için fiyatlı ürün bulunamadı.`;
  return matches.map((product, index) => {
    const store = product.bestStore?.name ? ` • ${product.bestStore.name}` : '';
    return `${index + 1}. ${product.name}: ${formatMoney(product.bestPrice)}${store} • ${product.insight.buyLabel}`;
  }).join('\n');
}

async function sendTelegram(chatId, textValue) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: textValue, disable_web_page_preview: true })
  });
  return response.ok;
}

async function sendEmail({ to, subject, text: textValue }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !to) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `ArduFiyat <${process.env.SMTP_USER}>`, to, subject, text: textValue,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h2>ArduFiyat</h2><p>${escapeHtml(textValue).replace(/\n/g, '<br>')}</p></div>`
  });
  return true;
}

async function sendDiscordWebhook(textValue) {
  const webhook = String(process.env.DISCORD_ALERT_WEBHOOK_URL || '').trim();
  if (!webhook) return false;
  const response = await fetch(webhook, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: textValue.slice(0, 1900), allowed_mentions: { parse: [] } })
  });
  return response.ok;
}

async function notifyAlert(event) {
  const message = event.alert.type === 'stock'
    ? `${event.product.name} yeniden stokta. Güncel en düşük fiyat: ${formatMoney(event.currentPrice)}.`
    : `${event.product.name} hedef fiyatına ulaştı. Güncel en düşük fiyat: ${formatMoney(event.currentPrice)} (hedef: ${formatMoney(event.alert.targetPrice)}).`;
  const tasks = [sendEmail({ to: event.user.email, subject: 'ArduFiyat fiyat/stok alarmı', text: message })];
  if (event.user.telegramChatId) tasks.push(sendTelegram(event.user.telegramChatId, message));
  if (process.env.DISCORD_ALERT_WEBHOOK_URL) tasks.push(sendDiscordWebhook(`🔔 ${message}`));
  await Promise.allSettled(tasks);
}

async function processAlerts() {
  const events = [];
  await mutateDb((db) => {
    const products = productMap(db);
    for (const alert of db.priceAlerts || []) {
      if (alert.active === false) continue;
      const user = (db.users || []).find((item) => item.id === alert.userId && item.active !== false);
      const product = products.get(alert.productId);
      const offer = product ? bestOffer(db, product.id) : null;
      if (!user || !product || !offer) continue;
      const currentPrice = Number(offer.price);
      const inStock = ['in_stock', 'low_stock'].includes(offer.stock);
      const condition = alert.type === 'stock' ? inStock : Number.isFinite(currentPrice) && currentPrice <= Number(alert.targetPrice);
      const stateKey = alert.type === 'stock' ? `${offer.stock}:${offer.active !== false}` : `${Math.round(currentPrice * 100)}:${condition}`;
      if (condition && alert.lastStateKey !== stateKey) {
        alert.lastTriggeredAt = new Date().toISOString();
        events.push({ alert: { ...alert }, user: { ...user }, product: { ...product }, currentPrice });
        db.alertNotifications.unshift({
          id: id('notification'), alertId: alert.id, userId: user.id, productId: product.id,
          type: alert.type, price: currentPrice, createdAt: alert.lastTriggeredAt
        });
      }
      alert.lastStateKey = stateKey;
    }
    db.alertNotifications = (db.alertNotifications || []).slice(0, 500);
  });
  for (const event of events) await notifyAlert(event);
  if (events.length) console.log(`ArduFiyat alarm sistemi: ${events.length} bildirim tetiklendi.`);
}

function latestStorePrice(db, offer) {
  const entries = (db.priceHistory || [])
    .filter((entry) => entry.productId === offer.productId && entry.storeId === offer.storeId && Number(entry.price) > 0)
    .sort((a, b) => Date.parse(b.capturedAt || '') - Date.parse(a.capturedAt || ''));
  return entries[1]?.price ?? entries[0]?.price ?? null;
}

async function scanQuality() {
  await mutateDb((db) => {
    const history = buildHistoryIndex(db, 30);
    const openKeys = new Set((db.qualityFlags || []).filter((flag) => flag.status === 'open').map((flag) => flag.key));
    for (const offer of db.offers || []) {
      const current = Number(offer.price);
      if (!Number.isFinite(current) || current <= 0) continue;
      const historyPrices = (history.get(offer.productId) || []).map((entry) => entry.price).filter((price) => price > 0);
      if (historyPrices.length < 2) continue;
      const med = median(historyPrices);
      const previous = Number(latestStorePrice(db, offer));
      const medianRatio = med ? current / med : 1;
      const previousDelta = previous > 0 ? Math.abs((current - previous) / previous) : 0;
      const suspicious = medianRatio < 0.35 || medianRatio > 3 || previousDelta > 0.65;
      if (!suspicious) continue;
      const key = `${offer.id}:${Math.round(current * 100)}`;
      if (openKeys.has(key)) continue;
      const severe = medianRatio < 0.15 || medianRatio > 6 || previousDelta > 0.85;
      const confidence = Number(offer.geminiConfidence || 0);
      let held = false;
      if (severe && offer.sourceType === 'gemini_url_context' && confidence < 0.95 && offer.active !== false) {
        offer.active = false;
        offer.qualityHold = true;
        offer.deactivatedReason = 'quality_anomaly';
        held = true;
      }
      db.qualityFlags.unshift({
        id: id('quality'), key, offerId: offer.id, productId: offer.productId, storeId: offer.storeId,
        currentPrice: current, medianPrice: med ? round(med) : null, previousPrice: previous || null,
        medianRatio: round(medianRatio, 2), previousDeltaPct: round(previousDelta * 100, 1), held,
        status: 'open', createdAt: new Date().toISOString(), resolvedAt: null, resolution: null
      });
      openKeys.add(key);
    }
    db.qualityFlags = (db.qualityFlags || []).slice(0, 500);
  });
}

function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function adminHealth() {
  const db = readDb();
  const now = Date.now();
  const staleHours = Number(db.settings?.staleHours || 24);
  const staleOffers = (db.offers || []).filter((offer) => {
    const stamp = Date.parse(offer.verifiedAt || offer.updatedAt || '');
    return offer.active !== false && (!Number.isFinite(stamp) || now - stamp > staleHours * HOUR_MS);
  }).length;
  const lastSync = [...(db.syncLogs || [])].sort((a, b) => Date.parse(b.finishedAt || b.startedAt || '') - Date.parse(a.finishedAt || a.startedAt || ''))[0] || null;
  const gemini = getGeminiPriceSyncConfig();
  const geminiJob = getGeminiPriceSyncJob();
  return {
    database: { postgres: Boolean(process.env.DATABASE_URL), urlConfigured: Boolean(process.env.DATABASE_URL) },
    gemini: { configured: gemini.configured, model: gemini.model, jobStatus: geminiJob?.status || 'idle', lastSync },
    notifications: {
      smtp: smtpReady(), telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      discordWebhook: Boolean(process.env.DISCORD_ALERT_WEBHOOK_URL), discordBot: Boolean(process.env.DISCORD_PUBLIC_KEY)
    },
    publicApi: { enabled: true, apiKeyRequired: Boolean(process.env.ARDUFIYAT_PUBLIC_API_KEY) },
    counts: {
      products: (db.products || []).length, offers: (db.offers || []).length, users: (db.users || []).length,
      activeAlerts: (db.priceAlerts || []).filter((alert) => alert.active !== false).length,
      favorites: (db.users || []).reduce((sum, user) => sum + (user.favorites || []).length, 0),
      staleOffers, openReports: (db.reports || []).filter((report) => report.status === 'open').length,
      openQualityFlags: (db.qualityFlags || []).filter((flag) => flag.status === 'open').length
    },
    reports: (db.reports || []).filter((report) => report.status === 'open').slice(0, 50),
    qualityFlags: (db.qualityFlags || []).filter((flag) => flag.status === 'open').slice(0, 50),
    generatedAt: new Date().toISOString()
  };
}

async function resolveReport(res, reportId) {
  let found = false;
  await mutateDb((db) => {
    const report = db.reports.find((item) => item.id === reportId);
    if (!report) return;
    report.status = 'resolved';
    report.resolvedAt = new Date().toISOString();
    found = true;
  });
  return json(res, found ? 200 : 404, found ? { ok: true } : { error: 'Bildirim bulunamadı.' });
}

async function resolveQuality(res, flagId, action) {
  let result = null;
  await mutateDb((db) => {
    const flag = db.qualityFlags.find((item) => item.id === flagId);
    if (!flag) return;
    const offer = db.offers.find((item) => item.id === flag.offerId);
    if (offer && action === 'approve') {
      offer.qualityHold = false;
      if (offer.deactivatedReason === 'quality_anomaly') { offer.active = true; offer.deactivatedReason = null; }
    }
    if (offer && action === 'reject') { offer.active = false; offer.qualityHold = true; offer.deactivatedReason = 'quality_anomaly'; }
    flag.status = 'resolved';
    flag.resolvedAt = new Date().toISOString();
    flag.resolution = action;
    result = { ok: true, offerActive: offer?.active ?? null };
  });
  return json(res, result ? 200 : 404, result || { error: 'Kalite kaydı bulunamadı.' });
}

async function telegramLinkCode(req, res) {
  const snapshot = readDb();
  const user = requireUser(req, res, snapshot);
  if (!user) return;
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  await mutateDb((db) => {
    const target = db.users.find((item) => item.id === user.id);
    target.telegramLinkCode = code;
    target.telegramLinkExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  });
  return json(res, 200, { code, expiresMinutes: 15, botUsername: process.env.TELEGRAM_BOT_USERNAME || '' });
}

async function handleTelegram(req, res, body) {
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return json(res, 401, { error: 'Geçersiz webhook.' });
  const message = body?.message;
  const chatId = message?.chat?.id;
  const command = String(message?.text || '').trim();
  if (!chatId || !command) return json(res, 200, { ok: true });
  if (command.toLowerCase().startsWith('/bagla ')) {
    const code = command.split(/\s+/)[1]?.toUpperCase();
    let linked = false;
    await mutateDb((db) => {
      const user = db.users.find((item) => item.telegramLinkCode === code && Date.parse(item.telegramLinkExpiresAt || '') > Date.now());
      if (!user) return;
      user.telegramChatId = String(chatId);
      user.telegramLinkCode = null;
      user.telegramLinkExpiresAt = null;
      linked = true;
    });
    await sendTelegram(chatId, linked ? 'ArduFiyat hesabın Telegram ile bağlandı. 🔔' : 'Bağlantı kodu geçersiz veya süresi dolmuş.');
  } else if (command.toLowerCase().startsWith('/fiyat ')) {
    await sendTelegram(chatId, botPriceText(readDb(), command.slice(7).trim()));
  } else if (command.toLowerCase().startsWith('/stok ')) {
    const query = command.slice(6).trim();
    const matches = searchProducts(readDb(), query, 5);
    const reply = matches.length ? matches.map((item) => `${item.name}: ${item.insight.stock === 'out_of_stock' ? 'stokta yok' : 'stok durumu ' + item.insight.stock} • ${formatMoney(item.bestPrice)}`).join('\n') : 'Ürün bulunamadı.';
    await sendTelegram(chatId, reply);
  } else if (command.toLowerCase().startsWith('/firsatlar')) {
    const payload = dashboardPayload({ headers: {} });
    const reply = payload.deals.slice(0, 5).map((item, index) => `${index + 1}. ${item.name}: ${formatMoney(item.bestPrice)} • ortalamaya göre %${item.discountPct} ucuz`).join('\n') || 'Şu an belirgin fırsat bulunamadı.';
    await sendTelegram(chatId, reply);
  } else {
    await sendTelegram(chatId, 'Komutlar: /fiyat ESP32, /stok Arduino Uno, /firsatlar, /bagla KOD');
  }
  return json(res, 200, { ok: true });
}

function discordPublicKey() {
  const hex = String(process.env.DISCORD_PUBLIC_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  return crypto.createPublicKey({ key: Buffer.concat([prefix, Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });
}

function verifyDiscordRequest(req, rawBody) {
  const key = discordPublicKey();
  if (!key) return false;
  const signature = String(req.headers['x-signature-ed25519'] || '');
  const timestamp = String(req.headers['x-signature-timestamp'] || '');
  if (!signature || !timestamp) return false;
  try { return crypto.verify(null, Buffer.concat([Buffer.from(timestamp), rawBody]), key, Buffer.from(signature, 'hex')); }
  catch { return false; }
}

async function handleDiscord(req, res, rawBody, body) {
  if (!verifyDiscordRequest(req, rawBody)) return json(res, 401, { error: 'Geçersiz Discord imzası.' });
  if (body?.type === 1) return json(res, 200, { type: 1 });
  if (body?.type !== 2) return json(res, 200, { type: 4, data: { content: 'Desteklenmeyen etkileşim.', flags: 64 } });
  const name = String(body?.data?.name || '').toLowerCase();
  const query = String(body?.data?.options?.find((option) => option.name === 'urun')?.value || '').trim();
  let content = 'Komut bulunamadı.';
  if (name === 'fiyat') content = botPriceText(readDb(), query);
  if (name === 'firsatlar') {
    const payload = dashboardPayload({ headers: {} });
    content = payload.deals.slice(0, 5).map((item, index) => `${index + 1}. **${item.name}** — ${formatMoney(item.bestPrice)} — %${item.discountPct} avantaj`).join('\n') || 'Şu an belirgin fırsat bulunamadı.';
  }
  return json(res, 200, { type: 4, data: { content: content.slice(0, 1900) } });
}

function apiAllowed(req, res) {
  const required = String(process.env.ARDUFIYAT_PUBLIC_API_KEY || '').trim();
  if (required && req.headers['x-api-key'] !== required) {
    json(res, 401, { error: 'Geçerli x-api-key gerekli.' }, { 'Access-Control-Allow-Origin': '*' });
    return false;
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const minute = Math.floor(Date.now() / 60_000);
  const key = `${ip}:${minute}`;
  const count = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, count);
  if (rateBuckets.size > 5000) for (const bucketKey of rateBuckets.keys()) if (!bucketKey.endsWith(`:${minute}`)) rateBuckets.delete(bucketKey);
  if (count > Number(process.env.PUBLIC_API_RATE_LIMIT || 120)) {
    json(res, 429, { error: 'API hız limiti aşıldı.' }, { 'Access-Control-Allow-Origin': '*' });
    return false;
  }
  return true;
}

function publicProductApi(db, summary) {
  const offers = offersForProduct(db, summary.id).slice(0, 20).map((offer) => {
    const store = db.stores.find((item) => item.id === offer.storeId);
    return { store: store?.name || '', price: Number(offer.price), stock: offer.stock, verifiedAt: offer.verifiedAt || offer.updatedAt || null, url: offer.url };
  });
  return { ...summary, offers };
}

function corsJson(res, status, data) {
  return json(res, status, data, {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-api-key', 'Access-Control-Allow-Methods': 'GET,OPTIONS'
  });
}

function productSeoHtml(req, product) {
  const db = readDb();
  const history = buildHistoryIndex(db, 365);
  const summary = productSummary(db, product, history);
  const offers = offersForProduct(db, product.id).slice(0, 12);
  const stores = storeMap(db);
  const base = publicBaseUrl(req);
  const canonical = `${base}/${slugify(product.name)}-fiyatlari`;
  const low = summary.bestPrice || 0;
  const high = offers.length ? Math.max(...offers.map((offer) => Number(offer.price))) : low;
  const schema = {
    '@context': 'https://schema.org', '@type': 'Product', name: product.name, sku: product.sku || undefined,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    description: product.description || undefined,
    offers: { '@type': 'AggregateOffer', priceCurrency: 'TRY', lowPrice: low, highPrice: high, offerCount: offers.length }
  };
  const rows = offers.map((offer) => {
    const store = stores.get(offer.storeId);
    return `<tr><td>${escapeHtml(store?.name || 'Mağaza')}</td><td>${escapeHtml(offer.stock || 'unknown')}</td><td><b>${escapeHtml(formatMoney(offer.price))}</b></td><td><a href="/go/${encodeURIComponent(offer.id)}" rel="nofollow sponsored">Mağazaya git</a></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(product.name)} Fiyatları | ArduFiyat</title><meta name="description" content="${escapeHtml(product.name)} güncel fiyatlarını, stok durumunu ve mağaza tekliflerini ArduFiyat'ta karşılaştır."><link rel="canonical" href="${escapeHtml(canonical)}"><meta name="robots" content="index,follow"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script><link rel="stylesheet" href="/styles.css"><link rel="manifest" href="/manifest.webmanifest"><style>.seo-wrap{max-width:1100px;margin:auto;padding:34px 22px}.seo-card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:24px;margin:18px 0}.seo-price{font-size:34px;font-weight:900}table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #eee;text-align:left}@media(max-width:700px){table{font-size:13px}}</style></head><body><div class="seo-wrap"><a class="brand" href="/"><span class="brand-mark">A</span><span>ArduFiyat</span></a><div class="seo-card"><span class="eyebrow">GÜNCEL FİYAT KARŞILAŞTIRMA</span><h1>${escapeHtml(product.name)} Fiyatları</h1><p>${escapeHtml(product.description || '')}</p><div class="seo-price">${escapeHtml(formatMoney(summary.bestPrice))}</div><p>${summary.offerCount} mağaza teklifi • ${escapeHtml(summary.insight.buyLabel)} • son kontrol ${summary.insight.verifiedAt ? escapeHtml(new Date(summary.insight.verifiedAt).toLocaleString('tr-TR')) : '—'}</p></div><div class="seo-card"><h2>Mağaza teklifleri</h2><table><thead><tr><th>Mağaza</th><th>Stok</th><th>Fiyat</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="seo-card"><h2>Fiyat değerlendirmesi</h2><p>Fiyat kayıtları üzerinden hesaplanan ArduFiyat skoru: <b>${summary.insight.buyScore}/100 — ${escapeHtml(summary.insight.buyLabel)}</b>.</p><p><a href="/?q=${encodeURIComponent(product.name)}">ArduFiyat'ta karşılaştır ve fiyat alarmı kur →</a></p></div></div><script>if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});</script></body></html>`;
}

function dynamicSitemap(req) {
  const db = readDb();
  const base = publicBaseUrl(req);
  const urls = [`${base}/`, `${base}/firsatlar`, `${base}/fiyati-dusenler`];
  for (const product of db.products || []) if (product.active !== false) urls.push(`${base}/${slugify(product.name)}-fiyatlari`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((urlValue) => `  <url><loc>${escapeHtml(urlValue)}</loc></url>`).join('\n')}\n</urlset>`;
}

function titleForPath(pathname) {
  if (pathname === '/firsatlar') return ['Elektronik Fırsatları | ArduFiyat', 'Geçmiş fiyat ortalamasına göre avantajlı Arduino ve elektronik ürünlerini keşfet.'];
  if (pathname === '/fiyati-dusenler') return ['Fiyatı Düşen Ürünler | ArduFiyat', 'Son fiyat kontrollerinde ucuzlayan Arduino, ESP32, sensör ve elektronik ürünleri.'];
  if (pathname === '/favoriler') return ['Favorilerim | ArduFiyat', 'Takip ettiğin ürünleri, fiyatlarını ve stok durumunu tek ekranda gör.'];
  if (pathname === '/karsilastir') return ['Ürün Karşılaştır | ArduFiyat', 'Elektronik ürünlerini fiyat, stok ve fiyat geçmişiyle yan yana karşılaştır.'];
  return null;
}

function injectHtml(html, pathname) {
  if (pathname === '/admin' || pathname === '/admin/') {
    return html
      .replace('</head>', `<link rel="stylesheet" href="/features.css?v=${FEATURE_VERSION}"></head>`)
      .replace('</body>', `<script type="module" src="/feature-admin.js?v=${FEATURE_VERSION}"></script></body>`);
  }
  const custom = titleForPath(pathname);
  let output = html;
  if (custom) {
    output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(custom[0])}</title>`);
    output = output.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(custom[1])}">`);
  }
  return output
    .replace('</head>', `<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#111827"><link rel="stylesheet" href="/features.css?v=${FEATURE_VERSION}"></head>`)
    .replace('</body>', `<script type="module" src="/features.js?v=${FEATURE_VERSION}"></script></body>`);
}

function proxyBuffer(req, targetPath = req.url) {
  return new Promise((resolve, reject) => {
    const headers = { ...req.headers, host: `127.0.0.1:${internalPort}` };
    const proxy = http.request({ hostname: '127.0.0.1', port: internalPort, path: targetPath, method: req.method, headers }, (upstream) => {
      const chunks = [];
      upstream.on('data', (chunk) => chunks.push(chunk));
      upstream.on('end', () => resolve({ status: upstream.statusCode || 502, headers: upstream.headers, body: Buffer.concat(chunks) }));
    });
    proxy.on('error', reject);
    req.pipe(proxy);
  });
}

function proxyStream(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${internalPort}` };
  const proxy = http.request({ hostname: '127.0.0.1', port: internalPort, path: req.url, method: req.method, headers }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, { ...upstream.headers });
    upstream.pipe(res);
  });
  proxy.on('error', (error) => json(res, 502, { error: `İç servis hatası: ${error.message}` }));
  req.pipe(proxy);
}

async function proxyBootstrap(req, res, url) {
  const internalUrl = new URL(url.toString());
  const query = internalUrl.searchParams.get('q') || '';
  if (query) internalUrl.searchParams.delete('q');
  const result = await proxyBuffer(req, `${internalUrl.pathname}${internalUrl.search}`);
  if (result.status >= 400) {
    const headers = { ...result.headers }; delete headers['content-length'];
    return send(res, result.status, result.body, headers);
  }
  try {
    const payload = JSON.parse(result.body.toString('utf8'));
    const db = readDb();
    const history = buildHistoryIndex(db, 365);
    if (query) {
      const q = query.trim().toLocaleLowerCase('tr-TR');
      const matchingIds = new Set(db.products.filter((product) => [product.name, product.brand, product.sku, product.description, ...(product.tags || [])].join(' ').toLocaleLowerCase('tr-TR').includes(q)).map((product) => product.id));
      payload.products = (payload.products || []).filter((product) => matchingIds.has(product.id));
    }
    payload.products = (payload.products || []).map((product) => ({ ...product, priceInsight: productInsight(db, product, history), seoPath: `/${slugify(product.name)}-fiyatlari` }));
    const trust = new Map(trustScores(db).map((store) => [store.id, store]));
    payload.stores = (payload.stores || []).map((store) => ({ ...store, trust: trust.get(store.id) || null }));
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, { error: `Bootstrap geliştirilemedi: ${error.message}` });
  }
}

async function handleFeatureApi(req, res, url) {
  const path = url.pathname;
  if (req.method === 'GET' && path === '/api/features/dashboard') return json(res, 200, dashboardPayload(req));
  const historyMatch = path.match(/^\/api\/features\/history\/([^/]+)$/);
  if (req.method === 'GET' && historyMatch) return json(res, 200, historyPayload(req, decodeURIComponent(historyMatch[1]), url.searchParams.get('days')));
  const favoriteMatch = path.match(/^\/api\/features\/favorites\/([^/]+)$/);
  if (req.method === 'POST' && favoriteMatch) return toggleFavorite(req, res, decodeURIComponent(favoriteMatch[1]));
  if (req.method === 'POST' && path === '/api/features/alerts') {
    const { json: body } = await readBody(req);
    if (!body) return json(res, 400, { error: 'Geçersiz JSON.' });
    return createAlert(req, res, body);
  }
  const alertMatch = path.match(/^\/api\/features\/alerts\/([^/]+)$/);
  if (req.method === 'DELETE' && alertMatch) return deleteAlert(req, res, decodeURIComponent(alertMatch[1]));
  if (req.method === 'POST' && path === '/api/features/reports') {
    const { json: body } = await readBody(req);
    if (!body) return json(res, 400, { error: 'Geçersiz JSON.' });
    return createReport(req, res, body);
  }
  if (req.method === 'GET' && path === '/api/features/search-suggest') return json(res, 200, { results: searchProducts(readDb(), url.searchParams.get('q'), 12) });
  if (req.method === 'POST' && path === '/api/features/telegram/link-code') return telegramLinkCode(req, res);
  if (path === '/api/features/admin/health' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, adminHealth());
  }
  const reportResolve = path.match(/^\/api\/features\/admin\/reports\/([^/]+)\/resolve$/);
  if (reportResolve && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    return resolveReport(res, decodeURIComponent(reportResolve[1]));
  }
  const qualityResolve = path.match(/^\/api\/features\/admin\/quality\/([^/]+)\/(approve|reject)$/);
  if (qualityResolve && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    return resolveQuality(res, decodeURIComponent(qualityResolve[1]), qualityResolve[2]);
  }
  return json(res, 404, { error: 'Özellik API yolu bulunamadı.' });
}

async function handlePublicApi(req, res, url) {
  if (req.method === 'OPTIONS') return corsJson(res, 204, {});
  if (req.method !== 'GET') return corsJson(res, 405, { error: 'Salt okunur API.' });
  if (!apiAllowed(req, res)) return;
  const db = readDb();
  const history = buildHistoryIndex(db, 365);
  const summaries = db.products.filter((product) => product.active !== false).map((product) => productSummary(db, product, history)).filter((product) => product.bestPrice !== null);
  if (url.pathname === '/api/v1/products') {
    const q = url.searchParams.get('q');
    const limit = clamp(Number(url.searchParams.get('limit') || 50), 1, 100);
    const results = q ? searchProducts(db, q, limit) : summaries.slice(0, limit);
    return corsJson(res, 200, { count: results.length, products: results });
  }
  if (url.pathname === '/api/v1/deals') {
    const lists = dealLists(db, summaries);
    return corsJson(res, 200, { deals: lists.deals, drops: lists.drops });
  }
  const productMatch = url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
  if (productMatch) {
    const key = decodeURIComponent(productMatch[1]);
    const summary = summaries.find((item) => item.id === key || item.slug === key);
    if (!summary) return corsJson(res, 404, { error: 'Ürün bulunamadı.' });
    return corsJson(res, 200, publicProductApi(db, summary));
  }
  return corsJson(res, 404, { error: 'API yolu bulunamadı.' });
}

async function handleBotApi(req, res, url) {
  if (url.pathname === '/api/bot/price' && req.method === 'GET') {
    const configured = String(process.env.BOT_API_TOKEN || '').trim();
    if (configured && req.headers.authorization !== `Bearer ${configured}`) return json(res, 401, { error: 'Yetkisiz bot isteği.' });
    return json(res, 200, { text: botPriceText(readDb(), url.searchParams.get('q') || '') });
  }
  if (url.pathname === '/api/bot/telegram' && req.method === 'POST') {
    const { json: body } = await readBody(req);
    if (!body) return json(res, 400, { error: 'Geçersiz JSON.' });
    return handleTelegram(req, res, body);
  }
  if (url.pathname === '/api/bot/discord' && req.method === 'POST') {
    const { raw, json: body } = await readBody(req);
    if (!body) return json(res, 400, { error: 'Geçersiz JSON.' });
    return handleDiscord(req, res, raw, body);
  }
  return json(res, 404, { error: 'Bot yolu bulunamadı.' });
}

const enhanced = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/features/')) return await handleFeatureApi(req, res, url);
    if (url.pathname.startsWith('/api/v1/')) return await handlePublicApi(req, res, url);
    if (url.pathname.startsWith('/api/bot/')) return await handleBotApi(req, res, url);
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') return await proxyBootstrap(req, res, url);
    if (req.method === 'GET' && url.pathname === '/sitemap.xml') return text(res, 200, dynamicSitemap(req), 'application/xml; charset=utf-8');

    const seoMatch = req.method === 'GET' ? url.pathname.match(/^\/([^/]+)-fiyatlari\/?$/) : null;
    if (seoMatch) {
      const slug = decodeURIComponent(seoMatch[1]);
      const product = readDb().products.find((item) => item.active !== false && slugify(item.name) === slug);
      if (product) return text(res, 200, productSeoHtml(req, product), 'text/html; charset=utf-8');
    }

    const looksHtml = req.method === 'GET' && (
      url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/' ||
      ['/firsatlar', '/fiyati-dusenler', '/favoriler', '/karsilastir'].includes(url.pathname) ||
      (!url.pathname.includes('.') && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/go/') && !url.pathname.startsWith('/ad/'))
    );

    if (looksHtml) {
      const result = await proxyBuffer(req);
      const contentType = String(result.headers['content-type'] || '');
      if (contentType.includes('text/html')) {
        const body = injectHtml(result.body.toString('utf8'), url.pathname);
        const headers = { ...result.headers, 'content-type': 'text/html; charset=utf-8' };
        delete headers['content-length']; delete headers['content-encoding'];
        return send(res, result.status, body, headers);
      }
      const headers = { ...result.headers }; delete headers['content-length'];
      return send(res, result.status, result.body, headers);
    }

    return proxyStream(req, res);
  } catch (error) {
    console.error('Enhanced server error:', error);
    return json(res, 500, { error: error.message || 'Gelişmiş sunucu hatası.' });
  }
});

await ensureFeatureShape();

setTimeout(() => processAlerts().catch((error) => console.error('Alarm kontrolü başarısız:', error.message)), 5 * 60_000).unref();
setInterval(() => processAlerts().catch((error) => console.error('Alarm kontrolü başarısız:', error.message)), HOUR_MS).unref();
setTimeout(() => scanQuality().catch((error) => console.error('Veri kalite kontrolü başarısız:', error.message)), 2 * 60_000).unref();
setInterval(() => scanQuality().catch((error) => console.error('Veri kalite kontrolü başarısız:', error.message)), 6 * HOUR_MS).unref();

enhanced.listen(externalPort, () => {
  console.log(`ArduFiyat gelişmiş katman http://localhost:${externalPort} → iç servis :${internalPort}`);
  console.log('Özellikler: favoriler, fiyat/stok alarmı, fiyat geçmişi, fırsatlar, SEO, PWA, API, bot ve sistem sağlığı aktif.');
});
