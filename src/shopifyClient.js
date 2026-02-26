import 'dotenv/config';
import { mockVariants } from './mockData.js';

const {
  MOCK_MODE = 'true',
  SHOPIFY_SHOP_DOMAIN,
  SHOPIFY_ADMIN_ACCESS_TOKEN,
  SHOPIFY_API_VERSION = '2025-01'
} = process.env;

const mockMode = MOCK_MODE === 'true';

async function gql(query, variables) {
  const res = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function fetchVariantsByProductId(productId) {
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

  const data = await gql(query, { id: productId });
  const nodes = data?.product?.variants?.nodes || [];
  return nodes.map(n => ({
    id: n.id,
    title: n.title,
    option1: n.selectedOptions?.[0]?.value || '',
    option2: n.selectedOptions?.[1]?.value || '',
    price: Number(n.price || 0)
  }));
}

export async function updateVariantPrice(variantId, price) {
  if (mockMode) return { ok: true, mock: true };

  const mutation = `
    mutation UpdateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant { id price }
        userErrors { field message }
      }
    }
  `;

  const data = await gql(mutation, { input: { id: variantId, price: String(price) } });
  const errs = data?.productVariantUpdate?.userErrors || [];
  if (errs.length) throw new Error(JSON.stringify(errs));
  return { ok: true };
}
