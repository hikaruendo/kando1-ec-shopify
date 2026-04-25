import crypto from 'node:crypto';
import { recordCriticalEvent } from './db/events-repo.js';

export const CRITICAL_EVENT_NAMES = new Set([
  'apply_succeeded',
  'undo_succeeded',
  'paywall_shown',
  'paywall_clicked_upgrade'
]);

function isPrimitive(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function sanitizeGa4Params(shop, payload = {}) {
  const params = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (isPrimitive(value)) {
      params[key] = value;
    } else if (value !== undefined) {
      params[key] = JSON.stringify(value);
    }
  }
  if (shop) params.shop = shop;
  return params;
}

function buildClientId(shop) {
  const raw = shop || 'anonymous-shop';
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return `${hash.slice(0, 10)}.${hash.slice(10, 20)}`;
}

export function createAnalytics({
  logger = console,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  async function sendToGa4({ shop, name, payload }) {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;
    if (!measurementId || !apiSecret || typeof fetchImpl !== 'function') return;

    const endpoint = new URL('https://www.google-analytics.com/mp/collect');
    endpoint.searchParams.set('measurement_id', measurementId);
    endpoint.searchParams.set('api_secret', apiSecret);

    const response = await fetchImpl(endpoint.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: buildClientId(shop),
        user_id: shop || undefined,
        events: [
          {
            name,
            params: sanitizeGa4Params(shop, payload)
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`GA4 event rejected: ${response.status}`);
    }
  }

  async function track(name, { shop = null, payload = {} } = {}) {
    const createdAt = Number(now());
    if (CRITICAL_EVENT_NAMES.has(name)) {
      recordCriticalEvent({ shop, name, payload, createdAt });
    }
    await sendToGa4({ shop, name, payload });
  }

  async function trackSafe(name, options = {}) {
    try {
      await track(name, options);
    } catch (error) {
      logger?.warn?.('[analytics]', JSON.stringify({
        name,
        shop: options?.shop || null,
        error: String(error.message || error)
      }));
    }
  }

  return { track, trackSafe };
}
