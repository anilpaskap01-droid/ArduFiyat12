import http from 'node:http';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import { loadEnv } from './src/env.js';
import { readDb, mutateDb, id, slugify } from './src/store.js';
import { bearer, verifyToken } from './src/auth.js';
import {
  activeOffers,
  bestOffer,
  priceIntelligence,
  purchaseTiming,
  storeTrustScores,
  recommendedOffers,
  optimizeBasket,
  searchProducts,
  resolveBom,
  projectCost,
  alternativesForProduct,
  compatibility,
  accessoriesForProduct,
  technicalFilterMeta,
  categoryStats,
  arduIndex,
  priceCalendar,
  globalComparison,
  normalizeText,
  round,
  num
} from './src/commerce-intelligence.js';

loadEnv();

const externalPort = Number(process.env.PORT || 4173);
const internalPort = externalPort >= 65533 ? 4174 : externalPort + 1;
const originalPort = process.env.PORT;
process.env.PORT = String(internalPort);
await import('./enhanced-server.js');
if (originalPort === undefined) delete process.env.PORT;
else process.env.PORT = originalPort;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MEGA_VERSION = '20260831-2';
const apiRate = new Map();

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()'
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

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  send(res, status, body, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
}

function redirect(res, location) {
  send(res, 302, '', { Location: location, 'Cache-Control': 'no-store' });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function sha(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function currentUser(req, db = readDb()) {
  const payload = verifyToken(bearer(req), 'user');
  if (!payload?.userId) return null;
  return (db.users || []).find((user) => user.id === payload.userId && user.active !== false) || null;
}

function requireUser(req, res, db = readDb()) {
  const user = currentUser(req, db);
  if (!user) json(res, 401, { error: 'Bu özellik için giriş yapmalısın.' });
  return user;
}

function requireAdmin(req, res) {
  const payload = verifyToken(bearer(req), 'admin');
  if (!payload) {
    json(res, 401, { error: 'Admin yetkisi gerekli.' });
    return null;
  }
  return payload;
}

async function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on('data', (chunk) => {
      length += chunk.length;
      if (length > limit) {
        reject(new Error('İstek çok büyük.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      if (!raw.length) return resolve({ raw, json: {} });
      try { resolve({ raw, json: JSON.parse(raw.toString('utf8')) }); }
      catch { resolve({ raw, json: null }); }
    });
    req.on('error', reject);
  });
}

function projectDefaults() {
  return [
    {
      id: 'esp32-hava-istasyonu', name: 'ESP32 Hava İstasyonu', description: 'Wi-Fi bağlantılı sıcaklık/nem ekranı.',
      tags: ['iot', 'esp32', 'sensor'], items: [
        { query: 'ESP32', qty: 1 }, { query: 'DHT22', qty: 1 }, { query: 'OLED', qty: 1 }, { query: 'breadboard', qty: 1 }, { query: 'jumper', qty: 1 }
      ]
    },
    {
      id: 'arduino-robot-araba', name: 'Arduino Robot Araba', description: 'Ultrasonik sensörlü temel mobil robot.',
      tags: ['robotik', 'arduino'], items: [
        { query: 'Arduino Uno', qty: 1 }, { query: 'L298N', qty: 1 }, { query: 'DC motor', qty: 2 }, { query: 'HC-SR04', qty: 1 }, { query: 'jumper', qty: 1 }
      ]
    },
    {
      id: 'akilli-sulama', name: 'Akıllı Sulama', description: 'Toprak nemine göre otomatik sulama.',
      tags: ['iot', 'tarim'], items: [
        { query: 'ESP32', qty: 1 }, { query: 'toprak nem sensor', qty: 1 }, { query: 'role modul', qty: 1 }, { query: 'pompa', qty: 1 }
      ]
    },
    {
      id: 'mini-elektronik-set', name: 'Başlangıç Elektronik Seti', description: 'Breadboard üzerinde temel deneyler için.',
      tags: ['baslangic'], items: [
        { query: 'Arduino Nano', qty: 1 }, { query: 'breadboard', qty: 1 }, { query: 'jumper', qty: 1 }, { query: 'direnc seti', qty: 1 }, { query: 'led', qty: 5 }
      ]
    }
  ];
}

async function ensureMegaShape() {
  await mutateDb((db) => {
    const arrays = [
      'communityComments', 'priceSubmissions', 'projectTemplates', 'globalOffers', 'apiKeys',
      'apiUsage', 'affiliateClicks', 'merchantFeedLogs', 'weeklyDigests', 'smartNotifications'
    ];
    for (const key of arrays) if (!Array.isArray(db[key])) db[key] = [];
    if (!db.fxRates || typeof db.fxRates !== 'object') db.fxRates = {};
    if (!db.megaSettings || typeof db.megaSettings !== 'object') db.megaSettings = {};
    if (!db.projectTemplates.length) db.projectTemplates = projectDefaults();
    for (const user of db.users || []) {
      if (!Number.isFinite(Number(user.points))) user.points = 0;
      if (!Array.isArray(user.interests)) user.interests = [];
      if (!user.smartPriceState || typeof user.smartPriceState !== 'object') user.smartPriceState = {};
      if (user.digestEnabled === undefined) user.digestEnabled = true;
      if (!Number.isFinite(Number(user.minAlertPct))) user.minAlertPct = 5;
      if (!Number.isFinite(Number(user.minAlertTry))) user.minAlertTry = 50;
    }
  });
}

function levelForPoints(points = 0) {
  const value = Number(points || 0);
  if (value >= 1000) return { level: 6, name: 'Ardu Ustası' };
  if (value >= 500) return { level: 5, name: 'Devre Uzmanı' };
  if (value >= 250) return { level: 4, name: 'Maker+' };
  if (value >= 100) return { level: 3, name: 'Maker' };
  if (value >= 25) return { level: 2, name: 'Çırak' };
  return { level: 1, name: 'Başlangıç' };
}

function publicCommunityUser(user) {
  const level = levelForPoints(user?.points || 0);
  return { id: user?.id || null, name: user?.name || 'ArduFiyat kullanıcısı', points: Number(user?.points || 0), ...level };
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function matchStoreDomain(urlValue, domainValue) {
  try {
    const host = new URL(urlValue).hostname.toLowerCase().replace(/^www\./, '');
    const domain = String(domainValue || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return Boolean(domain && (host === domain || host.endsWith(`.${domain}`)));
  } catch { return false; }
}

function profilePayload(user) {
  return {
    city: user.city || '', interests: user.interests || [], digestEnabled: user.digestEnabled !== false,
    minAlertPct: Number(user.minAlertPct || 5), minAlertTry: Number(user.minAlertTry || 50),
    telegramLinked: Boolean(user.telegramChatId), points: Number(user.points || 0), ...levelForPoints(user.points)
  };
}

function catalogEntry(db, product) {
  const offer = bestOffer(db, product.id);
  const category = (db.categories || []).find((item) => item.id === product.categoryId);
  return {
    id: product.id, name: product.name, brand: product.brand || '', sku: product.sku || '', categoryId: product.categoryId,
    category: category?.name || '', price: num(offer?.price), stock: offer?.stock || 'unknown', imageUrl: product.displayImageUrl || product.imageUrl || '',
    specs: product.specs || {}, tags: product.tags || [], unavailableInTurkey: !offer,
    insight: priceIntelligence(db, product.id)
  };
}

function megaDashboard(req) {
  const db = readDb();
  const user = currentUser(req, db);
  const products = (db.products || []).filter((item) => item.active !== false);
  const intelligence = products.map((product) => ({ product, info: priceIntelligence(db, product.id) })).filter((row) => row.info?.currentPrice);
  return {
    index: arduIndex(db),
    categories: categoryStats(db),
    stores: storeTrustScores(db).slice(0, 20),
    realDeals: intelligence.filter((row) => row.info.realDiscount).sort((a, b) => b.info.discountVs30Pct - a.info.discountVs30Pct).slice(0, 20).map((row) => ({ id: row.product.id, name: row.product.name, ...row.info })),
    buyNow: intelligence.filter((row) => row.info.action === 'AL').sort((a, b) => b.info.buyScore - a.info.buyScore).slice(0, 20).map((row) => ({ id: row.product.id, name: row.product.name, ...row.info })),
    templates: db.projectTemplates || [],
    user: user ? profilePayload(user) : null,
    counts: {
      comments: (db.communityComments || []).filter((item) => item.status !== 'removed').length,
      pendingSubmissions: (db.priceSubmissions || []).filter((item) => item.status === 'pending').length,
      globalOffers: (db.globalOffers || []).filter((item) => item.active !== false).length
    }
  };
}

function detailedProduct(req, productId) {
  const db = readDb();
  const product = (db.products || []).find((item) => item.id === productId || slugify(item.name) === productId);
  if (!product) return null;
  const user = currentUser(req, db);
  const city = user?.city || '';
  const comments = (db.communityComments || []).filter((item) => item.productId === product.id && item.status !== 'removed').slice(0, 100).map((item) => {
    const author = (db.users || []).find((userItem) => userItem.id === item.userId);
    return { id: item.id, text: item.text, createdAt: item.createdAt, helpful: Number(item.helpful || 0), author: publicCommunityUser(author) };
  });
  return {
    product: catalogEntry(db, product),
    intelligence: priceIntelligence(db, product.id),
    timing: purchaseTiming(db, product.id),
    calendar: priceCalendar(db, product.id),
    recommendedOffers: recommendedOffers(db, product.id, city),
    alternatives: alternativesForProduct(db, product.id),
    accessories: accessoriesForProduct(db, product.id),
    global: globalComparison(db, product.id, db.fxRates?.rates || {}),
    comments
  };
}

async function addComment(req, res, body) {
  const db = readDb();
  const user = requireUser(req, res, db);
  if (!user) return;
  const productId = String(body?.productId || '').trim();
  const product = (db.products || []).find((item) => item.id === productId);
  if (!product) return json(res, 404, { error: 'Ürün bulunamadı.' });
  const value = String(body?.text || '').trim().slice(0, 1200);
  if (value.length < 3) return json(res, 400, { error: 'Yorum çok kısa.' });
  const comment = { id: id('comment'), userId: user.id, productId, text: value, helpful: 0, status: 'active', createdAt: new Date().toISOString() };
  await mutateDb((target) => {
    target.communityComments.unshift(comment);
    const account = target.users.find((item) => item.id === user.id);
    account.points = Number(account.points || 0) + 2;
  });
  return json(res, 201, { ...comment, author: publicCommunityUser({ ...user, points: Number(user.points || 0) + 2 }) });
}

async function submitPrice(req, res, body) {
  const db = readDb();
  const user = requireUser(req, res, db);
  if (!user) return;
  const productId = String(body?.productId || '').trim();
  const offerId = String(body?.offerId || '').trim();
  const price = num(body?.price);
  const stock = ['in_stock', 'low_stock', 'out_of_stock', 'unknown'].includes(body?.stock) ? body.stock : 'unknown';
  const sourceUrl = String(body?.sourceUrl || '').trim();
  if (!(db.products || []).some((item) => item.id === productId)) return json(res, 404, { error: 'Ürün bulunamadı.' });
  if (!price || price <= 0 || price > 100_000_000) return json(res, 400, { error: 'Geçerli fiyat gir.' });
  if (sourceUrl && !isValidHttpUrl(sourceUrl)) return json(res, 400, { error: 'Kaynak bağlantısı geçersiz.' });
  const submission = {
    id: id('submission'), userId: user.id, productId, offerId: offerId || null,
    price: round(price), stock, sourceUrl, note: String(body?.note || '').trim().slice(0, 500),
    status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null
  };
  await mutateDb((target) => target.priceSubmissions.unshift(submission));
  return json(res, 201, { ok: true, submissionId: submission.id });
}

async function resolveSubmission(req, res, submissionId, body) {
  if (!requireAdmin(req, res)) return;
  const action = body?.action === 'accept' ? 'accept' : body?.action === 'reject' ? 'reject' : '';
  if (!action) return json(res, 400, { error: 'action accept veya reject olmalı.' });
  let result = null;
  await mutateDb((db) => {
    const submission = db.priceSubmissions.find((item) => item.id === submissionId && item.status === 'pending');
    if (!submission) return;
    submission.status = action === 'accept' ? 'accepted' : 'rejected';
    submission.resolvedAt = new Date().toISOString();
    if (action === 'accept') {
      let offer = submission.offerId ? db.offers.find((item) => item.id === submission.offerId) : null;
      if (!offer && submission.sourceUrl) offer = db.offers.find((item) => item.productId === submission.productId && item.url === submission.sourceUrl);
      if (offer) {
        const previous = Number(offer.price);
        offer.price = submission.price;
        offer.stock = submission.stock;
        offer.active = submission.stock !== 'out_of_stock';
        offer.verifiedAt = submission.resolvedAt;
        offer.updatedAt = submission.resolvedAt;
        offer.sourceType = 'community_verified';
        if (previous !== submission.price) db.priceHistory.push({ id: id('ph'), productId: offer.productId, storeId: offer.storeId, price: submission.price, capturedAt: submission.resolvedAt });
      }
      const user = db.users.find((item) => item.id === submission.userId);
      if (user) user.points = Number(user.points || 0) + 10;
    }
    result = { ok: true, status: submission.status };
  });
  return json(res, result ? 200 : 404, result || { error: 'Bekleyen bildirim bulunamadı.' });
}

async function updateProfile(req, res, body) {
  const snapshot = readDb();
  const user = requireUser(req, res, snapshot);
  if (!user) return;
  const interests = Array.isArray(body?.interests) ? [...new Set(body.interests.map((value) => String(value).trim()).filter(Boolean))].slice(0, 12) : user.interests || [];
  const city = String(body?.city ?? user.city ?? '').trim().slice(0, 80);
  const minAlertPct = Math.max(1, Math.min(80, num(body?.minAlertPct, user.minAlertPct || 5)));
  const minAlertTry = Math.max(1, Math.min(1_000_000, num(body?.minAlertTry, user.minAlertTry || 50)));
  let result = null;
  await mutateDb((db) => {
    const account = db.users.find((item) => item.id === user.id);
    account.interests = interests;
    account.city = city;
    account.digestEnabled = body?.digestEnabled === undefined ? account.digestEnabled !== false : body.digestEnabled === true;
    account.minAlertPct = minAlertPct;
    account.minAlertTry = minAlertTry;
    result = profilePayload(account);
  });
  return json(res, 200, result);
}

function catalogFiltered(url) {
  const db = readDb();
  const q = normalizeText(url.searchParams.get('q') || '');
  const brand = normalizeText(url.searchParams.get('brand') || '');
  const category = normalizeText(url.searchParams.get('category') || '');
  const specFilters = [...url.searchParams.entries()].filter(([key]) => key.startsWith('spec.'));
  const categories = new Map((db.categories || []).map((item) => [item.id, item]));
  return (db.products || []).filter((product) => product.active !== false).filter((product) => {
    if (q && !normalizeText([product.name, product.brand, product.sku, ...(product.tags || [])].join(' ')).includes(q)) return false;
    if (brand && normalizeText(product.brand) !== brand) return false;
    if (category && normalizeText(categories.get(product.categoryId)?.slug || categories.get(product.categoryId)?.name || '') !== category) return false;
    for (const [key, expected] of specFilters) {
      const specKey = key.slice(5);
      if (normalizeText(product.specs?.[specKey]) !== normalizeText(expected)) return false;
    }
    return true;
  }).map((product) => catalogEntry(db, product)).filter((item) => item.price).slice(0, 200);
}

async function generateDevKey(req, res) {
  const snapshot = readDb();
  const user = requireUser(req, res, snapshot);
  if (!user) return;
  const raw = `af_live_${crypto.randomBytes(24).toString('base64url')}`;
  const keyRecord = { id: id('apikey'), userId: user.id, prefix: raw.slice(0, 12), hash: sha(raw), active: true, requests: 0, createdAt: new Date().toISOString(), lastUsedAt: null };
  await mutateDb((db) => {
    for (const key of db.apiKeys) if (key.userId === user.id) key.active = false;
    db.apiKeys.push(keyRecord);
  });
  return json(res, 201, { apiKey: raw, prefix: keyRecord.prefix, note: 'Anahtar yalnızca bu yanıtta gösterilir.' });
}

function apiIdentity(req, db) {
  const supplied = String(req.headers['x-api-key'] || '').trim();
  const envKey = String(process.env.ARDUFIYAT_PUBLIC_API_KEY || '').trim();
  if (envKey && supplied === envKey) return { id: 'environment', limit: Number(process.env.PUBLIC_API_RATE_LIMIT || 240) };
  if (supplied) {
    const hashed = sha(supplied);
    const record = (db.apiKeys || []).find((item) => item.active !== false && item.hash === hashed);
    if (!record) return { error: 'API anahtarı geçersiz.' };
    return { id: record.id, userId: record.userId, record, limit: 300 };
  }
  return { id: `anon:${String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0]}`, limit: 60 };
}

function enforceApiRate(req, res, db) {
  const identity = apiIdentity(req, db);
  if (identity.error) { json(res, 401, { error: identity.error }, { 'Access-Control-Allow-Origin': '*' }); return null; }
  const minute = Math.floor(Date.now() / 60_000);
  const key = `${identity.id}:${minute}`;
  const count = (apiRate.get(key) || 0) + 1;
  apiRate.set(key, count);
  if (count > identity.limit) { json(res, 429, { error: 'API hız limiti aşıldı.' }, { 'Access-Control-Allow-Origin': '*' }); return null; }
  if (identity.record) {
    queueMicrotask(() => mutateDb((target) => {
      const record = target.apiKeys.find((item) => item.id === identity.record.id);
      if (record) { record.requests = Number(record.requests || 0) + 1; record.lastUsedAt = new Date().toISOString(); }
    }).catch(() => {}));
  }
  return identity;
}

function apiCors(res, status, data) {
  return json(res, status, data, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-api-key',
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
  });
}

function publicApiProduct(db, product) {
  return {
    ...catalogEntry(db, product),
    offers: recommendedOffers(db, product.id).slice(0, 20),
    alternatives: alternativesForProduct(db, product.id, 5),
    accessories: accessoriesForProduct(db, product.id).slice(0, 5)
  };
}

async function merchantKey(req, res, body) {
  if (!requireAdmin(req, res)) return;
  const storeId = String(body?.storeId || '').trim();
  const raw = `af_merchant_${crypto.randomBytes(24).toString('base64url')}`;
  let result = null;
  await mutateDb((db) => {
    const store = db.stores.find((item) => item.id === storeId);
    if (!store) return;
    store.merchantKeyHash = sha(raw);
    store.merchantEnabled = true;
    store.allowSponsored = body?.allowSponsored === true;
    result = { storeId, merchantKey: raw, allowSponsored: store.allowSponsored };
  });
  return json(res, result ? 201 : 404, result || { error: 'Mağaza bulunamadı.' });
}

async function updateStoreLogistics(req, res, body) {
  if (!requireAdmin(req, res)) return;
  const storeId = String(body?.storeId || '').trim();
  let result = null;
  await mutateDb((db) => {
    const store = db.stores.find((item) => item.id === storeId);
    if (!store) return;
    store.shippingBase = Math.max(0, num(body?.shippingBase, store.shippingBase || 0));
    store.freeShippingThreshold = Math.max(0, num(body?.freeShippingThreshold, store.freeShippingThreshold || 0));
    store.deliveryDaysMin = Math.max(1, Math.min(30, Math.round(num(body?.deliveryDaysMin, store.deliveryDaysMin || 2))));
    store.deliveryDaysMax = Math.max(store.deliveryDaysMin, Math.min(60, Math.round(num(body?.deliveryDaysMax, store.deliveryDaysMax || 5))));
    if (body?.deliveryByCity && typeof body.deliveryByCity === 'object') store.deliveryByCity = body.deliveryByCity;
    result = { ok: true, storeId };
  });
  return json(res, result ? 200 : 404, result || { error: 'Mağaza bulunamadı.' });
}

async function merchantFeed(req, res, body) {
  const key = String(req.headers['x-merchant-key'] || '').trim();
  if (!key) return json(res, 401, { error: 'x-merchant-key gerekli.' });
  const snapshot = readDb();
  const store = (snapshot.stores || []).find((item) => item.merchantEnabled && item.merchantKeyHash === sha(key));
  if (!store) return json(res, 401, { error: 'Merchant anahtarı geçersiz.' });
  const items = Array.isArray(body?.items) ? body.items.slice(0, 2000) : [];
  let summary = { processed: items.length, updated: 0, created: 0, skipped: 0 };
  await mutateDb((db) => {
    for (const item of items) {
      const product = item.productId
        ? db.products.find((candidate) => candidate.id === item.productId)
        : db.products.find((candidate) => normalizeText(candidate.sku) && normalizeText(candidate.sku) === normalizeText(item.sku));
      const price = num(item.price);
      const url = String(item.url || '').trim();
      if (!product || !price || price <= 0 || !isValidHttpUrl(url) || !matchStoreDomain(url, store.domain)) { summary.skipped += 1; continue; }
      let offer = item.offerId ? db.offers.find((candidate) => candidate.id === item.offerId && candidate.storeId === store.id) : null;
      if (!offer) offer = db.offers.find((candidate) => candidate.productId === product.id && candidate.storeId === store.id);
      const timestamp = new Date().toISOString();
      if (!offer) {
        offer = { id: id('offer'), productId: product.id, storeId: store.id, price, stock: 'unknown', url, active: true, createdAt: timestamp };
        db.offers.push(offer);
        summary.created += 1;
      } else summary.updated += 1;
      const previous = Number(offer.price);
      offer.price = round(price);
      offer.stock = ['in_stock', 'low_stock', 'out_of_stock', 'unknown'].includes(item.stock) ? item.stock : 'unknown';
      offer.url = url;
      offer.active = offer.stock !== 'out_of_stock';
      offer.shipping = String(item.shipping || offer.shipping || '').slice(0, 120);
      offer.verifiedAt = timestamp;
      offer.updatedAt = timestamp;
      offer.sourceType = 'merchant_feed';
      offer.sponsored = store.allowSponsored && item.sponsored === true;
      offer.sponsorLabel = offer.sponsored ? String(item.sponsorLabel || 'Sponsorlu').slice(0, 60) : null;
      offer.affiliateUrl = store.allowSponsored && isValidHttpUrl(item.affiliateUrl) ? item.affiliateUrl : offer.affiliateUrl || null;
      if (previous !== Number(offer.price)) db.priceHistory.push({ id: id('ph'), productId: product.id, storeId: store.id, price: Number(offer.price), capturedAt: timestamp });
    }
    db.priceHistory = db.priceHistory.slice(-10000);
    db.merchantFeedLogs.unshift({ id: id('merchantlog'), storeId: store.id, ...summary, createdAt: new Date().toISOString() });
    db.merchantFeedLogs = db.merchantFeedLogs.slice(0, 200);
  });
  return json(res, 200, summary);
}

async function addGlobalOffer(req, res, body) {
  if (!requireAdmin(req, res)) return;
  const snapshot = readDb();
  const productId = String(body?.productId || '').trim();
  if (!(snapshot.products || []).some((item) => item.id === productId)) return json(res, 404, { error: 'Ürün bulunamadı.' });
  const price = num(body?.price);
  if (!price || price <= 0) return json(res, 400, { error: 'Fiyat geçersiz.' });
  const offer = {
    id: id('global'), productId, source: String(body?.source || 'Global mağaza').slice(0, 100), country: String(body?.country || '').slice(0, 80),
    price: round(price), currency: String(body?.currency || 'USD').toUpperCase().slice(0, 5), shipping: Math.max(0, num(body?.shipping, 0)),
    estimatedTaxRate: Math.max(0, Math.min(1, num(body?.estimatedTaxRate, 0))), url: String(body?.url || ''), active: true,
    updatedAt: new Date().toISOString()
  };
  await mutateDb((db) => db.globalOffers.push(offer));
  return json(res, 201, offer);
}

async function refreshFxRates() {
  if (String(process.env.FX_AUTO_SYNC ?? 'true').toLowerCase() === 'false') return;
  try {
    const response = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`TCMB ${response.status}`);
    const xml = await response.text();
    const rates = {};
    for (const code of ['USD', 'EUR', 'GBP']) {
      const block = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${code}"[\\s\\S]*?<\\/Currency>`, 'i'))?.[0] || '';
      const selling = block.match(/<ForexSelling>([^<]+)<\/ForexSelling>/i)?.[1];
      const value = Number(String(selling || '').replace(',', '.'));
      if (Number.isFinite(value) && value > 0) rates[code] = value;
    }
    if (Object.keys(rates).length) await mutateDb((db) => { db.fxRates = { base: 'TRY', rates, updatedAt: new Date().toISOString(), source: 'TCMB' }; });
  } catch (error) {
    console.warn('Kur güncellemesi başarısız:', error.message);
  }
}

function extractModelText(response) {
  if (typeof response?.text === 'string') return response.text;
  if (typeof response?.output_text === 'string') return response.output_text;
  return (response?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []).map((part) => part?.text || '').join('');
}

async function enrichSpecs(req, res, productId) {
  if (!requireAdmin(req, res)) return;
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return json(res, 503, { error: 'GEMINI_API_KEY tanımlı değil.' });
  const snapshot = readDb();
  const product = snapshot.products.find((item) => item.id === productId);
  if (!product) return json(res, 404, { error: 'Ürün bulunamadı.' });
  const offer = bestOffer(snapshot, productId);
  if (!offer?.url) return json(res, 400, { error: 'Teknik özellik çıkarmak için ürün URL gerekli.' });
  const model = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const client = new GoogleGenAI({ apiKey });
  try {
    const response = await client.models.generateContent({
      model,
      contents: [`Exact URL: ${offer.url}\nExpected product: ${product.name}\nReturn ONLY JSON: {"specs":{"voltage":"","logicVoltage":"","processor":"","memory":"","connectivity":"","interface":"","dimensions":""},"compatibilityTags":[""],"accessoryQueries":[""]}. Use only facts visible on the exact product page. Omit unknown keys. Never guess.`],
      config: { tools: [{ urlContext: {} }], temperature: 0 }
    });
    const raw = extractModelText(response).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    const specs = parsed?.specs && typeof parsed.specs === 'object' ? parsed.specs : {};
    const tags = Array.isArray(parsed?.compatibilityTags) ? parsed.compatibilityTags.map(String).slice(0, 20) : [];
    await mutateDb((db) => {
      const target = db.products.find((item) => item.id === productId);
      target.specs = { ...(target.specs || {}), ...specs };
      target.compatibilityTags = [...new Set([...(target.compatibilityTags || []), ...tags])];
      target.aiAccessoryQueries = Array.isArray(parsed?.accessoryQueries) ? parsed.accessoryQueries.map(String).slice(0, 10) : target.aiAccessoryQueries || [];
      target.specsUpdatedAt = new Date().toISOString();
    });
    return json(res, 200, { specs, compatibilityTags: tags, accessoryQueries: parsed?.accessoryQueries || [] });
  } catch (error) {
    return json(res, 502, { error: `Gemini teknik özellik çıkarımı başarısız: ${String(error?.message || error).slice(0, 300)}` });
  }
}

function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendEmail(to, subject, plain) {
  if (!smtpReady() || !to) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `ArduFiyat <${process.env.SMTP_USER}>`, to, subject,
    text: plain,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px"><h2>ArduFiyat</h2><p>${escapeHtml(plain).replace(/\n/g, '<br>')}</p></div>`
  });
  return true;
}

async function sendTelegram(chatId, plain) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: plain.slice(0, 3900), disable_web_page_preview: true })
  });
  return response.ok;
}

async function weeklyDigest() {
  if (!smtpReady()) return;
  const snapshot = readDb();
  const due = (snapshot.users || []).filter((user) => user.active !== false && user.digestEnabled !== false && user.email && Array.isArray(user.favorites) && user.favorites.length)
    .filter((user) => !user.lastWeeklyDigestAt || Date.now() - Date.parse(user.lastWeeklyDigestAt) >= 6.5 * DAY_MS)
    .slice(0, 100);
  for (const user of due) {
    const rows = user.favorites.slice(0, 20).map((productId) => {
      const product = snapshot.products.find((item) => item.id === productId);
      const insight = product ? priceIntelligence(snapshot, productId) : null;
      return product && insight?.currentPrice ? `${product.name}: ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(insight.currentPrice)} • ${insight.action} • 30 güne göre %${insight.discountVs30Pct}` : null;
    }).filter(Boolean);
    if (!rows.length) continue;
    try {
      await sendEmail(user.email, 'ArduFiyat haftalık takip özeti', `Takip listenin haftalık özeti:\n\n${rows.join('\n')}`);
      await mutateDb((db) => {
        const target = db.users.find((item) => item.id === user.id);
        if (target) target.lastWeeklyDigestAt = new Date().toISOString();
        db.weeklyDigests.unshift({ id: id('digest'), userId: user.id, createdAt: new Date().toISOString(), count: rows.length });
        db.weeklyDigests = db.weeklyDigests.slice(0, 500);
      });
    } catch (error) { console.error('Haftalık özet gönderilemedi:', error.message); }
  }
}

async function smartFavoriteAlerts() {
  const notifications = [];
  await mutateDb((db) => {
    for (const user of db.users || []) {
      if (user.active === false || !Array.isArray(user.favorites)) continue;
      if (!user.smartPriceState || typeof user.smartPriceState !== 'object') user.smartPriceState = {};
      const minPct = Number(user.minAlertPct || 5);
      const minTry = Number(user.minAlertTry || 50);
      for (const productId of user.favorites) {
        const product = db.products.find((item) => item.id === productId);
        const current = num(bestOffer(db, productId)?.price);
        if (!product || !current) continue;
        const previous = num(user.smartPriceState[productId]);
        user.smartPriceState[productId] = current;
        if (!previous || current >= previous) continue;
        const delta = previous - current;
        const pct = (delta / previous) * 100;
        if (pct < minPct && delta < minTry) continue;
        notifications.push({ user: { ...user }, product: { ...product }, previous, current, pct: round(pct, 1) });
        db.smartNotifications.unshift({ id: id('smart'), userId: user.id, productId, previous, current, pct: round(pct, 1), createdAt: new Date().toISOString() });
      }
    }
    db.smartNotifications = db.smartNotifications.slice(0, 1000);
  });
  for (const note of notifications) {
    const message = `${note.product.name} ucuzladı: ${note.previous} TL → ${note.current} TL (%${note.pct}).`;
    await Promise.allSettled([sendEmail(note.user.email, 'ArduFiyat akıllı fiyat bildirimi', message), sendTelegram(note.user.telegramChatId, message)]);
  }
}

function botHelp() {
  return 'Komutlar: /fiyat ESP32, /stok ESP32, /firsatlar, /takip ESP32, /favoriler, /alarmlar, /endeks';
}

async function handleMegaTelegram(req, res, body) {
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return json(res, 401, { error: 'Geçersiz webhook.' });
  const message = body?.message;
  const chatId = message?.chat?.id;
  const command = String(message?.text || '').trim();
  if (!chatId || !command) return json(res, 200, { ok: true });
  const db = readDb();
  const linkedUser = (db.users || []).find((user) => String(user.telegramChatId || '') === String(chatId));
  const lower = command.toLocaleLowerCase('tr-TR');
  if (lower.startsWith('/takip ')) {
    if (!linkedUser) { await sendTelegram(chatId, 'Önce ArduFiyat hesabını Telegram ile bağla.'); return json(res, 200, { ok: true }); }
    const matches = searchProducts(db, command.slice(7).trim(), 1);
    if (!matches.length) { await sendTelegram(chatId, 'Ürün bulunamadı.'); return json(res, 200, { ok: true }); }
    const product = matches[0];
    await mutateDb((target) => {
      const user = target.users.find((item) => item.id === linkedUser.id);
      if (!Array.isArray(user.favorites)) user.favorites = [];
      if (!user.favorites.includes(product.id)) user.favorites.push(product.id);
    });
    await sendTelegram(chatId, `${product.name} takip listene eklendi.`);
  } else if (lower === '/favoriler') {
    if (!linkedUser) await sendTelegram(chatId, 'Hesabın bağlı değil.');
    else {
      const lines = (linkedUser.favorites || []).slice(0, 15).map((productId) => {
        const product = db.products.find((item) => item.id === productId);
        const price = num(bestOffer(db, productId)?.price);
        return product ? `${product.name}: ${price ? `${price} TL` : 'fiyat yok'}` : null;
      }).filter(Boolean);
      await sendTelegram(chatId, lines.join('\n') || 'Favorin yok.');
    }
  } else if (lower === '/endeks') {
    const index = arduIndex(db);
    await sendTelegram(chatId, `ArduFiyat Elektronik Endeksi: ${index.value ?? '—'} (baz 100) • ${index.products} ürün`);
  } else return false;
  return json(res, 200, { ok: true });
}

function publicBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${req.headers.host}`;
}

function seoListHtml(req, titleValue, description, products) {
  const base = publicBaseUrl(req);
  const rows = products.slice(0, 100).map((product) => {
    const price = num(bestOffer(readDb(), product.id));
    return `<li><a href="/${encodeURIComponent(slugify(product.name))}-fiyatlari">${escapeHtml(product.name)}</a>${price ? ` — ${price} TL` : ''}</li>`;
  }).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titleValue)} | ArduFiyat</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(base)}"></head><body><main style="max-width:980px;margin:40px auto;font-family:Arial;padding:0 20px"><a href="/">← ArduFiyat</a><h1>${escapeHtml(titleValue)}</h1><p>${escapeHtml(description)}</p><ul>${rows}</ul></main></body></html>`;
}

function injectMegaHtml(html, pathname) {
  if (!html.includes('</head>') || !html.includes('</body>')) return html;
  const route = escapeHtml(pathname);
  let next = html.replace('</head>', `<link rel="stylesheet" href="/mega-features.css?v=${MEGA_VERSION}"><meta name="ardufiyat-mega-route" content="${route}"></head>`);
  next = next.replace('</body>', `<script type="module" src="/mega-features.js?v=${MEGA_VERSION}"></script></body>`);
  return next;
}

function proxyRequest(req, res, { bufferHtml = false } = {}) {
  return new Promise((resolve) => {
    const headers = { ...req.headers, host: `127.0.0.1:${internalPort}` };
    const upstream = http.request({ hostname: '127.0.0.1', port: internalPort, method: req.method, path: req.url, headers }, (upstreamRes) => {
      if (!bufferHtml) {
        const outHeaders = { ...upstreamRes.headers };
        res.writeHead(upstreamRes.statusCode || 502, { ...securityHeaders, ...outHeaders });
        upstreamRes.pipe(res);
        upstreamRes.on('end', resolve);
        return;
      }
      const chunks = [];
      upstreamRes.on('data', (chunk) => chunks.push(chunk));
      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks);
        const contentType = String(upstreamRes.headers['content-type'] || '');
        if (contentType.includes('text/html')) {
          const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
          const output = injectMegaHtml(body.toString('utf8'), pathname);
          const outHeaders = { ...upstreamRes.headers, 'content-type': 'text/html; charset=utf-8' };
          delete outHeaders['content-length']; delete outHeaders['content-encoding'];
          send(res, upstreamRes.statusCode || 200, output, outHeaders);
        } else {
          const outHeaders = { ...upstreamRes.headers }; delete outHeaders['content-length'];
          send(res, upstreamRes.statusCode || 200, body, outHeaders);
        }
        resolve();
      });
    });
    upstream.on('error', (error) => { json(res, 502, { error: `İç servis bağlantısı başarısız: ${error.message}` }); resolve(); });
    req.pipe(upstream);
  });
}

async function handleMegaApi(req, res, url) {
  if (url.pathname === '/api/mega/dashboard' && req.method === 'GET') return json(res, 200, megaDashboard(req));
  if (url.pathname === '/api/mega/search' && req.method === 'GET') return json(res, 200, { products: searchProducts(readDb(), url.searchParams.get('q') || '', 20) });
  if (url.pathname === '/api/mega/filters' && req.method === 'GET') return json(res, 200, { filters: technicalFilterMeta(readDb()) });
  if (url.pathname === '/api/mega/catalog' && req.method === 'GET') return json(res, 200, { products: catalogFiltered(url) });
  if (url.pathname === '/api/mega/fx' && req.method === 'GET') return json(res, 200, readDb().fxRates || {});
  if (url.pathname === '/api/mega/projects' && req.method === 'GET') return json(res, 200, { projects: readDb().projectTemplates || [] });
  if (url.pathname === '/api/mega/profile' && req.method === 'GET') {
    const db = readDb(); const user = requireUser(req, res, db); if (!user) return; return json(res, 200, profilePayload(user));
  }
  if (url.pathname === '/api/mega/profile' && req.method === 'PUT') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return updateProfile(req, res, body);
  }
  if (url.pathname === '/api/mega/dev-key' && req.method === 'POST') return generateDevKey(req, res);
  if (url.pathname === '/api/mega/dev-usage' && req.method === 'GET') {
    const db = readDb(); const user = requireUser(req, res, db); if (!user) return;
    return json(res, 200, { keys: (db.apiKeys || []).filter((item) => item.userId === user.id).map(({ hash, ...safe }) => safe) });
  }
  if (url.pathname === '/api/mega/comments' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return addComment(req, res, body);
  }
  if (url.pathname === '/api/mega/price-submissions' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return submitPrice(req, res, body);
  }
  if (url.pathname === '/api/mega/basket' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return json(res, 200, optimizeBasket(readDb(), body.items || [], String(body.city || '')));
  }
  if (url.pathname === '/api/mega/bom' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' });
    const db = readDb(); const resolved = resolveBom(db, body.rows || []); const basket = optimizeBasket(db, resolved.resolved.map((row) => ({ productId: row.selected.id, qty: row.qty })), String(body.city || ''));
    return json(res, 200, { ...resolved, basket });
  }
  if (url.pathname === '/api/mega/compatibility' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return json(res, 200, compatibility(readDb(), body.productIds || []));
  }
  const projectMatch = url.pathname.match(/^\/api\/mega\/projects\/([^/]+)\/calculate$/);
  if (projectMatch && req.method === 'POST') {
    const { json: body } = await readBody(req); const db = readDb(); const template = (db.projectTemplates || []).find((item) => item.id === projectMatch[1]);
    if (!template) return json(res, 404, { error: 'Proje bulunamadı.' }); return json(res, 200, projectCost(db, template, String(body?.city || '')));
  }
  const productMatch = url.pathname.match(/^\/api\/mega\/product\/([^/]+)$/);
  if (productMatch && req.method === 'GET') {
    const payload = detailedProduct(req, decodeURIComponent(productMatch[1])); return json(res, payload ? 200 : 404, payload || { error: 'Ürün bulunamadı.' });
  }
  const resolveMatch = url.pathname.match(/^\/api\/mega\/admin\/submissions\/([^/]+)$/);
  if (resolveMatch && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return resolveSubmission(req, res, resolveMatch[1], body);
  }
  if (url.pathname === '/api/mega/admin/merchant-key' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return merchantKey(req, res, body);
  }
  if (url.pathname === '/api/mega/admin/store-logistics' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return updateStoreLogistics(req, res, body);
  }
  if (url.pathname === '/api/mega/admin/global-offer' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return addGlobalOffer(req, res, body);
  }
  const specMatch = url.pathname.match(/^\/api\/mega\/admin\/specs\/([^/]+)$/);
  if (specMatch && req.method === 'POST') return enrichSpecs(req, res, specMatch[1]);
  if (url.pathname === '/api/mega/merchant/feed' && req.method === 'POST') {
    const { json: body } = await readBody(req, 8_000_000); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' }); return merchantFeed(req, res, body);
  }
  if (url.pathname === '/api/mega/telegram' && req.method === 'POST') {
    const { json: body } = await readBody(req); if (!body) return json(res, 400, { error: 'Geçersiz JSON.' });
    const handled = await handleMegaTelegram(req, res, body); if (handled !== false) return handled;
    // Eski Telegram komutları enhanced-server tarafından ele alınsın.
    req.url = '/api/bot/telegram';
    return proxyRequest(req, res);
  }
  return json(res, 404, { error: 'Mega API yolu bulunamadı.' });
}

async function handleV2(req, res, url) {
  if (req.method === 'OPTIONS') return apiCors(res, 204, {});
  if (req.method !== 'GET') return apiCors(res, 405, { error: 'Salt okunur API.' });
  const db = readDb();
  if (!enforceApiRate(req, res, db)) return;
  if (url.pathname === '/api/v2/products') {
    const products = catalogFiltered(url).slice(0, Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50))));
    return apiCors(res, 200, { products, count: products.length, index: arduIndex(db) });
  }
  if (url.pathname === '/api/v2/deals') {
    const products = (db.products || []).filter((item) => item.active !== false).map((item) => ({ item, insight: priceIntelligence(db, item.id) })).filter((row) => row.insight?.realDiscount)
      .sort((a, b) => b.insight.discountVs30Pct - a.insight.discountVs30Pct).slice(0, 50).map((row) => ({ id: row.item.id, name: row.item.name, ...row.insight }));
    return apiCors(res, 200, { deals: products });
  }
  if (url.pathname === '/api/v2/index') return apiCors(res, 200, { index: arduIndex(db), categories: categoryStats(db) });
  if (url.pathname === '/api/v2/match') {
    const query = url.searchParams.get('q') || url.searchParams.get('url') || '';
    return apiCors(res, 200, { matches: searchProducts(db, query, 10) });
  }
  const match = url.pathname.match(/^\/api\/v2\/products\/([^/]+)$/);
  if (match) {
    const key = decodeURIComponent(match[1]);
    const product = db.products.find((item) => item.id === key || slugify(item.name) === key);
    return apiCors(res, product ? 200 : 404, product ? publicApiProduct(db, product) : { error: 'Ürün bulunamadı.' });
  }
  return apiCors(res, 404, { error: 'API yolu bulunamadı.' });
}

const mega = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/mega/')) return await handleMegaApi(req, res, url);
    if (url.pathname.startsWith('/api/v2/')) return await handleV2(req, res, url);

    const affiliateMatch = req.method === 'GET' ? url.pathname.match(/^\/go\/([^/]+)$/) : null;
    if (affiliateMatch) {
      const db = readDb();
      const offer = db.offers.find((item) => item.id === affiliateMatch[1]);
      if (offer?.affiliateUrl && isValidHttpUrl(offer.affiliateUrl)) {
        queueMicrotask(() => mutateDb((target) => {
          target.affiliateClicks.unshift({ id: id('click'), offerId: offer.id, storeId: offer.storeId, productId: offer.productId, sponsored: offer.sponsored === true, createdAt: new Date().toISOString() });
          target.affiliateClicks = target.affiliateClicks.slice(0, 5000);
        }).catch(() => {}));
        return redirect(res, offer.affiliateUrl);
      }
    }

    const brandMatch = req.method === 'GET' ? url.pathname.match(/^\/marka\/([^/]+)\/?$/) : null;
    if (brandMatch) {
      const db = readDb(); const slug = normalizeText(decodeURIComponent(brandMatch[1]));
      const products = db.products.filter((item) => item.active !== false && normalizeText(item.brand) === slug);
      if (products.length) return text(res, 200, seoListHtml(req, `${products[0].brand} fiyatları`, `${products[0].brand} elektronik ürünlerinin güncel fiyatlarını ve mağaza tekliflerini karşılaştır.`, products), 'text/html; charset=utf-8');
    }
    const categoryMatch = req.method === 'GET' ? url.pathname.match(/^\/kategori\/([^/]+)\/?$/) : null;
    if (categoryMatch) {
      const db = readDb(); const slug = normalizeText(decodeURIComponent(categoryMatch[1]));
      const category = db.categories.find((item) => normalizeText(item.slug || item.name) === slug);
      if (category) return text(res, 200, seoListHtml(req, `${category.name} fiyatları`, `${category.name} ürünlerinde güncel fiyatları karşılaştır.`, db.products.filter((item) => item.active !== false && item.categoryId === category.id)), 'text/html; charset=utf-8');
    }

    const htmlRoute = req.method === 'GET' && !url.pathname.includes('.') && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/go/') && !url.pathname.startsWith('/ad/');
    return proxyRequest(req, res, { bufferHtml: htmlRoute || url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/' });
  } catch (error) {
    console.error('Mega server error:', error);
    return json(res, 500, { error: error.message || 'Mega sunucu hatası.' });
  }
});

await ensureMegaShape();
setTimeout(() => refreshFxRates(), 30_000).unref();
setInterval(() => refreshFxRates(), 6 * HOUR_MS).unref();
setTimeout(() => smartFavoriteAlerts().catch((error) => console.error('Akıllı favori bildirimi:', error.message)), 10 * 60_000).unref();
setInterval(() => smartFavoriteAlerts().catch((error) => console.error('Akıllı favori bildirimi:', error.message)), 3 * HOUR_MS).unref();
setTimeout(() => weeklyDigest().catch((error) => console.error('Haftalık özet:', error.message)), 20 * 60_000).unref();
setInterval(() => weeklyDigest().catch((error) => console.error('Haftalık özet:', error.message)), 12 * HOUR_MS).unref();

mega.listen(externalPort, () => {
  console.log(`ArduFiyat Mega http://localhost:${externalPort} → gelişmiş servis :${internalPort}`);
  console.log('Mega: sepet/BOM/projeler, gerçek indirim, tahmin, uyumluluk, topluluk, satıcı feed, API v2, kur/global fiyat, affiliate ve haftalık özet aktif.');
});
