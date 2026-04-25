import test from 'node:test';
import assert from 'node:assert/strict';
import { clearBillingCache, getCurrentPlan, hasActiveSubscription } from '../src/billing.js';
import { saveShopSession } from '../src/db/sessions-repo.js';
import { createTempDb } from './helpers.js';

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function captureEnv(keys) {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]));
}

test('billing returns mock current plan in mock mode', async () => {
  const previous = captureEnv(['MOCK_MODE', 'MOCK_CURRENT_PLAN']);
  try {
    clearBillingCache();
    process.env.MOCK_MODE = 'true';
    process.env.MOCK_CURRENT_PLAN = 'standard';

    assert.equal(await getCurrentPlan('alpha-shop.myshopify.com'), 'standard');
    assert.equal(await hasActiveSubscription('alpha-shop.myshopify.com'), true);
  } finally {
    restoreEnv(previous);
    clearBillingCache();
  }
});

test('billing resolves active subscription and caches result for 60 seconds', async () => {
  const db = await createTempDb();
  const previous = captureEnv(['MOCK_MODE', 'SHOPIFY_API_VERSION']);
  const calls = [];
  try {
    clearBillingCache();
    process.env.MOCK_MODE = 'false';
    process.env.SHOPIFY_API_VERSION = '2026-04';
    saveShopSession('alpha-shop.myshopify.com', {
      accessToken: 'offline-token',
      scope: 'read_products,write_products',
      source: 'oauth'
    });

    const fetchImpl = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), token: options.headers['X-Shopify-Access-Token'] });
      return {
        ok: true,
        json: async () => ({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [
                { id: 'gid://shopify/AppSubscription/1', name: 'Standard', status: 'ACTIVE', test: true }
              ]
            }
          }
        })
      };
    };

    assert.equal(await getCurrentPlan('alpha-shop.myshopify.com', { fetchImpl, now: () => 100 }), 'standard');
    assert.equal(await getCurrentPlan('alpha-shop.myshopify.com', { fetchImpl, now: () => 59_999 }), 'standard');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://alpha-shop.myshopify.com/admin/api/2026-04/graphql.json');
    assert.equal(calls[0].token, 'offline-token');
    assert.match(calls[0].body.query, /currentAppInstallation/);
    assert.match(calls[0].body.query, /activeSubscriptions/);
  } finally {
    restoreEnv(previous);
    clearBillingCache();
    await db.cleanup();
  }
});

test('billing gracefully degrades to free preview when Shopify lookup fails', async () => {
  const db = await createTempDb();
  const previous = captureEnv(['MOCK_MODE']);
  const warnings = [];
  try {
    clearBillingCache();
    process.env.MOCK_MODE = 'false';
    saveShopSession('alpha-shop.myshopify.com', {
      accessToken: 'offline-token',
      scope: 'read_products,write_products',
      source: 'oauth'
    });

    const plan = await getCurrentPlan('alpha-shop.myshopify.com', {
      fetchImpl: async () => ({ ok: false, status: 500 }),
      logger: { warn: (...args) => warnings.push(args.join(' ')) }
    });

    assert.equal(plan, 'free_preview');
    assert.equal(await hasActiveSubscription('alpha-shop.myshopify.com', {
      fetchImpl: async () => {
        throw new Error('should be cached');
      }
    }), false);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].includes('alpha-shop.myshopify.com'), true);
  } finally {
    restoreEnv(previous);
    clearBillingCache();
    await db.cleanup();
  }
});
