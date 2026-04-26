import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCriticalEvent } from '../src/db/events-repo.js';
import { shouldPromptForReview } from '../src/review-prompts.js';
import { createTempDb } from './helpers.js';

test('review prompt triggers on second successful apply only', async () => {
  const db = await createTempDb();
  try {
    const shop = 'alpha-shop.myshopify.com';
    assert.equal(shouldPromptForReview(shop, 'apply_succeeded', { now: () => 1000 }), false);

    recordCriticalEvent({ id: 'event-1', shop, name: 'apply_succeeded', createdAt: 100 });
    assert.equal(shouldPromptForReview(shop, 'apply_succeeded', { now: () => 1000 }), false);

    recordCriticalEvent({ id: 'event-2', shop, name: 'apply_succeeded', createdAt: 200 });
    assert.equal(shouldPromptForReview(shop, 'apply_succeeded', { now: () => 1000 }), true);

    recordCriticalEvent({ id: 'event-3', shop, name: 'apply_succeeded', createdAt: 300 });
    assert.equal(shouldPromptForReview(shop, 'apply_succeeded', { now: () => 1000 }), false);
  } finally {
    await db.cleanup();
  }
});

test('review prompt triggers on undo but respects 30 day cooldown', async () => {
  const db = await createTempDb();
  try {
    const shop = 'alpha-shop.myshopify.com';
    const now = 31 * 24 * 60 * 60 * 1000;
    assert.equal(shouldPromptForReview(shop, 'undo_succeeded', { now: () => now }), true);

    recordCriticalEvent({
      id: 'event-1',
      shop,
      name: 'review_prompt_shown',
      createdAt: now - 29 * 24 * 60 * 60 * 1000
    });
    assert.equal(shouldPromptForReview(shop, 'undo_succeeded', { now: () => now }), false);
    assert.equal(shouldPromptForReview(shop, 'apply_failed', { now: () => now }), false);
  } finally {
    await db.cleanup();
  }
});
