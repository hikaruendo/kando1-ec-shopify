import crypto from 'node:crypto';
import { getDb } from './index.js';

function parsePayload(payloadJson) {
  if (!payloadJson) return {};
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    shop: row.shop,
    name: row.name,
    payload: parsePayload(row.payload_json),
    createdAt: Number(row.created_at)
  };
}

export function recordCriticalEvent({
  id = crypto.randomUUID(),
  shop,
  name,
  payload = {},
  createdAt = Date.now()
}) {
  if (!shop) return null;
  const db = getDb();
  db.prepare(`
    INSERT INTO events (
      id,
      shop,
      name,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    shop,
    name,
    JSON.stringify(payload || {}),
    Number(createdAt)
  );
  return id;
}

export function listCriticalEvents({ shop = null, name = null } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];
  if (shop) {
    clauses.push('shop = ?');
    params.push(shop);
  }
  if (name) {
    clauses.push('name = ?');
    params.push(name);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`
    SELECT
      id,
      shop,
      name,
      payload_json,
      created_at
    FROM events
    ${where}
    ORDER BY created_at DESC, id DESC
  `).all(...params).map(mapEventRow);
}

export function getDistinctShopsByEventName(name) {
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT shop
    FROM events
    WHERE name = ?
    ORDER BY shop ASC
  `).all(name).map(row => row.shop);
}

export function countCriticalEvents({ shop, name, since = null } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];
  if (shop) {
    clauses.push('shop = ?');
    params.push(shop);
  }
  if (name) {
    clauses.push('name = ?');
    params.push(name);
  }
  if (since != null) {
    clauses.push('created_at >= ?');
    params.push(Number(since));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = db.prepare(`SELECT COUNT(*) AS count FROM events ${where}`).get(...params);
  return Number(row?.count || 0);
}

export function deleteCriticalEventsByShop(shop) {
  if (!shop) return;
  const db = getDb();
  db.prepare('DELETE FROM events WHERE shop = ?').run(shop);
}
