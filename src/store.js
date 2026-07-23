import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { isDirectOfferUrl } from './offer-url.js';
import pg from 'pg';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundledDataDirectory = path.join(root, 'data');
const bundledDatabaseFile = path.join(bundledDataDirectory, 'db.json');
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const configuredDataDirectory = databaseUrl ? '' : String(process.env.ARDUFIYAT_DATA_DIR || '').trim();

export const dataDirectory = configuredDataDirectory
  ? path.resolve(root, configuredDataDirectory)
  : bundledDataDirectory;
export const persistentDataPathConfigured = Boolean(databaseUrl || configuredDataDirectory);
export const postgresConfigured = Boolean(databaseUrl);
export const dataFile = path.join(dataDirectory, 'db.json');
export const seedFile = path.join(bundledDataDirectory, 'seed.json');

let writeQueue = Promise.resolve();
let memoryDatabase = null;
let pool = null;
let initialization = null;

async function persistDatabase(nextDb) {
  if (postgresConfigured) {
    await pool.query(
      `INSERT INTO app_state (id, data, updated_at) VALUES ('main', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify(nextDb)]
    );
    memoryDatabase = structuredClone(nextDb);
    return;
  }
  await fs.promises.mkdir(dataDirectory, { recursive: true });
  const temp = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temp, `${JSON.stringify(nextDb, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temp, dataFile);
  memoryDatabase = structuredClone(nextDb);
}

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

export function pruneInvalidOffers(db, seed) {
  const retiredOfferIds = new Set(
    Array.isArray(seed?.meta?.retiredOfferIds) ? seed.meta.retiredOfferIds : []
  );
  const storesById = new Map(db.stores.map((store) => [store.id, store]));
  const removedOfferKeys = new Set();
  const currentOffers = db.offers;

  db.offers = currentOffers.filter((offer) => {
    const store = storesById.get(offer?.storeId);
    const shouldKeep =
      !retiredOfferIds.has(offer?.id) &&
      isDirectOfferUrl(offer?.url, store?.domain);

    if (!shouldKeep && offer?.productId && offer?.storeId) {
      removedOfferKeys.add(`${offer.productId}:${offer.storeId}`);
    }

    return shouldKeep;
  });

  if (db.offers.length === currentOffers.length) return false;

  const remainingOfferKeys = new Set(
    db.offers.map((offer) => `${offer.productId}:${offer.storeId}`)
  );
  db.priceHistory = db.priceHistory.filter((entry) => {
    const key = `${entry?.productId}:${entry?.storeId}`;
    return !removedOfferKeys.has(key) || remainingOfferKeys.has(key);
  });

  return true;
}

function loadLocalDatabase() {
  if (!fs.existsSync(seedFile)) {
    throw new Error(`Başlangıç verisi bulunamadı: ${seedFile}`);
  }

  fs.mkdirSync(dataDirectory, { recursive: true });

  if (!fs.existsSync(dataFile)) {
    const initialDatabaseFile =
      dataFile !== bundledDatabaseFile && fs.existsSync(bundledDatabaseFile)
        ? bundledDatabaseFile
        : seedFile;
    fs.copyFileSync(initialDatabaseFile, dataFile);
  }

  try {
    const db = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    const shapeChanged = migrateDatabaseShape(db);
    const catalogChanged = mergeMissingSeedRecords(db, seed);
    const offersChanged = pruneInvalidOffers(db, seed);
    const changed = shapeChanged || catalogChanged || offersChanged;

    if (changed) {
      db.meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(dataFile, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
    }
    memoryDatabase = db;
    return db;
  } catch (error) {
    throw new Error(`Veritabanı okunamadı: ${error.message}`);
  }
}

export async function initializeDatabase(options = {}) {
  if (initialization) return initialization;
  initialization = (async () => {
    if (!postgresConfigured) return loadLocalDatabase();
    pool = options.pool || new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    let result = await pool.query("SELECT data FROM app_state WHERE id = 'main'");
    if (result.rowCount === 0) {
      const initialFile = fs.existsSync(bundledDatabaseFile) ? bundledDatabaseFile : seedFile;
      const initialDb = JSON.parse(await fs.promises.readFile(initialFile, 'utf8'));
      await pool.query(
        `INSERT INTO app_state (id, data) VALUES ('main', $1::jsonb) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(initialDb)]
      );
      result = await pool.query("SELECT data FROM app_state WHERE id = 'main'");
    }
    memoryDatabase = result.rows[0].data;
    const seed = JSON.parse(await fs.promises.readFile(seedFile, 'utf8'));
    const shapeChanged = migrateDatabaseShape(memoryDatabase);
    const catalogChanged = mergeMissingSeedRecords(memoryDatabase, seed);
    const offersChanged = pruneInvalidOffers(memoryDatabase, seed);
    if (shapeChanged || catalogChanged || offersChanged) {
      memoryDatabase.meta.updatedAt = new Date().toISOString();
      await persistDatabase(memoryDatabase);
    }
    return memoryDatabase;
  })();
  return initialization;
}

export function ensureDatabase() {
  if (postgresConfigured) {
    if (!memoryDatabase) throw new Error('PostgreSQL veritabanı henüz hazırlanmadı.');
    return;
  }
  if (!memoryDatabase) loadLocalDatabase();
}

export function readDb() {
  ensureDatabase();
  return structuredClone(memoryDatabase);
}

export function writeDb(nextDb) {
  const operation = writeQueue.then(() => persistDatabase(nextDb));
  writeQueue = operation.catch(() => {});
  return operation;
}

export function mutateDb(mutator) {
  const operation = writeQueue.then(async () => {
    ensureDatabase();
    const db = structuredClone(memoryDatabase);
    const result = await mutator(db);
    db.meta.updatedAt = new Date().toISOString();
    await persistDatabase(db);
    return result;
  });

  writeQueue = operation.catch(() => {});
  return operation;
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
