# P1 Managed Pricing and Paywall Notes

Date started: 2026-04-25
Phase: P1 Managed Pricing & Paywall

This file is the running implementation log for P1 tasks. Add one section per `P1-x` task and keep task-specific decisions here instead of mixing them into P0 persistence notes.

## Scope

P1 covers:

- `P1-1`: Managed Pricing plan definition
- `P1-2`: Billing check middleware
- `P1-3`: Usage metering
- `P1-4`: Hard paywall
- `P1-5`: Soft paywall
- `P1-6`: Usage meter widget
- `P1-7`: Uninstall and GDPR webhooks
- `P1-8`: Review prompt trigger
- `P1-9`: Listing copy rewrite

Implementation rule:

- Keep PRs task-sized unless a later task is only documentation or directly coupled.
- Do not add Shopify scopes beyond `read_products,write_products`.
- Use Shopify Managed Pricing only. Do not add Stripe or manual billing.

## P1-1 Managed Pricing Plan Definition

Branch: `codex/p1-1-managed-pricing-spec`
PR: `#6`

### What Changed

- Added [managed-pricing.json](managed-pricing.json) as the repository source of truth for Managed Pricing plan configuration.
- Added README instructions for Partner Dashboard setup.
- Added Founding 10 private plan operating notes.
- Added phase notes from the P0 persistence/analytics work so Phase 1 setup findings live in repository docs.

### Plans

Day 30 plans:

- `Free Preview`: public, `$0/mo`
- `Standard`: public, `$9.99/mo`
- `Founding 10`: private, `$7/mo`, Standard-level limits, 12-month price lock

Future plans:

- `Pro`: public, `$24.99/mo`, P2
- `Scale`: private, `$79+/mo`, P3

### Shopify Dashboard Findings

- The listing sidebar label is `Pricing details`, not `Pricing content`.
- Pricing root is a separate page opened from `Pricing details > Manage`.
- Public Managed Pricing plans have no description field. They are represented by display name and top features.
- Private plans have a description field.
- Private plans require at least one store in `Stores with plan access`; empty private plans fail with `At least one target is required`.
- `Founding 10` currently authorizes `bulk-update-products.myshopify.com` as a dev store placeholder.
- Shopify normalizes private plan handles to kebab-case. `founding_10` becomes `founding-10`.
- The existing free placeholder handle was retained as `free`; it maps to the logical plan id `free_preview`.
- Default billing frequency was changed from yearly to monthly.
- Do not check `I have approval to charge merchants outside of the Shopify Billing API`.

### Acceptance Status

- [x] `docs/managed-pricing.json` includes 3 day-30 plans with names, prices, caps, trial days, and visibility.
- [x] README includes Partner Dashboard setup and Founding 10 store addition workflow.
- [x] Partner Dashboard draft setup was performed for public plans and Founding 10 private plan.
- [x] Public listing pricing section shows `Free Preview` and `Standard`.
- [ ] Founding 10 private plan selection should be verified from the authorized dev store admin.

### Verification

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/managed-pricing.json','utf8')); console.log('managed-pricing.json ok')"
npm test
```

Result:

```text
managed-pricing.json ok
tests 7
pass 7
fail 0
```

## P1-2 Billing Check Middleware

Branch: `codex/p1-2-billing-check`
PR: `#7`

### What Changed

- Added `src/billing.js`.
- Added `getCurrentPlan(shop)` and `hasActiveSubscription(shop)`.
- Added a 60-second in-process cache for plan resolution.
- Added graceful fallback to `free_preview` when plan lookup fails.
- Added `MOCK_CURRENT_PLAN` for mock-mode plan simulation.
- Added billing middleware before `/api/apply`.
- Kept `/api/apply` response shape unchanged.

### Shopify API Verification

Shopify Admin docs were searched for `currentAppInstallation activeSubscriptions`.

Validated Admin GraphQL query:

```graphql
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
```

Validator result:

- success
- required additional scopes: none

Docs:

- https://shopify.dev/docs/api/admin-graphql/latest/queries/currentAppInstallation
- https://shopify.dev/docs/api/admin-graphql/latest/enums/AppSubscriptionStatus

### Plan Mapping

Current name-based mapping:

- subscription name containing `Founding` -> `founding_10`
- subscription name containing `Standard` -> `standard`
- subscription name containing `Pro` -> `pro`
- subscription name containing `Scale` -> `scale`
- no active subscription -> `free_preview`
- lookup error -> `free_preview`

This is intentionally conservative for P1-2. P1-3/P1-4 can add a stricter handle-based mapping if Shopify exposes managed pricing handles in the active subscription payload used by the app.

### Acceptance Status

- [x] mock mode works with `MOCK_CURRENT_PLAN`.
- [x] cache prevents repeated Shopify Admin API calls inside 60 seconds.
- [x] failed plan resolution gracefully degrades to `free_preview`.
- [x] Admin GraphQL query was validated against Shopify schema.

### Verification

```bash
npm test
```

Result:

```text
tests 10
pass 10
fail 0
```

## P1-3 Usage Metering

Status: not started.

Expected next changes:

- Add `usage_monthly` migration.
- Add `src/usage.js` and usage repository.
- Increment usage on successful apply.
- Return upcoming usage in `/api/simulate`.
- Add boundary tests for `limit` and `limit + 1`.
