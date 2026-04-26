import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { closeAllDbs } from '../src/db/index.js';
import { listCriticalEvents, recordCriticalEvent } from '../src/db/events-repo.js';
import { createJob, getJobWithSnapshots } from '../src/db/jobs-repo.js';
import { getShopSession, saveShopSession } from '../src/db/sessions-repo.js';
import { getUsage } from '../src/usage.js';
import { createTempDb, loadCreateApp, signWebhookPayload } from './helpers.js';

test('apply -> restart -> get/undo preserves API shape and shop isolation', async () => {
  const db = await createTempDb();
  try {
    const createApp = await loadCreateApp();
    const app = await createApp({ sqlitePath: db.sqlitePath });

    const applyResponse = await request(app)
      .post('/api/apply')
      .send({
        shop: 'alpha-shop.myshopify.com',
        productId: 'gid://shopify/Product/123',
        rules: [
          {
            priority: 1,
            conditions: [{ field: 'option2', op: 'equals', value: 'Pro' }],
            action: { type: 'add', value: 100 }
          }
        ]
      });

    assert.equal(applyResponse.status, 200);
    assert.deepStrictEqual(applyResponse.body, {
      jobId: 'job_000001',
      status: 'completed',
      changedCount: 3,
      errorCount: 0,
      firstError: null
    });
    assert.equal(getUsage('alpha-shop.myshopify.com').completedTasks, 1);
    assert.equal(getUsage('alpha-shop.myshopify.com').affectedVariantsTotal, 3);
    assert.deepStrictEqual(listCriticalEvents({
      shop: 'alpha-shop.myshopify.com',
      name: 'apply_succeeded'
    }).map(event => ({
      shop: event.shop,
      name: event.name,
      payload: event.payload
    })), [
      {
        shop: 'alpha-shop.myshopify.com',
        name: 'apply_succeeded',
        payload: {
          jobId: 'job_000001',
          changed_count: 3,
          error_count: 0,
          affected_variants: 3
        }
      }
    ]);

    const expectedJob = {
      id: 'job_000001',
      shop: 'alpha-shop.myshopify.com',
      status: 'completed',
      productId: 'gid://shopify/Product/123',
      changedCount: 3,
      errorCount: 0,
      snapshots: [
        { variantId: 'v2', beforePrice: '1300', afterPrice: '1400' },
        { variantId: 'v4', beforePrice: '1300', afterPrice: '1400' },
        { variantId: 'v5', beforePrice: '1000', afterPrice: '1100' }
      ],
      errors: []
    };

    const jobResponse = await request(app)
      .get('/api/jobs/job_000001')
      .query({ shop: 'alpha-shop.myshopify.com' });
    assert.equal(jobResponse.status, 200);
    assert.deepStrictEqual(jobResponse.body, expectedJob);

    closeAllDbs();
    const restartedApp = await createApp({ sqlitePath: db.sqlitePath });

    const restartedJobResponse = await request(restartedApp)
      .get('/api/jobs/job_000001')
      .query({ shop: 'alpha-shop.myshopify.com' });
    assert.equal(restartedJobResponse.status, 200);
    assert.deepStrictEqual(restartedJobResponse.body, expectedJob);

    const isolatedResponse = await request(restartedApp)
      .get('/api/jobs/job_000001')
      .query({ shop: 'beta-shop.myshopify.com' });
    assert.equal(isolatedResponse.status, 404);

    const undoResponse = await request(restartedApp)
      .post('/api/jobs/job_000001/undo')
      .send({ shop: 'alpha-shop.myshopify.com' });
    assert.equal(undoResponse.status, 200);
    assert.deepStrictEqual(undoResponse.body, {
      ok: true,
      restoredCount: 3,
      errorCount: 0,
      errors: []
    });
    assert.equal(listCriticalEvents({
      shop: 'alpha-shop.myshopify.com',
      name: 'undo_succeeded'
    }).length, 1);
  } finally {
    await db.cleanup();
  }
});

test('webhooks reject invalid signatures and clean up persisted shop data without logging payload bodies', async () => {
  const db = await createTempDb();
  const logs = [];
  try {
    const createApp = await loadCreateApp();
    const app = await createApp({
      sqlitePath: db.sqlitePath,
      logger: {
        log: (...args) => logs.push(args.join(' '))
      }
    });

    saveShopSession('alpha-shop.myshopify.com', {
      accessToken: 'token-1',
      scope: 'read_products,write_products',
      source: 'oauth'
    });
    createJob({
      id: 'job_000001',
      shop: 'alpha-shop.myshopify.com',
      productId: 'gid://shopify/Product/123',
      snapshots: [{ variantId: 'v2', beforePrice: 1300, afterPrice: 1400 }]
    });
    recordCriticalEvent({
      id: 'event-1',
      shop: 'alpha-shop.myshopify.com',
      name: 'apply_succeeded',
      payload: { jobId: 'job_000001' }
    });

    const invalid = await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-SHA256', 'invalid')
      .send('{"shop_domain":"alpha-shop.myshopify.com"}');
    assert.equal(invalid.status, 401);

    const redactPayload = JSON.stringify({
      shop_id: 1,
      shop_domain: 'alpha-shop.myshopify.com',
      customer: {
        id: 99,
        email: 'customer@example.com'
      }
    });
    const redact = await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'shop/redact')
      .set('X-Shopify-Hmac-SHA256', signWebhookPayload(redactPayload))
      .send(redactPayload);
    assert.equal(redact.status, 200);
    assert.equal(getShopSession('alpha-shop.myshopify.com'), null);
    assert.equal(getJobWithSnapshots('job_000001'), null);
    assert.equal(getUsage('alpha-shop.myshopify.com').completedTasks, 0);
    assert.deepStrictEqual(listCriticalEvents({ shop: 'alpha-shop.myshopify.com' }), []);
    assert.equal(logs.some(entry => entry.includes('customer@example.com')), false);

    saveShopSession('beta-shop.myshopify.com', {
      accessToken: 'token-2',
      scope: 'read_products,write_products',
      source: 'oauth'
    });
    createJob({
      id: 'job_000002',
      shop: 'beta-shop.myshopify.com',
      productId: 'gid://shopify/Product/123',
      snapshots: [{ variantId: 'v4', beforePrice: 1300, afterPrice: 1400 }]
    });

    const uninstallPayload = JSON.stringify({
      id: 2,
      email: 'merchant@example.com'
    });
    const uninstall = await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'app/uninstalled')
      .set('X-Shopify-Shop-Domain', 'beta-shop.myshopify.com')
      .set('X-Shopify-Hmac-SHA256', signWebhookPayload(uninstallPayload))
      .send(uninstallPayload);
    assert.equal(uninstall.status, 200);
    assert.equal(getShopSession('beta-shop.myshopify.com'), null);
    assert.equal(getJobWithSnapshots('job_000002'), null);
  } finally {
    await db.cleanup();
  }
});

test('simulate response includes upcoming usage without changing existing preview fields', async () => {
  const db = await createTempDb();
  const previousPlan = process.env.MOCK_CURRENT_PLAN;
  try {
    process.env.MOCK_CURRENT_PLAN = 'free_preview';
    const createApp = await loadCreateApp();
    const app = await createApp({ sqlitePath: db.sqlitePath });

    const applyResponse = await request(app)
      .post('/api/apply')
      .send({
        shop: 'alpha-shop.myshopify.com',
        productId: 'gid://shopify/Product/123',
        rules: [
          {
            priority: 1,
            conditions: [{ field: 'option2', op: 'equals', value: 'Pro' }],
            action: { type: 'add', value: 100 }
          }
        ]
      });
    assert.equal(applyResponse.status, 200);

    const simulateResponse = await request(app)
      .post('/api/simulate')
      .send({
        shop: 'alpha-shop.myshopify.com',
        productId: 'gid://shopify/Product/123',
        rules: [
          {
            priority: 1,
            conditions: [{ field: 'option2', op: 'equals', value: 'Pro' }],
            action: { type: 'add', value: 100 }
          }
        ]
      });

    assert.equal(simulateResponse.status, 200);
    assert.equal(simulateResponse.body.summary.totalVariants, 5);
    assert.equal(simulateResponse.body.summary.changedVariants, 3);
    assert.equal(Array.isArray(simulateResponse.body.diffs), true);
    assert.deepStrictEqual(simulateResponse.body.usage, {
      currentPlan: 'free_preview',
      planCaps: { variantsPerTask: 100, tasksPerMonth: 3 },
      affectedVariantsInThisPreview: 3,
      monthlyTasksUsed: 1,
      monthlyTasksRemaining: 2,
      affectedVariantsTotalThisMonth: 3
    });
  } finally {
    if (previousPlan === undefined) delete process.env.MOCK_CURRENT_PLAN;
    else process.env.MOCK_CURRENT_PLAN = previousPlan;
    await db.cleanup();
  }
});

test('paywall event endpoint persists only whitelisted billing events', async () => {
  const db = await createTempDb();
  try {
    const createApp = await loadCreateApp();
    const app = await createApp({ sqlitePath: db.sqlitePath });

    const unsupported = await request(app)
      .post('/api/events')
      .send({
        shop: 'alpha-shop.myshopify.com',
        name: 'simulate_run',
        payload: { affected_variants: 4 }
      });
    assert.equal(unsupported.status, 400);

    const shown = await request(app)
      .post('/api/events')
      .send({
        shop: 'alpha-shop.myshopify.com',
        name: 'paywall_shown',
        payload: { paywall_kind: 'variants_over_cap' }
      });
    assert.equal(shown.status, 200);
    assert.deepStrictEqual(shown.body, { ok: true });
    assert.deepStrictEqual(listCriticalEvents({
      shop: 'alpha-shop.myshopify.com',
      name: 'paywall_shown'
    }).map(event => ({
      shop: event.shop,
      name: event.name,
      payload: event.payload
    })), [
      {
        shop: 'alpha-shop.myshopify.com',
        name: 'paywall_shown',
        payload: { paywall_kind: 'variants_over_cap' }
      }
    ]);
  } finally {
    await db.cleanup();
  }
});
