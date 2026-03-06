import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { simulate } from './rules.js';
import { fetchVariantsByProductId, updateVariantPrice } from './shopifyClient.js';
import { jobs, nextJobId, shopSessions, saveShopSession, saveOauthState, consumeOauthState } from './store.js';
import { buildInstallUrl, normalizeShop, randomState, verifyHmac } from './shopifyAuth.js';

const {
  PORT = 8787,
  APP_URL,
  MOCK_MODE = 'true',
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_SCOPES = 'read_products,write_products',
  SHOPIFY_SHOP_DOMAIN,
  SHOPIFY_ADMIN_ACCESS_TOKEN
} = process.env;

const port = Number(PORT);
const appBaseUrl = APP_URL || `http://localhost:${port}`;
const redirectUri = new URL('/auth/callback', appBaseUrl).toString();
const mockMode = MOCK_MODE === 'true';
let indexHtmlCache = null;

function getShopFromRequest(req) {
  return (
    req.body?.shop
    || req.query?.shop
    || req.get('x-shopify-shop-domain')
    || ''
  );
}

function getSessionByShop(shop) {
  const envShop = normalizeShop(SHOPIFY_SHOP_DOMAIN);
  if (envShop && shop === envShop && SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return { accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN, source: 'env' };
  }

  const session = shopSessions.get(shop);
  if (!session?.accessToken) return null;
  return { accessToken: session.accessToken, source: 'oauth' };
}

function resolveShopContext(req) {
  if (mockMode) return {};

  const fallbackShop = normalizeShop(SHOPIFY_SHOP_DOMAIN);
  const shop = normalizeShop(getShopFromRequest(req) || fallbackShop);
  if (!shop) {
    return { error: { status: 400, body: { error: 'shop is required (example: your-store.myshopify.com)' } } };
  }

  const session = getSessionByShop(shop);
  if (!session?.accessToken) {
    return { error: { status: 401, body: { error: 'shop is not connected yet', authUrl: `/auth?shop=${encodeURIComponent(shop)}` } } };
  }

  return { shop, accessToken: session.accessToken };
}

function assertAuthConfig() {
  if (mockMode) return null;
  if (SHOPIFY_API_KEY && SHOPIFY_API_SECRET) return null;
  return 'SHOPIFY_API_KEY and SHOPIFY_API_SECRET are required when MOCK_MODE=false';
}

async function renderIndexHtml() {
  if (!indexHtmlCache) {
    indexHtmlCache = await readFile(path.resolve('public/index.html'), 'utf8');
  }
  return indexHtmlCache.replace('__SHOPIFY_API_KEY__', String(SHOPIFY_API_KEY || ''));
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const shop = normalizeShop(getShopFromRequest(req));
  if (shop) {
    res.set('Content-Security-Policy', `frame-ancestors https://${shop} https://admin.shopify.com;`);
  }
  next();
});
app.use(express.static('public', { index: false }));

app.get('/health', (_req, res) => res.json({ ok: true, mockMode, appBaseUrl }));

app.get('/', (req, res) => {
  return (async () => {
    const authError = assertAuthConfig();
    if (authError) return res.status(500).send(authError);

    const shop = normalizeShop(req.query.shop);
    if (!mockMode && shop && !getSessionByShop(shop)) {
      return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    }

    const html = await renderIndexHtml();
    return res.type('html').send(html);
  })().catch(error => {
    return res.status(500).send(String(error));
  });
});

app.get('/auth', (req, res) => {
  const authError = assertAuthConfig();
  if (authError) return res.status(500).json({ error: authError });

  const shop = normalizeShop(req.query.shop);
  if (!shop) return res.status(400).json({ error: 'valid shop is required (example: your-store.myshopify.com)' });

  const state = randomState();
  saveOauthState(state, shop);
  const installUrl = buildInstallUrl({
    shop,
    apiKey: SHOPIFY_API_KEY,
    scopes: SHOPIFY_SCOPES,
    redirectUri,
    state
  });

  return res.redirect(installUrl);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const authError = assertAuthConfig();
    if (authError) return res.status(500).json({ error: authError });
    if (!verifyHmac(req.query, SHOPIFY_API_SECRET)) {
      return res.status(400).json({ error: 'invalid hmac' });
    }

    const shop = normalizeShop(req.query.shop);
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!shop || !code || !state) {
      return res.status(400).json({ error: 'shop/code/state required' });
    }

    const stateRow = consumeOauthState(state);
    if (!stateRow || stateRow.shop !== shop || Date.now() - stateRow.createdAt > 10 * 60 * 1000) {
      return res.status(400).json({ error: 'invalid or expired oauth state' });
    }

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      })
    });
    const tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.access_token) {
      return res.status(502).json({ error: 'token exchange failed', detail: tokenBody });
    }

    saveShopSession(shop, {
      shop,
      accessToken: tokenBody.access_token,
      scope: tokenBody.scope || SHOPIFY_SCOPES
    });

    const redirect = new URL('/', appBaseUrl);
    redirect.searchParams.set('shop', shop);
    if (req.query.host) redirect.searchParams.set('host', String(req.query.host));
    redirect.searchParams.set('installed', '1');
    return res.redirect(redirect.toString());
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/api/auth/status', (req, res) => {
  const shop = normalizeShop(req.query.shop);
  if (!shop) return res.status(400).json({ error: 'shop required' });
  const session = getSessionByShop(shop);
  return res.json({ shop, connected: Boolean(session?.accessToken), source: session?.source || null });
});

app.post('/api/simulate', async (req, res) => {
  try {
    const { productId, rules = [] } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId required' });
    const shopContext = resolveShopContext(req);
    if (shopContext.error) return res.status(shopContext.error.status).json(shopContext.error.body);

    const variants = await fetchVariantsByProductId(productId, shopContext);
    const out = simulate(variants, rules);
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/api/apply', async (req, res) => {
  try {
    const { productId, rules = [] } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId required' });

    const shopContext = resolveShopContext(req);
    if (shopContext.error) return res.status(shopContext.error.status).json(shopContext.error.body);

    const variants = await fetchVariantsByProductId(productId, shopContext);
    const sim = simulate(variants, rules);
    const changed = sim.diffs.filter(d => d.changed);

    const jobId = nextJobId();
    jobs.set(jobId, {
      id: jobId,
      shop: shopContext.shop || null,
      status: 'running',
      productId,
      changedCount: 0,
      errorCount: 0,
      snapshots: changed.map(c => ({ variantId: c.variantId, beforePrice: c.beforePrice, afterPrice: c.afterPrice })),
      errors: []
    });

    for (const row of changed) {
      try {
        await updateVariantPrice(productId, row.variantId, row.afterPrice, shopContext);
        jobs.get(jobId).changedCount += 1;
      } catch (e) {
        jobs.get(jobId).errorCount += 1;
        jobs.get(jobId).errors.push({ variantId: row.variantId, message: String(e) });
      }
    }

    jobs.get(jobId).status = 'completed';
    return res.json({
      jobId,
      status: 'completed',
      changedCount: jobs.get(jobId).changedCount,
      errorCount: jobs.get(jobId).errorCount,
      firstError: jobs.get(jobId).errors?.[0]?.message || null
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'not found' });
  return res.json(job);
});

app.post('/api/jobs/:jobId/undo', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'not found' });

  const shopContext = (() => {
    if (mockMode) return {};
    const shop = normalizeShop(job.shop || getShopFromRequest(req));
    if (!shop) return null;
    const session = getSessionByShop(shop);
    if (!session?.accessToken) return null;
    return { shop, accessToken: session.accessToken };
  })();

  if (!mockMode && !shopContext) {
    return res.status(401).json({ error: 'shop session missing for undo' });
  }

  let restoredCount = 0;
  const errors = [];
  for (const s of job.snapshots || []) {
    try {
      await updateVariantPrice(job.productId, s.variantId, s.beforePrice, shopContext);
      restoredCount += 1;
    } catch (e) {
      errors.push({ variantId: s.variantId, message: String(e) });
    }
  }

  return res.json({ ok: errors.length === 0, restoredCount, errorCount: errors.length, errors });
});

app.listen(port, () => {
  console.log(`kando1-bulk-pricing api listening on :${port}`);
});
