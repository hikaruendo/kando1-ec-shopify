import crypto from 'node:crypto';

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShop(raw) {
  const shop = String(raw || '').trim().toLowerCase();
  if (!SHOP_DOMAIN_RE.test(shop)) return null;
  return shop;
}

export function randomState() {
  return crypto.randomBytes(16).toString('hex');
}

function toQueryRecord(query = {}) {
  const out = {};
  for (const [k, v] of Object.entries(query)) {
    out[k] = Array.isArray(v) ? v.join(',') : String(v ?? '');
  }
  return out;
}

export function verifyHmac(query, apiSecret) {
  const row = toQueryRecord(query);
  const hmac = row.hmac || '';
  if (!hmac || !apiSecret) return false;

  const message = Object.keys(row)
    .filter(key => key !== 'hmac' && key !== 'signature')
    .sort()
    .map(key => `${key}=${row[key]}`)
    .join('&');

  const digest = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  const a = Buffer.from(hmac, 'utf8');
  const b = Buffer.from(digest, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildInstallUrl({ shop, apiKey, scopes, redirectUri, state }) {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set('client_id', apiKey);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

function decodeJwtSection(section) {
  return JSON.parse(Buffer.from(section, 'base64url').toString('utf8'));
}

function getTopLevelDomain(hostname) {
  const parts = String(hostname || '').toLowerCase().split('.').filter(Boolean);
  return parts.slice(-2).join('.');
}

export function getBearerToken(headerValue) {
  const raw = String(headerValue || '');
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export function verifySessionToken(token, { apiKey, apiSecret }) {
  if (!token) throw new Error('session token is missing');
  if (!apiKey || !apiSecret) throw new Error('app credentials are missing');

  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('invalid session token format');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtSection(encodedHeader);
  const payload = decodeJwtSection(encodedPayload);

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error('unsupported session token header');
  }

  const expectedSignature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const a = Buffer.from(encodedSignature, 'utf8');
  const b = Buffer.from(expectedSignature, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('invalid session token signature');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    throw new Error('session token expired');
  }
  if (payload.nbf != null && (!Number.isFinite(payload.nbf) || payload.nbf > now)) {
    throw new Error('session token not active yet');
  }
  if (String(payload.aud || '') !== String(apiKey)) {
    throw new Error('session token audience mismatch');
  }

  const destUrl = new URL(String(payload.dest || ''));
  const issUrl = new URL(String(payload.iss || ''));
  if (getTopLevelDomain(destUrl.hostname) !== getTopLevelDomain(issUrl.hostname)) {
    throw new Error('session token issuer mismatch');
  }

  const shop = normalizeShop(destUrl.hostname);
  if (!shop) throw new Error('invalid shop in session token');

  return { shop, payload };
}

export function verifyWebhookHmac(rawBody, headerValue, apiSecret) {
  if (!headerValue || !apiSecret) return false;
  const calculated = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody)
    .digest('base64');

  const a = Buffer.from(String(headerValue), 'base64');
  const b = Buffer.from(calculated, 'base64');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
