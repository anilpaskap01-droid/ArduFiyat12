import crypto from 'node:crypto';

const b64 = (value) => Buffer.from(value).toString('base64url');
const unb64 = (value) => Buffer.from(value, 'base64url').toString('utf8');

function secret() {
  return process.env.TOKEN_SECRET || 'dev-only-secret-change-me';
}

export function signToken(payload, ttlSeconds = 60 * 60 * 8) {
  const body = b64(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  }));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token, expectedType) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const receivedBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(unb64(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (expectedType && payload.type !== expectedType) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

export function normalizeEmail(value = '') {
  return String(value).trim().toLocaleLowerCase('tr-TR');
}

export function isValidEmail(value = '') {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 190;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { passwordSalt: salt, passwordHash: hash };
}

export function verifyPassword(password, passwordSalt, passwordHash) {
  if (!passwordSalt || !passwordHash) return false;

  try {
    const calculated = crypto.scryptSync(String(password), passwordSalt, 64);
    const expected = Buffer.from(String(passwordHash), 'hex');
    return calculated.length === expected.length && crypto.timingSafeEqual(calculated, expected);
  } catch {
    return false;
  }
}
