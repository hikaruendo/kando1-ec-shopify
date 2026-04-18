import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { closeAllDbs, initializeDb } from '../src/db/index.js';

export async function createTempDb() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kando1-'));
  const sqlitePath = path.join(tempDir, 'kando1.db');
  process.env.SQLITE_PATH = sqlitePath;
  await initializeDb(sqlitePath);
  return {
    sqlitePath,
    tempDir,
    async cleanup() {
      closeAllDbs();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

export async function loadCreateApp() {
  process.env.MOCK_MODE = 'true';
  process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-api-key';
  process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-api-secret';
  const module = await import('../src/app.js');
  return module.createApp;
}

export function signWebhookPayload(body, secret = process.env.SHOPIFY_API_SECRET || 'test-api-secret') {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

export function assertJobShape(job, expected) {
  assert.deepStrictEqual(job, expected);
}
