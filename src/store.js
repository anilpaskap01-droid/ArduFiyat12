import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
export const dataFile = path.join(root, 'data', 'db.json');
export const seedFile = path.join(root, 'data', 'seed.json');

let writeQueue = Promise.resolve();

function migrateDatabaseShape(db) {
  let changed = false;

  if (!db.meta || typeof db.meta !== 'object') {
    db.meta = { updatedAt: new Date().toISOString() };
    changed = true;
  }

  const arrayCollections = [
    'categories',
    'products',
    'stores',
    'offers',
    'campaigns',
    'banners',
    'coupons',
    'priceHistory',
    'syncLogs',
    'users',
    'ads',
    'emailVerifications',
    'payments'
  ];

  for (const collection of arrayCollections) {
    if (!Array.isArray(db[collection])) {
      db[collection] = [];
      changed = true;
    }
  }

  if (!db.settings || typeof db.settings !== 'object') {
    db.settings = {};
    changed = true;
  }

  const defaults = {
    freeOfferLimit: 30,
    proOfferLimit: 0,
    adsEnabled: true,
    adFrequency: 8
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (db.settings[key] === undefined) {
      db.settings[key] = value;
      changed = true;
    }
  }

  if ('proUnlockCode' in db.settings) {
    delete db.settings.proUnlockCode;
    changed = true;
  }

  return changed;
}

function mergeMissingSeedRecords(db, seed) {
  let changed = false;
  const collections = [
    'categories',
    'products',
    'stores',
    'offers',
    'campaigns',
    'banners',
    'coupons',
    'ads'
  ];

  for (const collection of collections) {
    const current = Array.isArray(db[collection]) ? db[collection] : [];
    const incoming = Array.isArray(seed[collection]) ? seed[collection] : [];
    const existingIds = new Set(current.map((item) => item?.id).filter(Boolean));

    for (const item of incoming) {
      if (item?.id && !existingIds.has(item.id)) {
        current.push(item);
        existingIds.add(item.id);
        changed = true;
      }
    }

    // Katalog sürümü değiştiğinde mevcut ürünlerin görsel yollarını da yenile.
    if (collection === 'products') {
      const incomingById = new Map(incoming.filter((item) => item?.id).map((item) => [item.id, item]));
      for (const currentItem of current) {
        const seededItem = incomingById.get(currentItem?.id);
        if (!seededItem) continue;
        const nextImageUrl = seededItem.imageUrl || '';
        if (nextImageUrl && currentItem.imageUrl !== nextImageUrl) {
          currentItem.imageUrl = nextImageUrl;
          currentItem.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
    }

    db[collection] = current;
  }

  // Yeni katalog sürümünü kaydet; mevcut admin ayarlarını ve kullanıcı verilerini koru.
  const seedVersion = seed?.meta?.catalogVersion || seed?.meta?.version || null;
  if (seedVersion && db.meta.catalogVersion !== seedVersion) {
    db.meta.catalogVersion = seedVersion;
    changed = true;
  }

  return changed;
}

export function ensureDatabase() {
  if (!fs.existsSync(seedFile)) {
    throw new Error(`Başlangıç verisi bulunamadı: ${seedFile}`);
  }

  if (!fs.existsSync(dataFile)) {
    fs.copyFileSync(seedFile, dataFile);
  }

  try {
    const db = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    const shapeChanged = migrateDatabaseShape(db);
    const catalogChanged = mergeMissingSeedRecords(db, seed);
    const changed = shapeChanged || catalogChanged;

    if (changed) {
      db.meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(dataFile, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    throw new Error(`Veritabanı okunamadı: ${error.message}`);
  }
}

export function readDb() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

export function writeDb(nextDb) {
  writeQueue = writeQueue.then(async () => {
    const temp = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(temp, `${JSON.stringify(nextDb, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temp, dataFile);
  });
  return writeQueue;
}

export async function mutateDb(mutator) {
  const db = readDb();
  const result = await mutator(db);
  db.meta.updatedAt = new Date().toISOString();
  await writeDb(db);
  return result;
}

export function id(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`;
}

export function slugify(value = '') {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
