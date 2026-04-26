import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shopify app config registers uninstall and mandatory compliance webhooks', async () => {
  const toml = await readFile('shopify.app.toml', 'utf8');

  assert.match(toml, /\[webhooks\]/);
  assert.match(toml, /api_version\s*=\s*"2026-01"/);
  assert.match(toml, /topics\s*=\s*\["app\/uninstalled"\]/);
  assert.match(toml, /compliance_topics\s*=\s*\["customers\/data_request",\s*"customers\/redact",\s*"shop\/redact"\]/);
  assert.match(toml, /uri\s*=\s*"\/webhooks"/);
  assert.match(toml, /scopes\s*=\s*"read_products,write_products"/);
});
