import { getShopSession } from './db/sessions-repo.js';
import { normalizeShop } from './shopifyAuth.js';

const CACHE_TTL_MS = 60_000;
const planCache = new Map();

const CURRENT_APP_SUBSCRIPTIONS_QUERY = `
  query GetCurrentAppSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
      }
    }
  }
`;

function readBillingConfig() {
  return {
    mockMode: process.env.MOCK_MODE === 'true',
    mockCurrentPlan: process.env.MOCK_CURRENT_PLAN || 'free_preview',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-01',
    envShop: normalizeShop(process.env.SHOPIFY_SHOP_DOMAIN),
    envAccessToken: String(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim()
  };
}

function normalizePlanName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return 'free_preview';
  if (normalized.includes('founding')) return 'founding_10';
  if (normalized.includes('standard')) return 'standard';
  if (normalized.includes('pro')) return 'pro';
  if (normalized.includes('scale')) return 'scale';
  return 'standard';
}

function resolveSession(shop, accessToken = null) {
  const config = readBillingConfig();
  const normalizedShop = normalizeShop(shop);
  if (!normalizedShop) return null;
  if (accessToken) return { shop: normalizedShop, accessToken };
  if (config.envShop === normalizedShop && config.envAccessToken) {
    return { shop: normalizedShop, accessToken: config.envAccessToken };
  }
  const session = getShopSession(normalizedShop);
  if (!session?.accessToken) return null;
  return { shop: normalizedShop, accessToken: session.accessToken };
}

function getCachedPlan(shop, now) {
  const cached = planCache.get(shop);
  if (!cached || cached.expiresAt <= now) return null;
  return cached.plan;
}

function setCachedPlan(shop, plan, now) {
  planCache.set(shop, {
    plan,
    expiresAt: now + CACHE_TTL_MS
  });
}

export async function getCurrentPlan(shop, {
  accessToken = null,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = Date.now
} = {}) {
  const config = readBillingConfig();
  const normalizedShop = normalizeShop(shop);
  if (config.mockMode) return config.mockCurrentPlan;
  if (!normalizedShop) return 'free_preview';

  const currentTime = Number(now());
  const cachedPlan = getCachedPlan(normalizedShop, currentTime);
  if (cachedPlan) return cachedPlan;

  try {
    const session = resolveSession(normalizedShop, accessToken);
    if (!session?.accessToken || typeof fetchImpl !== 'function') {
      setCachedPlan(normalizedShop, 'free_preview', currentTime);
      return 'free_preview';
    }

    const response = await fetchImpl(`https://${normalizedShop}/admin/api/${config.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': session.accessToken
      },
      body: JSON.stringify({ query: CURRENT_APP_SUBSCRIPTIONS_QUERY })
    });

    if (!response.ok) throw new Error(`Shopify billing query failed: ${response.status}`);
    const json = await response.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));

    const activeSubscription = (json.data?.currentAppInstallation?.activeSubscriptions || [])
      .find(subscription => subscription?.status === 'ACTIVE');
    const plan = activeSubscription ? normalizePlanName(activeSubscription.name) : 'free_preview';
    setCachedPlan(normalizedShop, plan, currentTime);
    return plan;
  } catch (error) {
    logger?.warn?.('[billing]', JSON.stringify({
      shop: normalizedShop,
      error: String(error.message || error)
    }));
    setCachedPlan(normalizedShop, 'free_preview', currentTime);
    return 'free_preview';
  }
}

export async function hasActiveSubscription(shop, options = {}) {
  const plan = await getCurrentPlan(shop, options);
  return plan !== 'free_preview';
}

export function clearBillingCache() {
  planCache.clear();
}
