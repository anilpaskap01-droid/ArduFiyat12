import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateOfferUrl } from '../src/offer-url.js';
import { pruneInvalidOffers } from '../src/store.js';

test('direct product URLs are accepted', () => {
  const samples = [
    ['https://www.amazon.com.tr/example/dp/B0ABC12345', 'amazon.com.tr'],
    ['https://www.hepsiburada.com/example-p-HBCV0000123456', 'hepsiburada.com'],
    ['https://www.trendyol.com/marka/example-p-123456789', 'trendyol.com'],
    ['https://m.trendyol.com/marka/example-p-123456789', 'trendyol.com'],
    ['https://www.robotistan.com/arduino-nano', 'robotistan.com']
  ];

  for (const [url, storeDomain] of samples) {
    assert.equal(validateOfferUrl({ url, storeDomain }).valid, true, url);
  }
});

test('search, listing, homepage and mismatched URLs are rejected', () => {
  const samples = [
    ['https://www.hepsiburada.com/ara?q=arduino', 'hepsiburada.com', 'SEARCH_URL'],
    ['https://www.amazon.com.tr/s?k=arduino', 'amazon.com.tr', 'SEARCH_URL'],
    ['https://www.vatanbilgisayar.com/arama/arduino/', 'vatanbilgisayar.com', 'SEARCH_URL'],
    ['https://www.teknosa.com/?keyword=arduino', 'teknosa.com', 'SEARCH_URL'],
    ['https://www.n11.com/bilgisayar/arduino-urunleri', 'n11.com', 'NON_PRODUCT_URL'],
    ['https://www.robotzade.com/meta-etiket/arduino', 'robotzade.com', 'NON_PRODUCT_URL'],
    ['https://www.robotistan.com/', 'robotistan.com', 'HOMEPAGE_URL'],
    ['https://www.example.com/product/arduino', 'robotistan.com', 'DOMAIN_MISMATCH']
  ];

  for (const [url, storeDomain, issueCode] of samples) {
    const result = validateOfferUrl({ url, storeDomain });
    assert.equal(result.valid, false, url);
    assert.ok(result.issues.some((item) => item.code === issueCode), url);
  }
});

test('empty and malformed URLs are rejected', () => {
  assert.equal(validateOfferUrl({ url: '', storeDomain: 'example.com' }).issues[0].code, 'EMPTY_URL');
  assert.equal(validateOfferUrl({ url: 'not-a-url', storeDomain: 'example.com' }).issues[0].code, 'INVALID_URL');
  assert.ok(validateOfferUrl({ url: 'ftp://example.com/product', storeDomain: 'example.com' }).issues.some((item) => item.code === 'INVALID_PROTOCOL'));
});

test('seed and database contain only direct matching offer URLs', () => {
  for (const file of ['data/seed.json', 'data/db.json']) {
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    const stores = new Map(db.stores.map((store) => [store.id, store]));
    const retiredOfferIds = new Set(db.meta.retiredOfferIds || []);

    assert.equal(db.offers.length, 70, file);
    for (const offer of db.offers) {
      const store = stores.get(offer.storeId);
      assert.ok(store, `${file}: ${offer.id} mağazası`);
      assert.equal(retiredOfferIds.has(offer.id), false, `${file}: ${offer.id} emekli teklif`);
      assert.equal(
        validateOfferUrl({ url: offer.url, storeDomain: store.domain }).valid,
        true,
        `${file}: ${offer.id} ${offer.url}`
      );
    }
  }
});

test('database migration removes invalid and retired offers with orphan history', () => {
  const db = {
    stores: [{ id: 'store', domain: 'example.com' }],
    offers: [
      { id: 'valid', productId: 'product-a', storeId: 'store', url: 'https://example.com/products/a' },
      { id: 'search', productId: 'product-b', storeId: 'store', url: 'https://example.com/search?q=b' },
      { id: 'retired', productId: 'product-c', storeId: 'store', url: 'https://example.com/products/c' }
    ],
    priceHistory: [
      { productId: 'product-a', storeId: 'store', price: 10 },
      { productId: 'product-b', storeId: 'store', price: 20 },
      { productId: 'product-c', storeId: 'store', price: 30 }
    ]
  };

  const changed = pruneInvalidOffers(db, {
    meta: { retiredOfferIds: ['retired'] }
  });

  assert.equal(changed, true);
  assert.deepEqual(db.offers.map((offer) => offer.id), ['valid']);
  assert.deepEqual(db.priceHistory.map((entry) => entry.productId), ['product-a']);
});
