import 'dotenv/config';
import { mockVariants } from './mockData.js';

const {
  MOCK_MODE = 'true',
  SHOPIFY_SHOP_DOMAIN,
  SHOPIFY_ADMIN_ACCESS_TOKEN,
  SHOPIFY_API_VERSION = '2025-01'
} = process.env;

const mockMode = MOCK_MODE === 'true';

function resolveShopAndToken(context = {}) {
  const shop = String(context.shop || SHOPIFY_SHOP_DOMAIN || '').trim();
  const accessToken = String(context.accessToken || SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim();
  if (!shop) throw new Error('shop is required');
  if (!accessToken) throw new Error('access token is required');
  return { shop, accessToken };
}

async function gql(query, variables, context = {}) {
  const { shop, accessToken } = resolveShopAndToken(context);
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`Shopify GraphQL error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function fetchVariantsByProductId(productId, context = {}) {
  if (mockMode) return structuredClone(mockVariants);

  const query = `
    query Variants($id: ID!) {
      product(id: $id) {
        variants(first: 250) {
          nodes {
            id
            title
            price
            selectedOptions { name value }
          }
        }
      }
    }
  `;

  const data = await gql(query, { id: productId }, context);
  const nodes = data?.product?.variants?.nodes || [];
  return nodes.map(n => ({
    id: n.id,
    title: n.title,
    option1: n.selectedOptions?.[0]?.value || '',
    option2: n.selectedOptions?.[1]?.value || '',
    option3: n.selectedOptions?.[2]?.value || '',
    price: Number(n.price || 0)
  }));
}

export async function updateVariantPrice(productId, variantId, price, context = {}) {
  if (mockMode) return { ok: true, mock: true };

  const mutation = `
    mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price }
        userErrors { field message }
      }
    }
  `;

  const data = await gql(
    mutation,
    { productId, variants: [{ id: variantId, price: String(price) }] },
    context
  );
  const errs = data?.productVariantsBulkUpdate?.userErrors || [];
  if (errs.length) throw new Error(JSON.stringify(errs));
  return { ok: true };
}
