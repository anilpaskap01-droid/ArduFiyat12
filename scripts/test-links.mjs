import fs from 'node:fs';
import path from 'node:path';
import { validateOfferUrl } from '../src/offer-url.js';

const dataFiles = ['data/seed.json', 'data/db.json'];
const skipHttp = process.argv.includes('--skip-http');
const timeoutMs = Math.max(1_000, Number(process.env.LINK_TEST_TIMEOUT_MS || 15_000));
const concurrency = Math.max(1, Math.min(12, Number(process.env.LINK_TEST_CONCURRENCY || 6)));
const issues = [];
const httpTargets = new Map();
let offerCount = 0;

function reportIssue({ file, offer, store, code, message, url = offer?.url || '' }) {
  issues.push({
    file,
    offerId: offer?.id || '-',
    store: store?.name || offer?.storeId || '-',
    code,
    message,
    url
  });
}

for (const relativeFile of dataFiles) {
  const file = path.resolve(relativeFile);
  let db;

  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    reportIssue({
      file: relativeFile,
      code: 'DATA_FILE_ERROR',
      message: error.message
    });
    continue;
  }

  const stores = new Map((db.stores || []).map((store) => [store.id, store]));
  const products = new Set((db.products || []).map((product) => product.id));
  const offers = Array.isArray(db.offers) ? db.offers : [];
  offerCount += offers.length;
  console.log(`[links] ${relativeFile}: ${offers.length} teklif`);

  for (const offer of offers) {
    const store = stores.get(offer?.storeId);

    if (!store) {
      reportIssue({
        file: relativeFile,
        offer,
        code: 'STORE_NOT_FOUND',
        message: 'Teklifin mağaza kaydı bulunamadı.'
      });
    }

    if (!products.has(offer?.productId)) {
      reportIssue({
        file: relativeFile,
        offer,
        store,
        code: 'PRODUCT_NOT_FOUND',
        message: 'Teklifin ürün kaydı bulunamadı.'
      });
    }

    const validation = validateOfferUrl({
      url: offer?.url,
      storeDomain: store?.domain
    });

    for (const validationIssue of validation.issues) {
      reportIssue({
        file: relativeFile,
        offer,
        store,
        code: validationIssue.code,
        message: validationIssue.message
      });
    }

    if (validation.valid && !skipHttp) {
      const key = String(offer.url).trim();
      const target = httpTargets.get(key) || { url: key, references: [] };
      target.references.push({ file: relativeFile, offer, store });
      httpTargets.set(key, target);
    }
  }
}

async function checkHttp(target) {
  try {
    const response = await fetch(target.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36',
        'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    await response.body?.cancel().catch(() => {});

    if (!response.ok) {
      return {
        code: 'HTTP_ERROR',
        message: `HTTP ${response.status} ${response.statusText}`.trim(),
        url: response.url || target.url
      };
    }

    const finalValidation = validateOfferUrl({
      url: response.url || target.url,
      storeDomain: target.references[0].store.domain
    });

    if (!finalValidation.valid) {
      return {
        code: `FINAL_${finalValidation.issues[0].code}`,
        message: `Yönlendirme sonrası: ${finalValidation.issues[0].message}`,
        url: response.url || target.url
      };
    }

    return null;
  } catch (error) {
    const detail = error.cause?.code || error.name || 'Error';
    return {
      code: 'HTTP_REQUEST_FAILED',
      message: `${detail}: ${error.message}`,
      url: target.url
    };
  }
}

if (!skipHttp && httpTargets.size) {
  console.log(`[links] ${httpTargets.size} benzersiz doğrudan bağlantı HTTP ile kontrol ediliyor...`);
  const targets = [...httpTargets.values()];
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor];
      cursor += 1;
      const httpIssue = await checkHttp(target);
      if (!httpIssue) continue;

      for (const reference of target.references) {
        reportIssue({
          ...reference,
          code: httpIssue.code,
          message: httpIssue.message,
          url: httpIssue.url
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
}

if (issues.length) {
  console.error(`\n[links] ${issues.length} sorun bulundu:`);
  for (const item of issues) {
    console.error(`- [${item.code}] ${item.file} / ${item.offerId} / ${item.store}: ${item.message}`);
    if (item.url) console.error(`  ${item.url}`);
  }
  process.exitCode = 1;
} else {
  const httpSummary = skipHttp ? 'HTTP kontrolü atlandı' : `${httpTargets.size} benzersiz URL HTTP 2xx`;
  console.log(`[links] Başarılı: ${offerCount} teklif kaydı, ${httpSummary}.`);
}
