import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { simulate } from './rules.js';
import { fetchVariantsByProductId, updateVariantPrice } from './shopifyClient.js';
import { consumeOauthState, nextJobId, saveOauthState } from './store.js';
import { createAnalytics } from './analytics.js';
import { getCurrentPlan } from './billing.js';
import { deleteCriticalEventsByShop } from './db/events-repo.js';
import { deleteJobsByShop, createJob, completeJob, getJobWithSnapshots, incrementJobProgress } from './db/jobs-repo.js';
import { initializeDb } from './db/index.js';
import { deleteShopSessionsByShop, getShopSession, saveShopSession } from './db/sessions-repo.js';
import { deleteUsageByShop } from './db/usage-repo.js';
import { evaluateUsageLimit, getRemaining, getUsage, incrementUsage } from './usage.js';
import {
  buildInstallUrl,
  getBearerToken,
  normalizeShop,
  randomState,
  verifyHmac,
  verifySessionToken,
  verifyWebhookHmac
} from './shopifyAuth.js';

let indexHtmlCache = null;

function readConfig() {
  const {
    PORT = 8787,
    APP_URL,
    MOCK_MODE = 'true',
    SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET,
    SHOPIFY_SCOPES = 'read_products,write_products',
    SHOPIFY_SHOP_DOMAIN,
    SHOPIFY_ADMIN_ACCESS_TOKEN,
    SHOPIFY_APP_HANDLE = 'bulk-update-products'
  } = process.env;

  const port = Number(PORT);
  const appBaseUrl = APP_URL || `http://localhost:${port}`;

  return {
    port,
    appBaseUrl,
    redirectUri: new URL('/auth/callback', appBaseUrl).toString(),
    mockMode: MOCK_MODE === 'true',
    SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET,
    SHOPIFY_SCOPES,
    SHOPIFY_SHOP_DOMAIN,
    SHOPIFY_ADMIN_ACCESS_TOKEN,
    SHOPIFY_APP_HANDLE
  };
}

export function getRuntimeConfig() {
  const config = readConfig();
  return {
    port: config.port,
    mockMode: config.mockMode,
    appBaseUrl: config.appBaseUrl
  };
}

function getShopFromRequest(req) {
  return (
    req.body?.shop
    || req.query?.shop
    || req.get('x-shopify-shop-domain')
    || ''
  );
}

export async function createApp({ logger = console, sqlitePath, analytics = null } = {}) {
  if (sqlitePath) {
    process.env.SQLITE_PATH = sqlitePath;
  }

  const config = readConfig();
  await initializeDb(process.env.SQLITE_PATH);
  const eventTracker = analytics || createAnalytics({ logger });
  const firstAppLoadShops = new Set();

  function getSessionByShop(shop) {
    const envShop = normalizeShop(config.SHOPIFY_SHOP_DOMAIN);
    if (envShop && shop === envShop && config.SHOPIFY_ADMIN_ACCESS_TOKEN) {
      return { accessToken: config.SHOPIFY_ADMIN_ACCESS_TOKEN, source: 'env' };
    }

    const session = getShopSession(shop);
    if (!session?.accessToken) return null;
    return { accessToken: session.accessToken, source: session.source || 'oauth' };
  }

  async function exchangeSessionTokenForOfflineAccessToken(shop, sessionToken) {
    const body = new URLSearchParams({
      client_id: String(config.SHOPIFY_API_KEY || ''),
      client_secret: String(config.SHOPIFY_API_SECRET || ''),
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token'
    });

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body
    });
    const tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.access_token) {
      throw new Error(`token exchange failed: ${JSON.stringify(tokenBody)}`);
    }

    saveShopSession(shop, {
      shop,
      accessToken: tokenBody.access_token,
      scope: tokenBody.scope || config.SHOPIFY_SCOPES,
      source: 'token-exchange-offline'
    });
    return getSessionByShop(shop);
  }

  function resolveEmbeddedSession(req) {
    const sessionToken = getBearerToken(req.get('authorization'));
    if (!sessionToken) return null;
    const verified = verifySessionToken(sessionToken, {
      apiKey: config.SHOPIFY_API_KEY,
      apiSecret: config.SHOPIFY_API_SECRET
    });
    return { ...verified, sessionToken };
  }

  async function resolveShopContext(req) {
    if (config.mockMode) return {};

    try {
      const embeddedSession = resolveEmbeddedSession(req);
      if (embeddedSession?.shop) {
        const session = getSessionByShop(embeddedSession.shop)
          || await exchangeSessionTokenForOfflineAccessToken(embeddedSession.shop, embeddedSession.sessionToken);
        return {
          shop: embeddedSession.shop,
          accessToken: session.accessToken,
          source: session.source || 'session-token'
        };
      }
    } catch (error) {
      return { error: { status: 401, body: { error: String(error.message || error) } } };
    }

    const fallbackShop = normalizeShop(config.SHOPIFY_SHOP_DOMAIN);
    const shop = normalizeShop(getShopFromRequest(req) || fallbackShop);
    if (!shop) {
      return { error: { status: 400, body: { error: 'shop is required (example: your-store.myshopify.com)' } } };
    }

    const session = getSessionByShop(shop);
    if (!session?.accessToken) {
      return {
        error: {
          status: 401,
          body: { error: 'shop is not connected yet', authUrl: `/auth?shop=${encodeURIComponent(shop)}` }
        }
      };
    }

    return { shop, accessToken: session.accessToken, source: session.source };
  }

  function assertAuthConfig() {
    if (config.mockMode) return null;
    if (config.SHOPIFY_API_KEY && config.SHOPIFY_API_SECRET) return null;
    return 'SHOPIFY_API_KEY and SHOPIFY_API_SECRET are required when MOCK_MODE=false';
  }

  async function renderIndexHtml() {
    if (!indexHtmlCache) {
      indexHtmlCache = await readFile(path.resolve('public/index.html'), 'utf8');
    }
    return indexHtmlCache.replace('__SHOPIFY_API_KEY__', String(config.SHOPIFY_API_KEY || ''));
  }

  function cleanupShopData(shop) {
    if (!shop) return;
    deleteJobsByShop(shop);
    deleteShopSessionsByShop(shop);
    deleteCriticalEventsByShop(shop);
    deleteUsageByShop(shop);
  }

  function getEventShop(req, shopContext = {}) {
    return normalizeShop(shopContext.shop || getShopFromRequest(req) || config.SHOPIFY_SHOP_DOMAIN);
  }

  async function trackEvent(name, { shop, payload = {} } = {}) {
    await eventTracker.trackSafe(name, { shop: normalizeShop(shop), payload });
  }

  async function resolveJobRequest(req) {
    const job = getJobWithSnapshots(req.params.jobId);
    if (!job) return { error: { status: 404, body: { error: 'not found' } } };

    if (config.mockMode) {
      const requestedShop = normalizeShop(getShopFromRequest(req));
      if (requestedShop && job.shop && requestedShop !== job.shop) {
        return { error: { status: 404, body: { error: 'not found' } } };
      }
      return { job, shopContext: requestedShop ? { shop: requestedShop } : {} };
    }

    const shopContext = await resolveShopContext(req);
    if (shopContext.error) return { error: shopContext.error };
    if (job.shop && shopContext.shop !== job.shop) {
      return { error: { status: 404, body: { error: 'not found' } } };
    }
    return { job, shopContext };
  }

  async function attachBillingContext(req, res, next) {
    try {
      const shopContext = await resolveShopContext(req);
      if (shopContext.error) return res.status(shopContext.error.status).json(shopContext.error.body);
      req.shopContext = shopContext;
      req.currentPlan = await getCurrentPlan(shopContext.shop || getShopFromRequest(req), {
        accessToken: shopContext.accessToken,
        logger
      });
      return next();
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  }

  const app = express();

  app.post('/webhooks', express.raw({ type: '*/*' }), (req, res) => {
    const authError = assertAuthConfig();
    if (authError) return res.status(500).json({ error: authError });

    if (!verifyWebhookHmac(req.body, req.get('x-shopify-hmac-sha256'), config.SHOPIFY_API_SECRET)) {
      return res.status(401).send('Invalid webhook signature');
    }

    let payload = {};
    try {
      payload = JSON.parse(Buffer.from(req.body).toString('utf8'));
    } catch {
      return res.status(400).send('Invalid webhook payload');
    }

    const topic = String(req.get('x-shopify-topic') || '');
    const headerShop = normalizeShop(req.get('x-shopify-shop-domain'));
    const payloadShop = normalizeShop(payload.shop_domain);
    const shop = headerShop || payloadShop || '';

    if (topic === 'app/uninstalled' || topic === 'shop/redact') {
      cleanupShopData(shop);
    }

    if (topic === 'app/uninstalled') {
      trackEvent('app_uninstalled', { shop, payload: { topic } });
    }

    logger?.log?.('[webhook]', JSON.stringify({ topic, shop }));
    return res.status(200).json({ ok: true });
  });

  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const shop = normalizeShop(getShopFromRequest(req));
    if (shop) {
      res.set('Content-Security-Policy', `frame-ancestors https://${shop} https://admin.shopify.com;`);
    }
    next();
  });
  app.use(express.static('public', { index: false }));

  app.get('/health', (_req, res) => res.json({ ok: true, mockMode: config.mockMode, appBaseUrl: config.appBaseUrl }));

  app.get('/', (req, res) => {
    return (async () => {
      const authError = assertAuthConfig();
      if (authError) return res.status(500).send(authError);

      const shop = normalizeShop(req.query.shop || req.get('x-shopify-shop-domain'));
      if (shop && !firstAppLoadShops.has(shop)) {
        firstAppLoadShops.add(shop);
        trackEvent('first_app_load', {
          shop,
          payload: {
            locale: String(req.query.locale || req.get('accept-language') || '').slice(0, 32)
          }
        });
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
      apiKey: config.SHOPIFY_API_KEY,
      scopes: config.SHOPIFY_SCOPES,
      redirectUri: config.redirectUri,
      state
    });

    return res.redirect(installUrl);
  });

  app.get('/auth/callback', async (req, res) => {
    try {
      const authError = assertAuthConfig();
      if (authError) return res.status(500).json({ error: authError });
      if (!verifyHmac(req.query, config.SHOPIFY_API_SECRET)) {
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
          client_id: config.SHOPIFY_API_KEY,
          client_secret: config.SHOPIFY_API_SECRET,
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
        scope: tokenBody.scope || config.SHOPIFY_SCOPES,
        source: 'oauth'
      });
      await trackEvent('app_installed', {
        shop,
        payload: { installed_at: Date.now() }
      });

      const redirect = new URL('/', config.appBaseUrl);
      redirect.searchParams.set('shop', shop);
      if (req.query.host) redirect.searchParams.set('host', String(req.query.host));
      redirect.searchParams.set('installed', '1');
      return res.redirect(redirect.toString());
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.get('/api/auth/status', async (req, res) => {
    try {
      const embeddedContext = await resolveShopContext(req);
      if (!embeddedContext.error) {
        return res.json({
          shop: embeddedContext.shop,
          connected: true,
          source: embeddedContext.source || 'session-token'
        });
      }

      const shop = normalizeShop(req.query.shop);
      if (!shop) return res.status(400).json({ error: 'shop required' });
      const session = getSessionByShop(shop);
      return res.json({ shop, connected: Boolean(session?.accessToken), source: session?.source || null });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.get('/billing/upgrade', (req, res) => {
    const shop = normalizeShop(req.query.shop || config.SHOPIFY_SHOP_DOMAIN);
    if (!shop) return res.status(400).json({ error: 'shop is required' });
    if (!config.SHOPIFY_APP_HANDLE) return res.status(500).json({ error: 'SHOPIFY_APP_HANDLE is required' });

    const storeHandle = shop.replace(/\.myshopify\.com$/i, '');
    return res.redirect(`https://admin.shopify.com/store/${storeHandle}/charges/${config.SHOPIFY_APP_HANDLE}/pricing_plans`);
  });

  app.post('/api/simulate', async (req, res) => {
    try {
      const { productId, rules = [] } = req.body || {};
      if (!productId) return res.status(400).json({ error: 'productId required' });
      const shopContext = await resolveShopContext(req);
      if (shopContext.error) return res.status(shopContext.error.status).json(shopContext.error.body);

      const variants = await fetchVariantsByProductId(productId, shopContext);
      const out = simulate(variants, rules);
      const eventShop = getEventShop(req, shopContext);
      const currentPlan = await getCurrentPlan(eventShop, {
        accessToken: shopContext.accessToken,
        logger
      });
      if (eventShop) {
        out.usage = getRemaining(eventShop, currentPlan, {
          affectedVariants: out.summary.changedVariants
        });
      }
      await trackEvent('simulate_run', {
        shop: eventShop,
        payload: { affected_variants: out.summary.changedVariants }
      });
      return res.json(out);
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.post('/api/apply', attachBillingContext, async (req, res) => {
    let jobId = null;
    try {
      const { productId, rules = [] } = req.body || {};
      if (!productId) return res.status(400).json({ error: 'productId required' });

      const shopContext = req.shopContext;

      const variants = await fetchVariantsByProductId(productId, shopContext);
      const sim = simulate(variants, rules);
      const changed = sim.diffs.filter(d => d.changed);
      const eventShop = getEventShop(req, shopContext);
      const usage = eventShop ? getUsage(eventShop) : { completedTasks: 0 };
      const usageLimit = evaluateUsageLimit({
        plan: req.currentPlan,
        affectedVariants: changed.length,
        monthlyCompletedTasks: usage.completedTasks
      });
      if (!usageLimit.allowed) {
        const usageInfo = getRemaining(eventShop, req.currentPlan, {
          affectedVariants: changed.length
        });
        return res.status(402).json({
          error: 'paywall',
          usage: usageInfo,
          paywall: usageInfo.paywall
        });
      }
      await trackEvent('apply_started', {
        shop: eventShop,
        payload: { affected_variants: changed.length }
      });

      jobId = nextJobId();
      const jobShop = config.mockMode
        ? normalizeShop(getShopFromRequest(req))
        : (shopContext.shop || null);

      createJob({
        id: jobId,
        shop: jobShop,
        productId,
        status: 'running',
        affectedVariants: changed.length,
        snapshots: changed.map(diff => ({
          variantId: diff.variantId,
          beforePrice: diff.beforePrice,
          afterPrice: diff.afterPrice
        }))
      });

      for (const row of changed) {
        try {
          await updateVariantPrice(productId, row.variantId, row.afterPrice, shopContext);
          incrementJobProgress({ jobId, changedDelta: 1 });
        } catch (e) {
          incrementJobProgress({
            jobId,
            error: { variantId: row.variantId, message: String(e) }
          });
        }
      }

      completeJob({ jobId, status: 'completed' });
      const job = getJobWithSnapshots(jobId);
      if (jobShop || eventShop) {
        incrementUsage(jobShop || eventShop, job.changedCount);
      }
      await trackEvent('apply_succeeded', {
        shop: jobShop || eventShop,
        payload: {
          jobId,
          changed_count: job.changedCount,
          error_count: job.errorCount,
          affected_variants: changed.length
        }
      });
      return res.json({
        jobId,
        status: 'completed',
        changedCount: job.changedCount,
        errorCount: job.errorCount,
        firstError: job.errors?.[0]?.message || null
      });
    } catch (e) {
      if (jobId) {
        try {
          completeJob({ jobId, status: 'failed' });
        } catch {
          // Ignore secondary persistence errors while handling the original failure.
        }
      }
      await trackEvent('apply_failed', {
        shop: normalizeShop(getShopFromRequest(req) || config.SHOPIFY_SHOP_DOMAIN),
        payload: { reason: String(e.message || e).slice(0, 240) }
      });
      return res.status(500).json({ error: String(e) });
    }
  });

  app.get('/api/jobs/:jobId', async (req, res) => {
    const resolved = await resolveJobRequest(req);
    if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);
    return res.json(resolved.job);
  });

  app.post('/api/jobs/:jobId/undo', async (req, res) => {
    const resolved = await resolveJobRequest(req);
    if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);

    const { job, shopContext } = resolved;
    let restoredCount = 0;
    const errors = [];

    for (const snapshot of job.snapshots || []) {
      try {
        await updateVariantPrice(job.productId, snapshot.variantId, snapshot.beforePrice, shopContext);
        restoredCount += 1;
      } catch (e) {
        errors.push({ variantId: snapshot.variantId, message: String(e) });
      }
    }

    await trackEvent('undo_succeeded', {
      shop: job.shop || getEventShop(req, shopContext),
      payload: { jobId: job.id, restored_count: restoredCount, error_count: errors.length }
    });
    return res.json({ ok: errors.length === 0, restoredCount, errorCount: errors.length, errors });
  });

  app.post('/api/events', async (req, res) => {
    const allowedEvents = new Set(['paywall_shown', 'paywall_clicked_upgrade']);
    const { name, payload = {} } = req.body || {};
    if (!allowedEvents.has(name)) {
      return res.status(400).json({ error: 'unsupported event' });
    }

    const shopContext = await resolveShopContext(req);
    if (shopContext.error) return res.status(shopContext.error.status).json(shopContext.error.body);
    await trackEvent(name, {
      shop: getEventShop(req, shopContext),
      payload
    });
    return res.json({ ok: true });
  });

  return app;
}
