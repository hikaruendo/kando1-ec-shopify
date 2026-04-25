import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteCriticalEventsByShop,
  getDistinctShopsByEventName,
  listCriticalEvents,
  recordCriticalEvent
} from '../src/db/events-repo.js';
import { createTempDb } from './helpers.js';

test('events repo records critical events and deletes by shop', async () => {
  const db = await createTempDb();
  try {
    recordCriticalEvent({
      id: 'event-1',
      shop: 'alpha-shop.myshopify.com',
      name: 'apply_succeeded',
      payload: { jobId: 'job_000001', changed_count: 3 },
      createdAt: 100
    });
    recordCriticalEvent({
      id: 'event-2',
      shop: 'beta-shop.myshopify.com',
      name: 'apply_succeeded',
      payload: { jobId: 'job_000002', changed_count: 1 },
      createdAt: 200
    });

    assert.deepStrictEqual(listCriticalEvents({
      shop: 'alpha-shop.myshopify.com',
      name: 'apply_succeeded'
    }), [
      {
        id: 'event-1',
        shop: 'alpha-shop.myshopify.com',
        name: 'apply_succeeded',
        payload: { jobId: 'job_000001', changed_count: 3 },
        createdAt: 100
      }
    ]);

    assert.deepStrictEqual(getDistinctShopsByEventName('apply_succeeded'), [
      'alpha-shop.myshopify.com',
      'beta-shop.myshopify.com'
    ]);

    deleteCriticalEventsByShop('alpha-shop.myshopify.com');
    assert.deepStrictEqual(listCriticalEvents({ shop: 'alpha-shop.myshopify.com' }), []);
    assert.equal(listCriticalEvents({ shop: 'beta-shop.myshopify.com' }).length, 1);
  } finally {
    await db.cleanup();
  }
});
