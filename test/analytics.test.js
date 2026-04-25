import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from '../src/analytics.js';
import { listCriticalEvents } from '../src/db/events-repo.js';
import { createTempDb } from './helpers.js';

test('analytics sends all events to GA4 but stores only critical events in SQLite', async () => {
  const db = await createTempDb();
  const previousMeasurementId = process.env.GA4_MEASUREMENT_ID;
  const previousApiSecret = process.env.GA4_API_SECRET;
  const calls = [];

  process.env.GA4_MEASUREMENT_ID = 'G-TEST';
  process.env.GA4_API_SECRET = 'secret';

  try {
    const analytics = createAnalytics({
      now: () => 123,
      fetchImpl: async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return { ok: true, status: 204 };
      }
    });

    await analytics.track('simulate_run', {
      shop: 'alpha-shop.myshopify.com',
      payload: { affected_variants: 4 }
    });
    await analytics.track('apply_succeeded', {
      shop: 'alpha-shop.myshopify.com',
      payload: { jobId: 'job_000001', changed_count: 4, error_count: 0 }
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.events[0].name, 'simulate_run');
    assert.equal(calls[1].body.events[0].name, 'apply_succeeded');
    const storedEvents = listCriticalEvents({ shop: 'alpha-shop.myshopify.com' });
    assert.deepStrictEqual(storedEvents, [
      {
        id: storedEvents[0].id,
        shop: 'alpha-shop.myshopify.com',
        name: 'apply_succeeded',
        payload: { jobId: 'job_000001', changed_count: 4, error_count: 0 },
        createdAt: 123
      }
    ]);
  } finally {
    if (previousMeasurementId === undefined) delete process.env.GA4_MEASUREMENT_ID;
    else process.env.GA4_MEASUREMENT_ID = previousMeasurementId;
    if (previousApiSecret === undefined) delete process.env.GA4_API_SECRET;
    else process.env.GA4_API_SECRET = previousApiSecret;
    await db.cleanup();
  }
});
