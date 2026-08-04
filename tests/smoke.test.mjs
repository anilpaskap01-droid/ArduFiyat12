import test from 'node:test';
import assert from 'node:assert/strict';
import { readDb, slugify } from '../src/store.js';
import {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  normalizeEmail
} from '../src/auth.js';
import { isDirectOfferUrl } from '../src/offer-url.js';

test('seed data and new collections load', () => {
  const db = readDb();
  assert.ok(db.products.length >= 32);
  assert.ok(db.stores.length >= 24);
  assert.equal(db.settings.freeOfferLimit, 30);
  assert.equal(db.settings.proOfferLimit, 0);
  assert.equal(db.settings.adsEnabled, true);
  assert.ok(Array.isArray(db.users));
  assert.ok(db.ads.length >= 3);
  assert.ok(db.offers.length >= 70);
  assert.ok(db.offers.every((offer) => {
    const store = db.stores.find((item) => item.id === offer.storeId);
    return isDirectOfferUrl(offer.url, store?.domain);
  }));
  assert.ok(db.offers.every((offer) => Number(offer.price) > 0));
});

test('PC catalog products and categories are removed', () => {
  const db = readDb();
  const pcProducts = db.products.filter((product) => product.id.startsWith('prd_pc_'));
  assert.equal(pcProducts.length, 0);
  assert.equal(db.categories.some((category) => category.id === 'cat_cpu'), false);
  assert.equal(db.categories.some((category) => category.id === 'cat_gpu'), false);
});

test('slugify handles Turkish characters', () => {
  assert.equal(slugify('Ölçüm ve Güç'), 'olcum-ve-guc');
});

test('signed user tokens verify', () => {
  const token = signToken({ type: 'user', userId: 'user_test' }, 30);
  const payload = verifyToken(token, 'user');
  assert.equal(payload.type, 'user');
  assert.equal(payload.userId, 'user_test');
});

test('passwords are stored as salted hashes', () => {
  const password = 'OrnekSifre123';
  const credentials = hashPassword(password);
  assert.notEqual(credentials.passwordHash, password);
  assert.equal(verifyPassword(password, credentials.passwordSalt, credentials.passwordHash), true);
  assert.equal(verifyPassword('yanlis', credentials.passwordSalt, credentials.passwordHash), false);
  assert.equal(normalizeEmail(' TEST@Example.COM '), 'test@example.com');
});
