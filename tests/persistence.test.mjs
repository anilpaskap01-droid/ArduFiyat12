import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function loadStore(instance) {
  return import(`../src/store.js?persistence-test=${instance}`);
}

test('users and Pro grants survive a store restart', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ardufiyat-data-'));
  const previousDataDirectory = process.env.ARDUFIYAT_DATA_DIR;
  process.env.ARDUFIYAT_DATA_DIR = temporaryDirectory;

  context.after(() => {
    if (previousDataDirectory === undefined) {
      delete process.env.ARDUFIYAT_DATA_DIR;
    } else {
      process.env.ARDUFIYAT_DATA_DIR = previousDataDirectory;
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  const firstServer = await loadStore(`first-${Date.now()}`);
  assert.equal(firstServer.dataFile, path.join(temporaryDirectory, 'db.json'));
  assert.equal(firstServer.persistentDataPathConfigured, true);

  await firstServer.mutateDb((db) => {
    db.users.push({
      id: 'user_persistent_pro',
      name: 'Kalıcı Pro',
      email: 'persistent@example.com',
      active: true,
      proActive: true,
      proExpiresAt: null,
      proSource: 'admin_manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  const restartedServer = await loadStore(`restart-${Date.now()}`);
  const persistedUser = restartedServer
    .readDb()
    .users.find((user) => user.id === 'user_persistent_pro');

  assert.ok(persistedUser);
  assert.equal(persistedUser.proActive, true);
  assert.equal(persistedUser.proExpiresAt, null);
});

test('concurrent mutations do not overwrite Pro grants', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ardufiyat-queue-'));
  const previousDataDirectory = process.env.ARDUFIYAT_DATA_DIR;
  process.env.ARDUFIYAT_DATA_DIR = temporaryDirectory;

  context.after(() => {
    if (previousDataDirectory === undefined) {
      delete process.env.ARDUFIYAT_DATA_DIR;
    } else {
      process.env.ARDUFIYAT_DATA_DIR = previousDataDirectory;
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  const store = await loadStore(`queue-${Date.now()}`);

  await Promise.all([
    store.mutateDb(async (db) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      db.users.push({ id: 'user_concurrent', email: 'queue@example.com', proActive: true });
    }),
    store.mutateDb((db) => {
      db.settings.adsEnabled = false;
    })
  ]);

  const db = store.readDb();
  assert.equal(db.users.some((user) => user.id === 'user_concurrent' && user.proActive), true);
  assert.equal(db.settings.adsEnabled, false);
});
