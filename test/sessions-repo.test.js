import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteShopSession,
  getShopSession,
  saveShopSession
} from '../src/db/sessions-repo.js';
import { createTempDb } from './helpers.js';

test('sessions repo upserts and deletes shop sessions', async () => {
  const db = await createTempDb();
  try {
    saveShopSession('alpha-shop.myshopify.com', {
      accessToken: 'token-1',
      scope: 'read_products,write_products',
      source: 'oauth',
      updatedAt: 100
    });

    saveShopSession('alpha-shop.myshopify.com', {
      accessToken: 'token-2',
      scope: 'read_products,write_products',
      source: 'token-exchange-offline',
      updatedAt: 200
    });

    assert.deepStrictEqual(getShopSession('alpha-shop.myshopify.com'), {
      shop: 'alpha-shop.myshopify.com',
      accessToken: 'token-2',
      scope: 'read_products,write_products',
      source: 'token-exchange-offline',
      updatedAt: 200
    });

    deleteShopSession('alpha-shop.myshopify.com');
    assert.equal(getShopSession('alpha-shop.myshopify.com'), null);
  } finally {
    await db.cleanup();
  }
});
