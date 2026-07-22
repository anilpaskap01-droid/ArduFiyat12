import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDb, mutateDb, id } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const productImageDir = path.join(publicDir, 'images', 'products');
const maxImageBytes = 8 * 1024 * 1024;
const maxPageBytes = 3 * 1024 * 1024;
const timeoutMs = Math.max(4_000, Number(process.env.IMAGE_SYNC_TIMEOUT_MS || 12_000));

fs.mkdirSync(productImageDir, { recursive: true });

let activeFullSync = null;
const activeProductSyncs = new Map();

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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

function decodeHtml(value = '') {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x2F;', '/')
    .replaceAll('\\/', '/')
    .trim();
}

function absoluteUrl(value, baseUrl) {
  try {
    const resolved = new URL(decodeHtml(value), baseUrl).toString();
    return isSafeRemoteUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

async function fetchBuffer(url, options = {}, maxBytes = maxImageBytes) {
  if (!isSafeRemoteUrl(url)) throw new Error('Güvenli olmayan uzak URL.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('Dosya boyutu sınırı aşıldı.');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) {
      throw new Error('Dosya boyutu geçersiz.');
    }

    return { response, buffer };
  } finally {
    clearTimeout(timer);
  }
}

function imageCandidatesFromHtml(html, pageUrl, productName = '') {
  const candidates = [];
  const add = (value) => {
    const resolved = absoluteUrl(value, pageUrl);
    if (resolved && !candidates.includes(resolved)) candidates.push(resolved);
  };

  const metaPatterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image(?::src)?)["'][^>]*>/gi
  ];

  for (const pattern of metaPatterns) {
    for (const match of html.matchAll(pattern)) add(match[1]);
  }

  for (const match of html.matchAll(/"image"\s*:\s*"([^"]+)"/gi)) add(match[1]);
  for (const match of html.matchAll(/"image"\s*:\s*\[\s*"([^"]+)"/gi)) add(match[1]);

  const words = String(productName)
    .toLocaleLowerCase('tr-TR')
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .slice(0, 5);

  const imgPattern = /<img\b[^>]*(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(imgPattern)) {
    const tag = match[0].toLocaleLowerCase('tr-TR');
    const likelyProduct = words.some((word) => tag.includes(word));
    if (likelyProduct) add(match[1]);
  }

  return candidates;
}

async function discoverImages(pageUrl, productName) {
  const { buffer } = await fetchBuffer(
    pageUrl,
    {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7'
      }
    },
    maxPageBytes
  );

  return imageCandidatesFromHtml(buffer.toString('utf8'), pageUrl, productName);
}

function contentTypeToExtension(contentType = '', url = '') {
  const normalized = String(contentType).toLowerCase();
  if (normalized.includes('image/png')) return '.png';
  if (normalized.includes('image/webp')) return '.webp';
  if (normalized.includes('image/gif')) return '.gif';
  if (normalized.includes('image/avif')) return '.avif';
  if (normalized.includes('image/svg')) return '.svg';
  if (normalized.includes('image/jpeg') || normalized.includes('image/jpg')) return '.jpg';

  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if (['.png', '.webp', '.gif', '.avif', '.svg', '.jpg', '.jpeg'].includes(extension)) {
      return extension === '.jpeg' ? '.jpg' : extension;
    }
  } catch {
    // JPEG varsayılanına düş.
  }

  return '.jpg';
}

function looksLikeImage(buffer, contentType = '') {
  if (String(contentType).toLowerCase().startsWith('image/')) return true;
  if (buffer.length < 12) return false;

  const head = buffer.subarray(0, 12);
  return (
    head[0] === 0xff && head[1] === 0xd8 ||
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    head.subarray(0, 4).toString('ascii') === 'RIFF' ||
    head.subarray(0, 3).toString('ascii') === 'GIF' ||
    head.toString('utf8').trimStart().startsWith('<svg')
  );
}

function removeOldProductImages(productId, keepPath = '') {
  const safeId = String(productId).replace(/[^a-zA-Z0-9_-]/g, '_');
  for (const extension of ['.jpg', '.png', '.webp', '.gif', '.avif', '.svg']) {
    const candidate = path.join(productImageDir, `${safeId}${extension}`);
    if (candidate !== keepPath && fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
  }
}

export function resolveLocalProductImage(product) {
  const imageUrl = String(product?.imageUrl || '').trim();
  if (!imageUrl.startsWith('/images/products/')) return null;

  const file = path.resolve(publicDir, imageUrl.replace(/^\/+/, ''));
  if (!file.startsWith(path.resolve(publicDir)) || !fs.existsSync(file)) return null;

  return file;
}

async function downloadImage(candidate, referer = '') {
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7'
  };

  if (referer && isSafeRemoteUrl(referer)) {
    headers.referer = referer;
    try {
      headers.origin = new URL(referer).origin;
    } catch {
      // Origin zorunlu değil.
    }
  }

  const { response, buffer } = await fetchBuffer(candidate.url, { headers });
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim();

  if (!looksLikeImage(buffer, contentType)) throw new Error('Kaynak resim döndürmedi.');
  if (buffer.length < 1_000) throw new Error('Resim dosyası şüpheli derecede küçük.');

  return { buffer, contentType, finalUrl: response.url || candidate.url };
}

async function buildCandidateList(db, product) {
  const pageUrls = [];
  const addPage = (url) => {
    const value = String(url || '').trim();
    if (isSafeRemoteUrl(value) && !pageUrls.includes(value)) pageUrls.push(value);
  };

  addPage(product.imageSourceUrl);
  for (const offer of db.offers.filter((item) => item.productId === product.id && item.active)) {
    addPage(offer.url);
  }

  const candidates = [];
  const addCandidate = (url, referer = '') => {
    const value = String(url || '').trim();
    if (!isSafeRemoteUrl(value)) return;
    if (!candidates.some((item) => item.url === value)) candidates.push({ url: value, referer });
  };

  if (isSafeRemoteUrl(product.imageUrl)) {
    addCandidate(product.imageUrl, product.imageSourceUrl || pageUrls[0] || '');
  }

  for (const pageUrl of pageUrls) {
    try {
      const discovered = await discoverImages(pageUrl, product.name);
      for (const imageUrl of discovered) addCandidate(imageUrl, pageUrl);
      if (candidates.length >= 8) break;
    } catch {
      // Diğer mağaza sayfasını dene.
    }
  }

  return candidates.slice(0, 12);
}

async function downloadForProduct(db, product, { force = false } = {}) {
  const existing = resolveLocalProductImage(product);
  if (existing && !force) {
    return { productId: product.id, status: 'skipped', localUrl: product.imageUrl };
  }

  const candidates = await buildCandidateList(db, product);
  let lastError = 'Uygun resim kaynağı bulunamadı.';

  for (const candidate of candidates) {
    try {
      const image = await downloadImage(candidate, candidate.referer);
      const extension = contentTypeToExtension(image.contentType, image.finalUrl);
      const safeId = String(product.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const file = path.join(productImageDir, `${safeId}${extension}`);
      const temporary = `${file}.${process.pid}.tmp`;

      fs.writeFileSync(temporary, image.buffer);
      fs.renameSync(temporary, file);
      removeOldProductImages(product.id, file);

      return {
        productId: product.id,
        status: 'downloaded',
        localUrl: `/images/products/${path.basename(file)}`,
        remoteUrl: image.finalUrl,
        sourcePage: candidate.referer || product.imageSourceUrl || ''
      };
    } catch (error) {
      lastError = error.message;
    }
  }

  return { productId: product.id, status: 'failed', error: lastError };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length || 1) }, runner)
  );

  return results;
}

export async function syncAllProductImages({ force = false, reason = 'manual' } = {}) {
  if (activeFullSync) return activeFullSync;

  activeFullSync = (async () => {
    const db = readDb();
    const products = db.products.filter((product) => product.active);
    const concurrency = Math.max(1, Math.min(8, Number(process.env.IMAGE_SYNC_CONCURRENCY || 4)));
    const startedAt = new Date().toISOString();

    const results = await runWithConcurrency(
      products,
      concurrency,
      (product) => downloadForProduct(db, product, { force })
    );

    const successful = results.filter((result) => result.status === 'downloaded');

    if (successful.length) {
      await mutateDb((nextDb) => {
        for (const result of successful) {
          const product = nextDb.products.find((item) => item.id === result.productId);
          if (!product) continue;

          if (isSafeRemoteUrl(product.imageUrl) && !product.remoteImageUrl) {
            product.remoteImageUrl = product.imageUrl;
          }
          product.imageUrl = result.localUrl;
          product.imageRemoteUrl = result.remoteUrl;
          product.imageSourceUrl = result.sourcePage || product.imageSourceUrl;
          product.imageDownloadedAt = new Date().toISOString();
          product.updatedAt = new Date().toISOString();
        }

        nextDb.syncLogs.unshift({
          id: id('sync'),
          source: `image_${reason}`,
          status: results.some((result) => result.status === 'failed') ? 'partial' : 'success',
          imported: successful.length,
          skipped: results.filter((result) => result.status === 'skipped').length,
          failed: results.filter((result) => result.status === 'failed').length,
          startedAt,
          finishedAt: new Date().toISOString(),
          message: `${successful.length} ürün fotoğrafı yerel klasöre indirildi.`
        });
        nextDb.syncLogs = nextDb.syncLogs.slice(0, 100);
      });
    }

    return {
      total: results.length,
      downloaded: successful.length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results
    };
  })();

  try {
    return await activeFullSync;
  } finally {
    activeFullSync = null;
  }
}

export async function ensureLocalProductImage(productId, { force = false } = {}) {
  if (activeProductSyncs.has(productId)) return activeProductSyncs.get(productId);

  const task = (async () => {
    const db = readDb();
    const product = db.products.find((item) => item.id === productId && item.active);
    if (!product) return { productId, status: 'failed', error: 'Ürün bulunamadı.' };

    const result = await downloadForProduct(db, product, { force });
    if (result.status !== 'downloaded') return result;

    await mutateDb((nextDb) => {
      const target = nextDb.products.find((item) => item.id === productId);
      if (!target) return;

      if (isSafeRemoteUrl(target.imageUrl) && !target.remoteImageUrl) {
        target.remoteImageUrl = target.imageUrl;
      }
      target.imageUrl = result.localUrl;
      target.imageRemoteUrl = result.remoteUrl;
      target.imageSourceUrl = result.sourcePage || target.imageSourceUrl;
      target.imageDownloadedAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();
    });

    return result;
  })();

  activeProductSyncs.set(productId, task);
  try {
    return await task;
  } finally {
    activeProductSyncs.delete(productId);
  }
}
