import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadEnv } from '../src/env.js';

loadEnv();

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('migrate:data için DATABASE_URL gerekli.');

const data = JSON.parse(fs.readFileSync(path.resolve('data', 'db.json'), 'utf8'));
const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const result = await pool.query(
    `INSERT INTO app_state (id, data) VALUES ('main', $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(data)]
  );
  console.log(result.rowCount === 1 ? "data/db.json PostgreSQL'e aktarıldı." : 'main kaydı zaten var; veri değiştirilmedi.');
} finally {
  await pool.end();
}
