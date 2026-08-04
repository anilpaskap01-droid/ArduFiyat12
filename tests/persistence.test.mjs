import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function loadStore(instance) {
  return import(`../src/store.js?persistence-test=${instance}`);
}

class FakePostgresPool {
  constructor(state) {
    this.state = state;
  }

  async query(sql, params = []) {
    if (sql.includes('CREATE TABLE')) return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT data')) {
      return this.state.main
        ? { rowCount: 1, rows: [{ data: structuredClone(this.state.main) }] }
        : { rowCount: 0, rows: [] };
    }
    if (sql.includes('INSERT INTO app_state')) {
      const incoming = JSON.parse(params[0]);
      const doNothing = sql.includes('DO NOTHING');
      if (!this.state.main || !doNothing) this.state.main = structuredClone(incoming);
      return { rowCount: this.state.main ? 1 : 0, rows: [] };
    }
    throw new Error(`Beklenmeyen sorgu: ${sql}`);
  }
}

test('PostgreSQL preserves a Pro user after restart', async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://test:secret@example.test/app';
  context.after(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  const postgresState = {};
  const firstServer = await loadStore(`postgres-first-${Date.now()}`);
  await firstServer.initializeDatabase({ pool: new FakePostgresPool(postgresState) });
  await firstServer.mutateDb((db) => {
    db.users.push({
      id: 'user_postgres_pro',
      email: 'postgres-pro@example.com',
      active: true,
      proActive: true,
      proExpiresAt: null
    });
  });

  const restartedServer = await loadStore(`postgres-restart-${Date.now()}`);
  await restartedServer.initializeDatabase({ pool: new FakePostgresPool(postgresState) });
  const user = restartedServer.readDb().users.find((item) => item.id === 'user_postgres_pro');
  assert.ok(user);
  assert.equal(user.proActive, true);
});

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
