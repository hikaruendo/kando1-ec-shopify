import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteUsageByShop, getMonthlyUsage, incrementMonthlyUsage } from '../src/db/usage-repo.js';
import {
  evaluateUsageLimit,
  getRemaining,
  getUsage,
  getYearMonth,
  incrementUsage
} from '../src/usage.js';
import { createTempDb } from './helpers.js';

test('usage repo increments monthly usage and deletes by shop', async () => {
  const db = await createTempDb();
  try {
    incrementMonthlyUsage({
      shop: 'alpha-shop.myshopify.com',
      yearMonth: '2026-04',
      affectedVariants: 4
    });
    incrementMonthlyUsage({
      shop: 'alpha-shop.myshopify.com',
      yearMonth: '2026-04',
      affectedVariants: 2
    });

    assert.deepStrictEqual(getMonthlyUsage({
      shop: 'alpha-shop.myshopify.com',
      yearMonth: '2026-04'
    }), {
      shop: 'alpha-shop.myshopify.com',
      yearMonth: '2026-04',
      completedTasks: 2,
      affectedVariantsTotal: 6
    });

    deleteUsageByShop('alpha-shop.myshopify.com');
    assert.equal(getMonthlyUsage({
      shop: 'alpha-shop.myshopify.com',
      yearMonth: '2026-04'
    }).completedTasks, 0);
  } finally {
    await db.cleanup();
  }
});

test('usage service resets by UTC month and returns remaining plan capacity', async () => {
  const db = await createTempDb();
  try {
    const april = new Date('2026-04-30T23:59:59.000Z');
    const may = new Date('2026-05-01T00:00:00.000Z');

    assert.equal(getYearMonth(april), '2026-04');
    assert.equal(getYearMonth(may), '2026-05');

    incrementUsage('alpha-shop.myshopify.com', 10, { now: april });
    assert.equal(getUsage('alpha-shop.myshopify.com', { now: april }).completedTasks, 1);
    assert.equal(getUsage('alpha-shop.myshopify.com', { now: may }).completedTasks, 0);
    assert.deepStrictEqual(getRemaining('alpha-shop.myshopify.com', 'free_preview', {
      now: april,
      affectedVariants: 99
    }), {
      currentPlan: 'free_preview',
      planCaps: { variantsPerTask: 100, tasksPerMonth: 3 },
      affectedVariantsInThisPreview: 99,
      monthlyTasksUsed: 1,
      monthlyTasksRemaining: 2,
      affectedVariantsTotalThisMonth: 10
    });
  } finally {
    await db.cleanup();
  }
});

test('usage limit boundary accepts exact cap and rejects cap plus one', () => {
  assert.deepStrictEqual(evaluateUsageLimit({
    plan: 'free_preview',
    affectedVariants: 100,
    monthlyCompletedTasks: 2
  }), { allowed: true, kind: null, cap: null });

  assert.deepStrictEqual(evaluateUsageLimit({
    plan: 'free_preview',
    affectedVariants: 101,
    monthlyCompletedTasks: 2
  }), { allowed: false, kind: 'variants_over_cap', cap: 100 });

  assert.deepStrictEqual(evaluateUsageLimit({
    plan: 'standard',
    affectedVariants: 5000,
    monthlyCompletedTasks: 19
  }), { allowed: true, kind: null, cap: null });

  assert.deepStrictEqual(evaluateUsageLimit({
    plan: 'standard',
    affectedVariants: 5001,
    monthlyCompletedTasks: 19
  }), { allowed: false, kind: 'variants_over_cap', cap: 5000 });

  assert.deepStrictEqual(evaluateUsageLimit({
    plan: 'free_preview',
    affectedVariants: 1,
    monthlyCompletedTasks: 3
  }), { allowed: false, kind: 'tasks_over_cap', cap: 3 });
});
