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
