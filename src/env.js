import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let runtimeFallbacksApplied = false;

function applySecureRuntimeFallbacks() {
  if (runtimeFallbacksApplied) return;
  runtimeFallbacksApplied = true;

  if (!String(process.env.TOKEN_SECRET || '').trim()) {
    process.env.TOKEN_SECRET = crypto.randomBytes(48).toString('hex');
  }

  if (!String(process.env.ADMIN_EMAIL || '').trim()) {
    process.env.ADMIN_EMAIL = `disabled-${crypto.randomBytes(8).toString('hex')}@invalid.local`;
  }

  if (!String(process.env.ADMIN_PASSWORD || '').trim()) {
    process.env.ADMIN_PASSWORD = crypto.randomBytes(48).toString('base64url');
  }
}

export function loadEnv(file = path.resolve('.env')) {
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const index = line.indexOf('=');
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  }

  applySecureRuntimeFallbacks();
}
