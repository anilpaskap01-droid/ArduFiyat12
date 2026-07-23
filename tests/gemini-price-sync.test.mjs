import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGeminiPriceResults,
  buildGenerateContentRequest,
  buildGeminiPricePrompt,
  parseGeminiPriceResponse,
  resolveGeminiModel,
  successfulGeminiUrls
} from '../src/gemini-price-sync.js';

const firstUrl = 'https://store.example.com/products/arduino-uno';
const secondUrl = 'https://store.example.com/products/arduino-nano';
const thirdUrl = 'https://store.example.com/products/esp32';

function interactionFor(results, urls = [firstUrl, secondUrl, thirdUrl]) {
  return {
    output_text: JSON.stringify({ results }),
    steps: [
      {
        type: 'url_context_result',
        result: urls.map((url) => ({ url, status: 'success' }))
      }
    ]
  };
}

function createDatabase() {
  return {
    offers: [
      {
        id: 'offer_price',
        productId: 'product_uno',
        storeId: 'store_example',
        price: 100,
        stock: 'unknown',
        active: true,
        url: firstUrl
      },
      {
        id: 'offer_stock',
        productId: 'product_nano',
        storeId: 'store_example',
        price: 200,
        stock: 'in_stock',
        active: true,
        url: secondUrl
      },
      {
        id: 'offer_uncertain',
        productId: 'product_esp32',
        storeId: 'store_example',
        price: 300,
        stock: 'in_stock',
        active: true,
        url: thirdUrl
      }
    ],
    stores: [{ id: 'store_example', name: 'Example Store', active: true }],
    priceHistory: []
  };
}

const targets = [
  { offerId: 'offer_price', url: firstUrl },
  { offerId: 'offer_stock', url: secondUrl },
  { offerId: 'offer_uncertain', url: thirdUrl }
];

test('Gemini interaction parsing keeps URL retrieval evidence', () => {
  const results = [{ offerId: 'offer_price' }];
  const interaction = interactionFor(results, [firstUrl]);

  assert.deepEqual(parseGeminiPriceResponse(interaction), results);
  assert.equal(successfulGeminiUrls(interaction).size, 1);
  assert.match(buildGeminiPricePrompt([
    {
      offerId: 'offer_price',
      productName: 'Arduino Uno',
      productBrand: 'Arduino',
      productSku: 'UNO',
      storeName: 'Example Store',
      url: firstUrl,
      currentPriceTry: 100
    }
  ]), /Never use search results/);
});

test('GenerateContent parsing keeps URL Context retrieval evidence', () => {
  const results = [{ offerId: 'offer_price' }];
  const response = {
    text: JSON.stringify({ results }),
    candidates: [{
      urlContextMetadata: {
        urlMetadata: [{
          retrievedUrl: firstUrl,
          urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
        }]
      }
    }]
  };

  assert.deepEqual(parseGeminiPriceResponse(response), results);
  assert.equal(successfulGeminiUrls(response).has(firstUrl), true);
});

test('GenerateContent request uses the supported URL Context shape', () => {
  const request = buildGenerateContentRequest('gemini-3.6-flash', [{
    offerId: 'offer_price',
    productName: 'Arduino Uno',
    storeName: 'Example Store',
    url: firstUrl,
    currentPriceTry: 100
  }]);

  assert.deepEqual(request.config.tools, [{ urlContext: {} }]);
  assert.equal(request.config.responseJsonSchema, undefined);
  assert.equal(request.config.responseMimeType, undefined);
  assert.equal(Array.isArray(request.contents), true);
});

test('retired Gemini 2.5 Flash configuration upgrades automatically', () => {
  assert.equal(resolveGeminiModel('gemini-2.5-flash'), 'gemini-3.6-flash');
  assert.equal(resolveGeminiModel('models/gemini-2.5-flash'), 'gemini-3.6-flash');
});

test('verified prices update and out-of-stock offers leave the storefront', () => {
  const db = createDatabase();
  const interaction = interactionFor([
    {
      offerId: 'offer_price',
      sourceUrl: firstUrl,
      pageAccessible: true,
      productMatch: true,
      stock: 'in_stock',
      priceTry: 125.5,
      currency: 'TRY',
      confidence: 0.96,
      note: 'Satış fiyatı sayfada görünüyor.'
    },
    {
      offerId: 'offer_stock',
      sourceUrl: secondUrl,
      pageAccessible: true,
      productMatch: true,
      stock: 'out_of_stock',
      priceTry: null,
      currency: 'TRY',
      confidence: 0.97,
      note: 'Ürün stokta yok.'
    },
    {
      offerId: 'offer_uncertain',
      sourceUrl: thirdUrl,
      pageAccessible: true,
      productMatch: true,
      stock: 'in_stock',
      priceTry: 50,
      currency: 'TRY',
      confidence: 0.4,
      note: 'Fiyat net değil.'
    }
  ]);
  const verifiedAt = '2026-07-23T12:00:00.000Z';

  const summary = applyGeminiPriceResults(
    db,
    targets,
    parseGeminiPriceResponse(interaction),
    successfulGeminiUrls(interaction),
    verifiedAt
  );

  const updated = db.offers.find((offer) => offer.id === 'offer_price');
  const outOfStock = db.offers.find((offer) => offer.id === 'offer_stock');
  const uncertain = db.offers.find((offer) => offer.id === 'offer_uncertain');

  assert.equal(updated.price, 125.5);
  assert.equal(updated.sourceType, 'gemini_url_context');
  assert.equal(db.priceHistory.length, 1);
  assert.equal(outOfStock.active, false);
  assert.equal(outOfStock.stock, 'out_of_stock');
  assert.equal(outOfStock.deactivatedReason, 'gemini_out_of_stock');
  assert.equal(db.stores.length, 1);
  assert.equal(uncertain.price, 300);
  assert.deepEqual(summary, {
    updated: 1,
    priceChanged: 1,
    deactivated: 1,
    reactivated: 0,
    unchanged: 0,
    skipped: 1
  });
});

test('a Gemini-hidden offer can return when stock comes back', () => {
  const db = createDatabase();
  const offer = db.offers.find((item) => item.id === 'offer_stock');
  offer.active = false;
  offer.stock = 'out_of_stock';
  offer.deactivatedReason = 'gemini_out_of_stock';

  const interaction = interactionFor([
    {
      offerId: 'offer_stock',
      sourceUrl: secondUrl,
      pageAccessible: true,
      productMatch: true,
      stock: 'low_stock',
      priceTry: 210,
      currency: 'TRY',
      confidence: 0.98,
      note: 'Son ürünler satışta.'
    }
  ], [secondUrl]);

  const summary = applyGeminiPriceResults(
    db,
    [{ offerId: 'offer_stock', url: secondUrl }],
    parseGeminiPriceResponse(interaction),
    successfulGeminiUrls(interaction),
    '2026-07-23T13:00:00.000Z'
  );

  assert.equal(offer.active, true);
  assert.equal(offer.stock, 'low_stock');
  assert.equal(offer.deactivatedReason, null);
  assert.equal(summary.reactivated, 1);
});
