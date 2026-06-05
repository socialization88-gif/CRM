const crypto = require('crypto');
const bcrypt = require('bcrypt');

function base64url(input) { return Buffer.from(input).toString('base64url'); }
function appSecret() { return process.env.APP_SECRET || process.env.DATABASE_URL || 'quantum-work-management-local-secret'; }
function signPayload(payload) { return crypto.createHmac('sha256', appSecret()).update(payload).digest('base64url'); }
function makeToken(user, ttlSeconds = 60 * 60 * 12) {
  const payload = base64url(JSON.stringify({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return payload + '.' + signPayload(payload);
}
function readTokenPayload(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signPayload(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch { return null; }
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return 'pbkdf2$120000$' + salt + '$' + hash;
}
function verifyPassword(password, encoded) {
  if (String(encoded || '').startsWith('$2')) return bcrypt.compareSync(String(password), String(encoded || ''));
  const [kind, iterations, salt, expected] = String(encoded || '').split('$');
  if (kind !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function hashResetToken(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
function generateResetToken() { const token = crypto.randomBytes(32).toString('hex'); return { token, tokenHash: hashResetToken(token) }; }
function encryptionKey() { return crypto.createHash('sha256').update(appSecret()).digest(); }
function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), encrypted: encrypted.toString('base64url') };
}
function decryptSecret(payload) {
  if (!payload?.encrypted || !payload?.iv || !payload?.tag) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload.encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
module.exports = { appSecret, base64url, decryptSecret, encryptSecret, encryptionKey, generateResetToken, hashPassword, hashResetToken, makeToken, readTokenPayload, signPayload, verifyPassword };
