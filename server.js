import http from 'node:http';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { sendVerificationEmail } from './src/mailer.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './src/env.js';
import {
  readDb,
  mutateDb,
  id,
  slugify,
  ensureDatabase,
  initializeDatabase,
  dataFile,
  persistentDataPathConfigured
} from './src/store.js';
import {
  signToken,
  verifyToken,
  bearer,
  normalizeEmail,
  isValidEmail,
  hashPassword,
  verifyPassword
} from './src/auth.js';
import { runPriceSync } from './src/price-sync.js';
import {
  getGeminiPriceSyncConfig,
  getGeminiPriceSyncJob,
  startGeminiPriceSync
} from './src/gemini-price-sync.js';
import { syncAllProductImages, ensureLocalProductImage, resolveLocalProductImage } from './src/image-sync.js';
import { firstOfferUrlIssue, isDirectOfferUrl } from './src/offer-url.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 4173);
const imageCacheDir = path.join(__dirname, 'data', 'image-cache');
const uploadedImagesDir = path.join(publicDir, 'images', 'uploads');
const imageCacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const maxRemoteImageBytes = 6 * 1024 * 1024;

fs.mkdirSync(imageCacheDir, { recursive: true });
fs.mkdirSync(uploadedImagesDir, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8'
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const allowedStocks = new Set(['in_stock', 'low_stock', 'out_of_stock', 'unknown']);
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

const allowedSourceTypes = new Set([
  'manual_verified',
  'merchant_csv',
  'official_api',
  'admin_import',
  'gemini_url_context'
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...securityHeaders, ...headers });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
}

function text(res, status, data) {
  send(res, status, data, { 'Content-Type': 'text/plain; charset=utf-8' });
}

function redirect(res, url) {
  send(res, 302, '', { Location: url });
}

function adminPayload(req) {
  return verifyToken(bearer(req), 'admin');
}

function requireAdmin(req, res) {
  if (!adminPayload(req)) {
    json(res, 401, { error: 'Yetkisiz erişim.' });
    return false;
  }
  return true;
}

function userPayload(req) {
  return verifyToken(bearer(req), 'user');
}

function isProUser(user) {
  if (!user?.proActive) return false;
  if (!user.proExpiresAt) return true;
  const expiresAt = new Date(user.proExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}


function verificationHash(email, code) {
  return crypto.createHash('sha256').update(`${normalizeEmail(email)}:${code}:${process.env.TOKEN_SECRET || 'dev'}`).digest('hex');
}

function createVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function cleanExpiredVerifications(db) {
  const now = Date.now();
  db.emailVerifications = (db.emailVerifications || []).filter((item) => new Date(item.expiresAt).getTime() > now);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active !== false,
    isPro: isProUser(user),
    proExpiresAt: user.proExpiresAt || null,
    createdAt: user.createdAt,
    proSource: user.proSource || null,
    discordLinked: Boolean(user.discordId),
    discordUsername: user.discordUsername || null
  };
}

function currentUser(db, req) {
  const payload = userPayload(req);
  if (!payload?.userId) return null;
  const user = db.users.find((item) => item.id === payload.userId && item.active !== false);
  return user || null;
}

function safeAdminUser(user) {
  const { passwordHash, passwordSalt, ...safe } = user;
  return { ...safe, isPro: isProUser(user) };
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 8_000_000) {
        reject(new Error('İstek çok büyük.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!data) return resolve({});

      const type = String(req.headers['content-type'] || '');
      if (type.includes('application/json')) {
        try {
          return resolve(JSON.parse(data));
        } catch {
          return reject(new Error('Geçersiz JSON.'));
        }
      }

      return resolve(data);
    });

    req.on('error', reject);
  });
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidAdTarget(value) {
  const target = String(value || '').trim();
  return isHttpUrl(target) || (target.startsWith('/') && !target.startsWith('//'));
}

function isValidImageReference(value) {
  const image = String(value || '').trim();
  return !image || isHttpUrl(image) || (image.startsWith('/images/') && !image.includes('..'));
}

function isSafeRemoteUrl(value) {
  if (!isHttpUrl(value)) return false;

  try {
    const host = new URL(value).hostname.toLowerCase();
    return !(
      host === 'localhost' ||
      host === '::1' ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

function escapeXml(value = '') {
  return String(value).replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;'
  })[character]);
}

function productFallbackSvg(product) {
  const title = escapeXml(product?.name || 'Ürün görseli');
  const short = escapeXml(String(product?.name || 'Elektronik').split(' ').slice(0, 3).join(' '));

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f8fafc"/>
          <stop offset="1" stop-color="#eef2f7"/>
        </linearGradient>
      </defs>
      <rect width="720" height="520" rx="36" fill="url(#bg)"/>
      <rect x="235" y="95" width="250" height="215" rx="28" fill="#0f172a"/>
      <circle cx="280" cy="150" r="14" fill="#ff6b1a"/>
      <circle cx="440" cy="150" r="14" fill="#ff6b1a"/>
      <path d="M285 235h150M315 195h90M315 275h90" stroke="#fff" stroke-width="18" stroke-linecap="round"/>
      <text x="360" y="382" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#0f172a">${short}</text>
      <text x="360" y="425" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#64748b">Görsel kaynak mağazadan yükleniyor</text>
      <title>${title}</title>
    </svg>
  `);
}

function decodeHtmlUrl(value = '') {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&#x2F;', '/')
    .replaceAll('\\/', '/')
    .trim();
}

async function fetchWithLimit(url, options = {}, maxBytes = maxRemoteImageBytes) {
  if (!isSafeRemoteUrl(url)) throw new Error('Güvenli olmayan uzak URL.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Uzak kaynak ${response.status} döndürdü.`);

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw new Error('Uzak içerik çok büyük.');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) throw new Error('Uzak içerik boyutu geçersiz.');

    return { response, buffer };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverProductImage(pageUrl) {
  if (!isSafeRemoteUrl(pageUrl)) return null;

  const { buffer } = await fetchWithLimit(pageUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
      accept: 'text/html,application/xhtml+xml'
    }
  }, 2 * 1024 * 1024);

  const html = buffer.toString('utf8');
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["'][^>]*>/i,
    /"image"\s*:\s*"([^"]+)"/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    try {
      const found = new URL(decodeHtmlUrl(match[1]), pageUrl).toString();
      if (isSafeRemoteUrl(found)) return found;
    } catch {
      // Bir sonraki kalıbı dene.
    }
  }

  return null;
}

function imageCachePaths(productId) {
  const safeId = String(productId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    body: path.join(imageCacheDir, `${safeId}.bin`),
    meta: path.join(imageCacheDir, `${safeId}.json`)
  };
}

function readCachedProductImage(product) {
  const paths = imageCachePaths(product.id);
  if (!fs.existsSync(paths.body) || !fs.existsSync(paths.meta)) return null;

  try {
    const meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8'));
    const cachedAt = new Date(meta.cachedAt).getTime();
    const productUpdatedAt = String(product.updatedAt || '');

    if (
      !Number.isFinite(cachedAt) ||
      Date.now() - cachedAt > imageCacheMaxAgeMs ||
      String(meta.productUpdatedAt || '') !== productUpdatedAt
    ) {
      return null;
    }

    return {
      buffer: fs.readFileSync(paths.body),
      contentType: meta.contentType || 'image/jpeg',
      sourceUrl: meta.sourceUrl || ''
    };
  } catch {
    return null;
  }
}

function writeCachedProductImage(product, image) {
  const paths = imageCachePaths(product.id);
  const temporaryBody = `${paths.body}.${process.pid}.tmp`;
  const temporaryMeta = `${paths.meta}.${process.pid}.tmp`;

  fs.writeFileSync(temporaryBody, image.buffer);
  fs.writeFileSync(temporaryMeta, JSON.stringify({
    contentType: image.contentType,
    sourceUrl: image.sourceUrl,
    cachedAt: new Date().toISOString(),
    productUpdatedAt: String(product.updatedAt || '')
  }, null, 2));
  fs.renameSync(temporaryBody, paths.body);
  fs.renameSync(temporaryMeta, paths.meta);
}

async function loadProductImage(product) {
  const cached = readCachedProductImage(product);
  if (cached) return cached;

  const localImageUrl = String(product.imageUrl || '').trim();
  if (localImageUrl.startsWith('/images/')) {
    const localFile = path.resolve(publicDir, localImageUrl.replace(/^\/+/, ''));
    if (localFile.startsWith(path.resolve(publicDir)) && fs.existsSync(localFile)) {
      const extension = path.extname(localFile).toLowerCase();
      return {
        buffer: fs.readFileSync(localFile),
        contentType: mime[extension] || 'application/octet-stream',
        sourceUrl: localImageUrl
      };
    }
  }

  const pageUrl = isSafeRemoteUrl(product.imageSourceUrl) ? product.imageSourceUrl : '';
  const candidates = [];

  if (isSafeRemoteUrl(product.imageUrl)) candidates.push(product.imageUrl);

  if (pageUrl) {
    try {
      const discovered = await discoverProductImage(pageUrl);
      if (discovered && !candidates.includes(discovered)) candidates.push(discovered);
    } catch (error) {
      console.warn(`Görsel sayfası okunamadı (${product.id}):`, error.message);
    }
  }

  for (const candidate of candidates) {
    try {
      const headers = {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      };
      if (pageUrl) headers.referer = pageUrl;

      const { response, buffer } = await fetchWithLimit(candidate, { headers });
      const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim();
      if (!contentType.startsWith('image/')) throw new Error('Kaynak bir resim döndürmedi.');

      const image = { buffer, contentType, sourceUrl: candidate };
      writeCachedProductImage(product, image);
      return image;
    } catch (error) {
      console.warn(`Görsel indirilemedi (${product.id}):`, error.message);
    }
  }

  try {
    const result = await ensureLocalProductImage(product.id);
    if (result.status === 'downloaded' || result.status === 'skipped') {
      const refreshedProduct = readDb().products.find((item) => item.id === product.id);
      const localFile = resolveLocalProductImage(refreshedProduct);
      if (localFile) {
        const extension = path.extname(localFile).toLowerCase();
        return {
          buffer: fs.readFileSync(localFile),
          contentType: mime[extension] || 'application/octet-stream',
          sourceUrl: refreshedProduct.imageUrl
        };
      }
    }
  } catch (error) {
    console.warn(`Yerel ürün görseli oluşturulamadı (${product.id}):`, error.message);
  }

  return {
    buffer: productFallbackSvg(product),
    contentType: 'image/svg+xml; charset=utf-8',
    sourceUrl: ''
  };
}

function publicSettings(db) {
  return {
    siteName: db.settings.siteName,
    siteTagline: db.settings.siteTagline,
    freeOfferLimit: Number(db.settings.freeOfferLimit ?? 30),
    proOfferLimit: Number(db.settings.proOfferLimit ?? 0),
    currency: db.settings.currency || 'TRY',
    staleHours: Number(db.settings.staleHours || 24),
    adsEnabled: db.settings.adsEnabled !== false,
    adFrequency: Math.max(2, Number(db.settings.adFrequency || 8)),
    dataPolicyText: db.settings.dataPolicyText
  };
}

function isValidPublicOffer(db, offer) {
  const price = Number(offer?.price);
  const store = db.stores.find((item) => item.id === offer?.storeId);

  return Boolean(
    offer?.active &&
    store?.active &&
    Number.isFinite(price) &&
    price > 0 &&
    isDirectOfferUrl(offer.url, store.domain)
  );
}

function getPublicOffers(db, productId) {
  const stockOrder = {
    in_stock: 0,
    low_stock: 1,
    unknown: 2,
    out_of_stock: 3
  };

  return db.offers
    .filter((offer) => offer.productId === productId && isValidPublicOffer(db, offer))
    .map((offer) => ({
      ...offer,
      price: Number(offer.price),
      store: db.stores.find((store) => store.id === offer.storeId)
    }))
    .sort((a, b) => {
      const stockDifference = (stockOrder[a.stock] ?? 2) - (stockOrder[b.stock] ?? 2);
      if (stockDifference !== 0) return stockDifference;

      const aTotal = a.price + Number(a.shippingCost || 0);
      const bTotal = b.price + Number(b.shippingCost || 0);
      return aTotal - bTotal;
    });
}

function decorateProducts(db, products, offerLimit = 30) {
  return products.map((product) => {
    const offers = getPublicOffers(db, product.id);
    const normalizedLimit = Number(offerLimit);
    const visibleOffers = normalizedLimit > 0 ? offers.slice(0, normalizedLimit) : offers;
    const bestOffer = offers.find((offer) => offer.stock !== 'out_of_stock') || offers[0] || null;

    return {
      ...product,
      category: db.categories.find((category) => category.id === product.categoryId),
      offers: visibleOffers,
      offerCount: offers.length,
      hiddenOfferCount: Math.max(0, offers.length - visibleOffers.length),
      bestPrice: bestOffer?.price ?? null,
      bestOffer,
      displayImageUrl: String(bestOffer?.imageUrl || product.imageUrl || '').trim()
    };
  });
}

function normaliseOffer(db, input, current = {}) {
  const merged = { ...current, ...input };
  const productId = String(merged.productId || '').trim();
  const storeId = String(merged.storeId || '').trim();
  const price = Number(merged.price);
  const url = String(merged.url || '').trim();

  if (!db.products.some((product) => product.id === productId)) {
    return { error: 'Geçerli bir ürün seçin.' };
  }

  const store = db.stores.find((item) => item.id === storeId);
  if (!store) {
    return { error: 'Geçerli bir mağaza seçin.' };
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { error: 'Fiyat sıfırdan büyük olmalıdır.' };
  }

  const urlIssue = firstOfferUrlIssue(url, store.domain);
  if (urlIssue) {
    return { error: urlIssue.message };
  }

  if (!isValidImageReference(merged.imageUrl)) {
    return { error: 'Teklif fotoğrafı geçerli bir URL veya /images/ yolu olmalıdır.' };
  }

  const date = merged.verifiedAt ? new Date(merged.verifiedAt) : new Date();
  if (Number.isNaN(date.getTime())) {
    return { error: 'Doğrulama tarihi geçersiz.' };
  }

  return {
    payload: {
      ...merged,
      productId,
      storeId,
      price,
      shipping: String(merged.shipping || 'Mağazada hesaplanır').trim(),
      stock: allowedStocks.has(merged.stock) ? merged.stock : 'unknown',
      url,
      imageUrl: isValidImageReference(merged.imageUrl) ? String(merged.imageUrl || '').trim() : '',
      verifiedAt: date.toISOString(),
      sourceType: allowedSourceTypes.has(merged.sourceType)
        ? merged.sourceType
        : 'manual_verified',
      active: merged.active !== false
    }
  };
}

function addPriceHistory(db, offer) {
  db.priceHistory.push({
    id: id('ph'),
    productId: offer.productId,
    storeId: offer.storeId,
    price: Number(offer.price),
    capturedAt: offer.verifiedAt || new Date().toISOString()
  });
  db.priceHistory = db.priceHistory.slice(-5000);
}

async function createOrUpdateOffer(req, res, itemId = null) {
  const body = await readBody(req);
  const snapshot = readDb();
  const current = itemId ? snapshot.offers.find((offer) => offer.id === itemId) : null;

  if (itemId && !current) {
    return json(res, 404, { error: 'Teklif bulunamadı.' });
  }

  const result = normaliseOffer(snapshot, body, current || {});
  if (result.error) {
    return json(res, 400, { error: result.error });
  }

  let saved;
  let updatedExisting = Boolean(itemId);

  await mutateDb((db) => {
    let target = itemId
      ? db.offers.find((offer) => offer.id === itemId)
      : db.offers.find(
          (offer) =>
            offer.productId === result.payload.productId &&
            offer.storeId === result.payload.storeId
        );

    if (target) {
      updatedExisting = true;
      Object.assign(target, result.payload, { updatedAt: new Date().toISOString() });
      saved = target;
    } else {
      saved = {
        id: id('offer'),
        ...result.payload,
        clicks: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.offers.push(saved);
    }

    addPriceHistory(db, saved);
  });

  return json(res, updatedExisting ? 200 : 201, {
    ...saved,
    updatedExisting
  });
}

async function apiRouter(req, res, url) {
  const method = req.method || 'GET';

  if (method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      now: new Date().toISOString(),
      persistentDataPathConfigured
    });
  }

  if (method === 'GET' && url.pathname === '/api/auth/config') {
    return json(res, 200, {
      googleClientId: process.env.GOOGLE_CLIENT_ID || ''
    });
  }

  const productImageMatch = url.pathname.match(/^\/api\/product-image\/([^/]+)$/);
  if (method === 'GET' && productImageMatch) {
    const db = readDb();
    const productId = decodeURIComponent(productImageMatch[1]);
    const product = db.products.find((item) => item.id === productId && item.active);

    if (!product) return text(res, 404, 'Ürün görseli bulunamadı.');

    const image = await loadProductImage(product);
    return send(res, 200, image.buffer, {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
  }

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    const db = readDb();
    const user = currentUser(db, req);
    const plan = isProUser(user) ? 'pro' : 'free';
    const limit = plan === 'pro'
      ? Number(db.settings.proOfferLimit ?? 0)
      : Number(db.settings.freeOfferLimit ?? 30);
    const query = String(url.searchParams.get('q') || '')
      .trim()
      .toLocaleLowerCase('tr-TR');
    const categorySlug = String(url.searchParams.get('category') || 'all');

    const matchingProducts = db.products
      .filter((product) => product.active)
      .filter((product) => {
        const category = db.categories.find((item) => item.id === product.categoryId);
        const searchable = `${product.name} ${product.brand} ${(product.tags || []).join(' ')}`
          .toLocaleLowerCase('tr-TR');

        return (
          (!query || searchable.includes(query)) &&
          (categorySlug === 'all' || category?.slug === categorySlug)
        );
      });

    const decoratedProducts = decorateProducts(db, matchingProducts, limit);
    const activeOffers = db.offers.filter((offer) => isValidPublicOffer(db, offer));

    const stores = db.stores
      .filter((store) => store.active)
      .map(({ termsNote, ...store }) => ({
        ...store,
        offerCount: activeOffers.filter((offer) => offer.storeId === store.id).length
      }));

    const ads = plan === 'free' && db.settings.adsEnabled !== false
      ? db.ads
          .filter((ad) => ad.active && isValidAdTarget(ad.targetUrl))
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
          .map(({ internalNote, ...ad }) => ad)
      : [];

    return json(res, 200, {
      plan,
      user: publicUser(user),
      settings: publicSettings(db),
      ads,
      categories: db.categories.filter((category) => category.active),
      products: decoratedProducts,
      campaigns: db.campaigns.filter((campaign) => campaign.active),
      banners: db.banners
        .filter((banner) => banner.active)
        .sort((a, b) => a.order - b.order),
      coupons: db.coupons
        .filter(
          (coupon) =>
            coupon.active &&
            (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date())
        )
        .map(({ internalNote, ...coupon }) => coupon),
      stores,
      meta: {
        updatedAt: db.meta.updatedAt,
        verifiedOfferCount: activeOffers.length,
        hiddenProductCount: decoratedProducts.length - productsWithOffers.length
      }
    });
  }


  if (method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    const name = String(body?.name || '').trim();
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');

    if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'Ad en az 2, en fazla 80 karakter olmalıdır.' });
    if (!isValidEmail(email)) return json(res, 400, { error: 'Geçerli bir e-posta adresi girin.' });
    if (password.length < 8 || password.length > 128) return json(res, 400, { error: 'Şifre 8–128 karakter arasında olmalıdır.' });

    const snapshot = readDb();
    if (snapshot.users.some((user) => normalizeEmail(user.email) === email)) return json(res, 409, { error: 'Bu e-posta adresi zaten kayıtlı.' });

    const code = createVerificationCode();
    const credentials = hashPassword(password);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await mutateDb((db) => {
      cleanExpiredVerifications(db);
      db.emailVerifications = (db.emailVerifications || []).filter((item) => normalizeEmail(item.email) !== email);
      db.emailVerifications.push({
        id: id('verify'), name, email, ...credentials,
        codeHash: verificationHash(email, code), attempts: 0,
        expiresAt, createdAt: new Date().toISOString()
      });
    });

    const mail = await sendVerificationEmail({ to: email, name, code });
    return json(res, 202, {
      verificationRequired: true,
      email,
      expiresAt,
      ...(mail.developmentCode ? { developmentCode: mail.developmentCode } : {})
    });
  }

  if (method === 'POST' && url.pathname === '/api/auth/verify-email') {
    const body = await readBody(req);
    const email = normalizeEmail(body?.email);
    const code = String(body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) return json(res, 400, { error: '6 haneli doğrulama kodunu girin.' });

    const snapshot = readDb();
    const pending = (snapshot.emailVerifications || []).find((item) => normalizeEmail(item.email) === email);
    if (!pending || new Date(pending.expiresAt).getTime() <= Date.now()) return json(res, 400, { error: 'Kodun süresi dolmuş. Yeniden kayıt olun.' });
    if (pending.attempts >= 5) return json(res, 429, { error: 'Çok fazla hatalı deneme. Yeniden kod isteyin.' });
    if (pending.codeHash !== verificationHash(email, code)) {
      await mutateDb((db) => { const item=(db.emailVerifications||[]).find(v=>v.id===pending.id); if(item) item.attempts=Number(item.attempts||0)+1; });
      return json(res, 400, { error: 'Doğrulama kodu hatalı.' });
    }

    let createdUser;
    await mutateDb((db) => {
      if (db.users.some((user) => normalizeEmail(user.email) === email)) return;
      createdUser = {
        id: id('user'), name: pending.name, email,
        passwordHash: pending.passwordHash, passwordSalt: pending.passwordSalt,
        provider: 'email', emailVerified: true, active: true,
        proActive: false, proExpiresAt: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: new Date().toISOString()
      };
      db.users.push(createdUser);
      db.emailVerifications = (db.emailVerifications || []).filter((item) => item.id !== pending.id);
    });
    if (!createdUser) return json(res, 409, { error: 'Bu e-posta adresi zaten kayıtlı.' });
    return json(res, 201, { token: signToken({ type:'user', userId:createdUser.id }, 60*60*24*30), user: publicUser(createdUser), plan:'free' });
  }

  if (method === 'POST' && url.pathname === '/api/auth/google') {
    if (!googleClient) return json(res, 503, { error: 'Google ile giriş henüz yapılandırılmamış.' });
    const body = await readBody(req);
    const credential = String(body?.credential || '');
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.email_verified) return json(res, 401, { error: 'Google e-posta adresi doğrulanamadı.' });
      const email = normalizeEmail(payload.email);
      let user;
      await mutateDb((db) => {
        user = db.users.find((item) => normalizeEmail(item.email) === email);
        if (!user) {
          user = { id:id('user'), name:payload.name || email.split('@')[0], email, provider:'google', googleSub:payload.sub, emailVerified:true, active:true, proActive:false, proExpiresAt:null, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), lastLoginAt:new Date().toISOString() };
          db.users.push(user);
        } else {
          user.googleSub = user.googleSub || payload.sub; user.emailVerified = true; user.lastLoginAt = new Date().toISOString();
        }
      });
      if (user.active === false) return json(res, 403, { error: 'Hesabınız pasif durumda.' });
      return json(res, 200, { token:signToken({type:'user',userId:user.id},60*60*24*30), user:publicUser(user), plan:isProUser(user)?'pro':'free' });
    } catch {
      return json(res, 401, { error: 'Google oturumu doğrulanamadı.' });
    }
  }

  if (method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    const snapshot = readDb();
    const user = snapshot.users.find((item) => normalizeEmail(item.email) === email);

    if (!user || user.active === false || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return json(res, 401, { error: 'E-posta veya şifre hatalı.' });
    }

    await mutateDb((db) => {
      const target = db.users.find((item) => item.id === user.id);
      if (target) target.lastLoginAt = new Date().toISOString();
    });

    return json(res, 200, {
      token: signToken({ type: 'user', userId: user.id }, 60 * 60 * 24 * 30),
      user: publicUser(user),
      plan: isProUser(user) ? 'pro' : 'free'
    });
  }

  if (method === 'GET' && url.pathname === '/api/auth/me') {
    const db = readDb();
    const user = currentUser(db, req);
    if (!user) return json(res, 401, { error: 'Oturum bulunamadı.' });
    return json(res, 200, { user: publicUser(user), plan: isProUser(user) ? 'pro' : 'free' });
  }

  const adMatch = url.pathname.match(/^\/ad\/([^/]+)$/);
  if (method === 'GET' && adMatch) {
    const db = readDb();
    const ad = db.ads.find(
      (item) => item.id === decodeURIComponent(adMatch[1]) && item.active && isValidAdTarget(item.targetUrl)
    );

    if (!ad) return text(res, 404, 'Reklam bulunamadı.');

    await mutateDb((nextDb) => {
      const target = nextDb.ads.find((item) => item.id === ad.id);
      if (target) target.clicks = Number(target.clicks || 0) + 1;
    });

    return redirect(res, ad.targetUrl);
  }

  const goMatch = url.pathname.match(/^\/go\/([^/]+)$/);
  if (method === 'GET' && goMatch) {
    const db = readDb();
    const offer = db.offers.find(
      (item) => item.id === decodeURIComponent(goMatch[1]) && isValidPublicOffer(db, item)
    );

    if (!offer) return text(res, 404, 'Teklif bulunamadı.');

    await mutateDb((nextDb) => {
      const target = nextDb.offers.find((item) => item.id === offer.id);
      if (target) target.clicks = Number(target.clicks || 0) + 1;
    });

    return redirect(res, offer.url);
  }

  if (method === 'POST' && url.pathname === '/api/admin/login') {
    const body = await readBody(req);
    const email = String(body?.email || '').toLowerCase();
    const password = String(body?.password || '');
    const expectedEmail = String(
      process.env.ADMIN_EMAIL || 'admin@ardufiyat.local'
    ).toLowerCase();
    const expectedPassword = String(
      process.env.ADMIN_PASSWORD || 'Degistir-Beni-123!'
    );

    if (email !== expectedEmail || password !== expectedPassword) {
      return json(res, 401, { error: 'E-posta veya şifre hatalı.' });
    }

    return json(res, 200, {
      token: signToken({ type: 'admin', email }, 60 * 60 * 12),
      email
    });
  }

  if (url.pathname.startsWith('/api/admin/') && !requireAdmin(req, res)) {
    return;
  }

  if (method === 'GET' && url.pathname === '/api/admin/dashboard') {
    const db = readDb();

    return json(res, 200, {
      counts: {
        products: db.products.length,
        stores: db.stores.length,
        offers: db.offers.length,
        users: db.users.length,
        proUsers: db.users.filter((user) => isProUser(user)).length,
        ads: db.ads.length,
        campaigns: db.campaigns.length,
        coupons: db.coupons.length,
        clicks: db.offers.reduce((sum, offer) => sum + Number(offer.clicks || 0), 0),
        adClicks: db.ads.reduce((sum, ad) => sum + Number(ad.clicks || 0), 0)
      },
      collections: {
        categories: db.categories,
        products: db.products,
        stores: db.stores,
        offers: db.offers,
        users: db.users.map(safeAdminUser),
        ads: db.ads,
        campaigns: db.campaigns,
        banners: db.banners,
        coupons: db.coupons,
        syncLogs: db.syncLogs.slice(0, 20),
        priceHistory: db.priceHistory.slice(-100)
      },
      settings: db.settings,
      integrations: {
        gemini: getGeminiPriceSyncConfig(),
        persistentDataPathConfigured
      }
    });
  }

  const userProMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/pro$/);
  if (method === 'PUT' && userProMatch) {
    const userId = decodeURIComponent(userProMatch[1]);
    const body = await readBody(req);
    const enabled = Boolean(body?.enabled);
    let expiresAt = null;

    if (enabled && body?.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return json(res, 400, { error: 'Pro bitiş tarihi geçersiz.' });
      }
      expiresAt = parsed.toISOString();
    }

    let updated = null;
    await mutateDb((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) return;
      user.proActive = enabled;
      user.proExpiresAt = enabled ? expiresAt : null;
      user.proSource = enabled ? 'admin_manual' : null;
      user.updatedAt = new Date().toISOString();
      updated = safeAdminUser(user);
    });

    return updated
      ? json(res, 200, updated)
      : json(res, 404, { error: 'Kullanıcı bulunamadı.' });
  }

  const userStatusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (method === 'PUT' && userStatusMatch) {
    const userId = decodeURIComponent(userStatusMatch[1]);
    const body = await readBody(req);
    let updated = null;

    await mutateDb((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) return;
      user.active = body?.active !== false;
      user.updatedAt = new Date().toISOString();
      updated = safeAdminUser(user);
    });

    return updated
      ? json(res, 200, updated)
      : json(res, 404, { error: 'Kullanıcı bulunamadı.' });
  }

  if (method === 'PUT' && url.pathname === '/api/admin/settings') {
    const body = await readBody(req);
    await mutateDb((db) => {
      db.settings = { ...db.settings, ...body };
    });
    return json(res, 200, readDb().settings);
  }

  if (method === 'GET' && url.pathname === '/api/admin/offers/gemini-refresh') {
    return json(res, 200, { job: getGeminiPriceSyncJob() });
  }

  if (method === 'POST' && url.pathname === '/api/admin/offers/gemini-refresh') {
    try {
      const job = startGeminiPriceSync();
      return json(res, job.status === 'running' ? 202 : 200, { job });
    } catch (error) {
      if (error?.code === 'GEMINI_NOT_CONFIGURED') {
        return json(res, 503, { error: error.message });
      }
      throw error;
    }
  }

  if (
    method === 'POST' &&
    (url.pathname === '/api/admin/sync/run' ||
      url.pathname === '/api/admin/offers/refresh')
  ) {
    const syncResult = await runPriceSync('admin_refresh');
    const db = readDb();
    const activeOfferCount = db.offers.filter((offer) => isValidPublicOffer(db, offer)).length;

    return json(res, 200, {
      ...syncResult,
      activeOfferCount,
      updatedAt: db.meta.updatedAt
    });
  }

  if (method === 'POST' && url.pathname === '/api/admin/images/sync') {
    const body = await readBody(req);
    const result = await syncAllProductImages({
      force: Boolean(body?.force),
      reason: 'admin'
    });

    return json(res, 200, result);
  }

  if (method === 'POST' && url.pathname === '/api/admin/import/offers') {
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : body?.offers;

    if (!Array.isArray(rows)) {
      return json(res, 400, { error: 'offers dizisi gerekli.' });
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const snapshot = readDb();
      const product = snapshot.products.find(
        (item) => item.id === row.productId || item.sku === row.productSku
      );
      const store = snapshot.stores.find(
        (item) => item.id === row.storeId || item.slug === row.storeSlug
      );

      if (!product || !store) {
        skipped += 1;
        continue;
      }

      const normalised = normaliseOffer(snapshot, {
        ...row,
        productId: product.id,
        storeId: store.id,
        sourceType: row.sourceType || 'admin_import'
      });

      if (normalised.error) {
        skipped += 1;
        continue;
      }

      await mutateDb((db) => {
        let offer = db.offers.find(
          (item) =>
            item.productId === product.id &&
            item.storeId === store.id
        );

        if (offer) {
          Object.assign(offer, normalised.payload, { updatedAt: new Date().toISOString() });
        } else {
          offer = {
            id: id('offer'),
            ...normalised.payload,
            clicks: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          db.offers.push(offer);
        }

        addPriceHistory(db, offer);
      });

      imported += 1;
    }

    return json(res, 200, { imported, skipped });
  }

  if (method === 'POST' && url.pathname === '/api/admin/upload-image') {
    const body = await readBody(req);
    const mimeType = String(body?.mimeType || '').toLowerCase();
    const allowed = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    const extension = allowed[mimeType];
    if (!extension) return json(res, 400, { error: 'Yalnızca JPG, PNG, WEBP veya GIF yüklenebilir.' });

    const encoded = String(body?.data || '').replace(/\s/g, '');
    if (!encoded) return json(res, 400, { error: 'Fotoğraf verisi eksik.' });

    let buffer;
    try {
      buffer = Buffer.from(encoded, 'base64');
    } catch {
      return json(res, 400, { error: 'Fotoğraf verisi geçersiz.' });
    }

    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      return json(res, 400, { error: 'Fotoğraf en fazla 5 MB olabilir.' });
    }

    const fileName = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
    fs.writeFileSync(path.join(uploadedImagesDir, fileName), buffer);
    return json(res, 201, { url: `/images/uploads/${fileName}` });
  }

  const crudMatch = url.pathname.match(
    /^\/api\/admin\/(categories|products|stores|offers|campaigns|banners|coupons|ads)(?:\/([^/]+))?$/
  );

  if (crudMatch) {
    const collection = crudMatch[1];
    const itemId = crudMatch[2] && decodeURIComponent(crudMatch[2]);

    if (collection === 'offers' && method === 'POST' && !itemId) {
      return createOrUpdateOffer(req, res);
    }

    if (collection === 'offers' && method === 'PUT' && itemId) {
      return createOrUpdateOffer(req, res, itemId);
    }

    if (method === 'POST' && !itemId) {
      const body = await readBody(req);

      if ((collection === 'stores' || collection === 'products') && !String(body.name || '').trim()) {
        return json(res, 400, { error: 'Ad alanı zorunludur.' });
      }

      if (collection === 'ads') {
        if (!String(body.title || '').trim()) {
          return json(res, 400, { error: 'Reklam başlığı zorunludur.' });
        }
        if (!isValidAdTarget(body.targetUrl)) {
          return json(res, 400, { error: 'Geçerli bir reklam hedef bağlantısı girin.' });
        }
        if (!isValidImageReference(body.imageUrl)) {
          return json(res, 400, { error: 'Reklam görseli URL veya /images/ yolu olmalıdır.' });
        }
      }

      let created;

      await mutateDb((db) => {
        const item = {
          id: id(collection.slice(0, 4)),
          ...body,
          active: body.active !== false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if ('name' in item && !item.slug) item.slug = slugify(item.name);
        if (collection === 'products' && !Array.isArray(item.tags)) item.tags = [];
        if (collection === 'stores' && !item.integrationMode) {
          item.integrationMode = 'manual_verified';
        }
        if (collection === 'ads') {
          item.clicks = Number(item.clicks || 0);
          item.order = Number(item.order || 0);
          item.placement = item.placement || 'product_grid';
        }

        db[collection].push(item);
        created = item;
      });

      return json(res, 201, created);
    }

    if (method === 'PUT' && itemId) {
      const body = await readBody(req);

      if (collection === 'ads') {
        if ('title' in body && !String(body.title || '').trim()) {
          return json(res, 400, { error: 'Reklam başlığı zorunludur.' });
        }
        if ('targetUrl' in body && !isValidAdTarget(body.targetUrl)) {
          return json(res, 400, { error: 'Geçerli bir reklam hedef bağlantısı girin.' });
        }
        if ('imageUrl' in body && !isValidImageReference(body.imageUrl)) {
          return json(res, 400, { error: 'Reklam görseli URL veya /images/ yolu olmalıdır.' });
        }
      }

      let updated;

      await mutateDb((db) => {
        const item = db[collection].find((entry) => entry.id === itemId);
        if (!item) return;

        Object.assign(item, body, { updatedAt: new Date().toISOString() });
        if ('name' in body && !body.slug) item.slug = slugify(body.name);
        updated = item;
      });

      return updated
        ? json(res, 200, updated)
        : json(res, 404, { error: 'Kayıt bulunamadı.' });
    }

    if (method === 'DELETE' && itemId) {
      await mutateDb((db) => {
        db[collection] = db[collection].filter((item) => item.id !== itemId);

        if (collection === 'products') {
          db.offers = db.offers.filter((offer) => offer.productId !== itemId);
          db.priceHistory = db.priceHistory.filter((entry) => entry.productId !== itemId);
        }

        if (collection === 'stores') {
          db.offers = db.offers.filter((offer) => offer.storeId !== itemId);
          db.priceHistory = db.priceHistory.filter((entry) => entry.storeId !== itemId);
        }
      });

      return send(res, 204, '');
    }
  }

  return json(res, 404, { error: 'API yolu bulunamadı.' });
}

function serveFile(res, file) {
  const resolved = path.resolve(file);

  if (!resolved.startsWith(path.resolve(__dirname))) {
    return text(res, 403, 'Yasak.');
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return false;
  }

  const extension = path.extname(resolved).toLowerCase();
  send(res, 200, fs.readFileSync(resolved), {
    'Content-Type': mime[extension] || 'application/octet-stream',
    'Cache-Control': ['.html', '.js', '.css'].includes(extension)
      ? 'no-cache'
      : 'public, max-age=300'
  });

  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/go/') || url.pathname.startsWith('/ad/')) {
      return await apiRouter(req, res, url);
    }

    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return serveFile(res, path.join(publicDir, 'admin.html'));
    }

    if (url.pathname === '/README.md') {
      return serveFile(res, path.join(__dirname, 'README.md'));
    }

    const clean = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const candidate = path.join(publicDir, clean || 'index.html');

    if (serveFile(res, candidate)) return;
    if (!path.extname(clean)) return serveFile(res, path.join(publicDir, 'index.html'));

    return text(res, 404, 'Dosya bulunamadı.');
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || 'Sunucu hatası.' });
  }
});

await initializeDatabase();

server.listen(port, () => {
  console.log(`ArduFiyat http://localhost:${port}`);
  console.log(process.env.DATABASE_URL ? 'Veri deposu: PostgreSQL' : `Veri dosyası: ${dataFile}`);

  if (!process.env.DATABASE_URL && String(process.env.RENDER).toLowerCase() === 'true' && !persistentDataPathConfigured) {
    console.warn(
      'UYARI: ARDUFIYAT_DATA_DIR ayarlanmadı. Render yeniden başladığında kullanıcı ve Pro verileri kaybolabilir.'
    );
  }
});

if (String(process.env.AUTO_PRICE_SYNC).toLowerCase() === 'true') {
  const minutes = Math.max(15, Number(process.env.PRICE_SYNC_INTERVAL_MINUTES || 360));
  setInterval(() => runPriceSync('interval').catch(console.error), minutes * 60_000).unref();
}

if (String(process.env.AUTO_IMAGE_SYNC ?? 'true').toLowerCase() === 'true') {
  setTimeout(() => {
    syncAllProductImages({ reason: 'startup' })
      .then((result) => {
        console.log(`Fotoğraf senkronu: ${result.downloaded} indirildi, ${result.skipped} hazır, ${result.failed} başarısız.`);
      })
      .catch((error) => console.error('Fotoğraf senkronu başarısız:', error.message));
  }, 1200).unref();
}
