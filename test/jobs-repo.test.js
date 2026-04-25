import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeJob,
  createJob,
  deleteJobsByShop,
  getJobWithSnapshots,
  incrementJobProgress
} from '../src/db/jobs-repo.js';
import { createTempDb } from './helpers.js';

test('jobs repo persists progress, snapshots, and shop-scoped deletion', async () => {
  const db = await createTempDb();
  try {
    createJob({
      id: 'job_000001',
      shop: 'alpha-shop.myshopify.com',
      productId: 'gid://shopify/Product/123',
      affectedVariants: 2,
      snapshots: [
        { variantId: 'v2', beforePrice: 1300, afterPrice: 1400 },
        { variantId: 'v4', beforePrice: 1300, afterPrice: 1400 }
      ]
    });

    incrementJobProgress({ jobId: 'job_000001', changedDelta: 1 });
    incrementJobProgress({
      jobId: 'job_000001',
      error: { variantId: 'v4', message: 'temporary failure' }
    });
    completeJob({ jobId: 'job_000001' });

    assert.deepStrictEqual(getJobWithSnapshots('job_000001'), {
      id: 'job_000001',
      shop: 'alpha-shop.myshopify.com',
      status: 'completed',
      productId: 'gid://shopify/Product/123',
      changedCount: 1,
      errorCount: 1,
      snapshots: [
        { variantId: 'v2', beforePrice: '1300', afterPrice: '1400' },
        { variantId: 'v4', beforePrice: '1300', afterPrice: '1400' }
      ],
      errors: [{ variantId: 'v4', message: 'temporary failure' }]
    });

    deleteJobsByShop('alpha-shop.myshopify.com');
    assert.equal(getJobWithSnapshots('job_000001'), null);
  } finally {
    await db.cleanup();
  }
});
