import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutateDb, id } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const importFile = path.join(root, 'data', 'imports', 'offers.csv');

function parseCsv(text) {
  const rows = text.split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const headers = rows.shift().split(',').map((x) => x.trim());
  return rows.map((line) => {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === ',' && !quoted) { values.push(current); current = ''; continue; }
      current += char;
    }
    values.push(current);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export async function runPriceSync(trigger = 'manual') {
  const startedAt = new Date().toISOString();
  let imported = 0;
  let skipped = 0;
  const errors = [];

  if (!fs.existsSync(importFile)) {
    await mutateDb((db) => {
      db.syncLogs.unshift({ id: id('sync'), trigger, startedAt, finishedAt: new Date().toISOString(), imported, skipped, status: 'success', note: 'CSV bulunmadı; değişiklik yapılmadı.' });
      db.syncLogs = db.syncLogs.slice(0, 50);
    });
    return { imported, skipped, errors };
  }

  const rows = parseCsv(fs.readFileSync(importFile, 'utf8'));
  await mutateDb((db) => {
    for (const row of rows) {
      const product = db.products.find((x) => x.sku === row.product_sku);
      const store = db.stores.find((x) => x.slug === row.store_slug);
      const price = Number(String(row.price).replace(',', '.'));
      if (!product || !store || !Number.isFinite(price) || !row.url?.startsWith('http')) {
        skipped += 1;
        errors.push(`Geçersiz satır: ${row.product_sku || '?'} / ${row.store_slug || '?'}`);
        continue;
      }
      const existing = db.offers.find((x) => x.productId === product.id && x.storeId === store.id);
      const payload = {
        productId: product.id,
        storeId: store.id,
        price,
        shipping: row.shipping || 'Mağazada hesaplanır',
        stock: row.stock || 'unknown',
        url: row.url,
        verifiedAt: row.verified_at || new Date().toISOString(),
        sourceType: row.source_type || 'merchant_csv',
        active: row.active !== 'false'
      };
      if (existing) Object.assign(existing, payload, { updatedAt: new Date().toISOString() });
      else db.offers.push({ id: id('offer'), ...payload, clicks: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      db.priceHistory.push({ id: id('ph'), productId: product.id, storeId: store.id, price, capturedAt: payload.verifiedAt });
      imported += 1;
    }
    db.syncLogs.unshift({ id: id('sync'), trigger, startedAt, finishedAt: new Date().toISOString(), imported, skipped, status: errors.length ? 'warning' : 'success', note: errors.slice(0, 5).join(' | ') });
    db.syncLogs = db.syncLogs.slice(0, 50);
    db.priceHistory = db.priceHistory.slice(-5000);
  });
  return { imported, skipped, errors };
}
