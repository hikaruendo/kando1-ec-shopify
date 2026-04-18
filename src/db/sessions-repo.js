import { getDb } from './index.js';

function mapSessionRow(row) {
  if (!row) return null;
  return {
    shop: row.shop,
    accessToken: row.access_token,
    scope: row.scope,
    source: row.source,
    updatedAt: Number(row.updated_at || 0)
  };
}

export function saveShopSession(shop, session) {
  const db = getDb();
  const updatedAt = Number(session.updatedAt || Date.now());

  db.prepare(`
    INSERT INTO shop_sessions (
      shop,
      access_token,
      scope,
      source,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (shop) DO UPDATE SET
      access_token = excluded.access_token,
      scope = excluded.scope,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(
    shop,
    String(session.accessToken || ''),
    session.scope ? String(session.scope) : null,
    session.source ? String(session.source) : null,
    updatedAt
  );
}

export function getShopSession(shop) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      shop,
      access_token,
      scope,
      source,
      updated_at
    FROM shop_sessions
    WHERE shop = ?
  `).get(shop);
  return mapSessionRow(row);
}

export function deleteShopSession(shop) {
  if (!shop) return;
  const db = getDb();
  db.prepare('DELETE FROM shop_sessions WHERE shop = ?').run(shop);
}

export function deleteShopSessionsByShop(shop) {
  deleteShopSession(shop);
}
