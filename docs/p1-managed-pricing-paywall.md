# P1 Managed Pricing / Paywall 実装メモ

開始日: 2026-04-25
Phase: P1 Managed Pricing & Paywall

このファイルは P1 タスクの進行ログです。`P1-x` ごとにセクションを追加し、タスク固有の判断や検証結果は P0 の永続化メモではなくこのファイルへ追記します。

## 対象範囲

P1 の対象:

- `P1-1`: Managed Pricing のプラン定義
- `P1-2`: Billing check middleware
- `P1-3`: Usage metering
- `P1-4`: Hard paywall
- `P1-5`: Soft paywall
- `P1-6`: Usage meter widget
- `P1-7`: Uninstall webhook と GDPR webhooks
- `P1-8`: Review prompt trigger
- `P1-9`: Listing copy rewrite

実装ルール:

- PR は原則として task 単位に分ける。
- Shopify scope は `read_products,write_products` から増やさない。
- 課金は Shopify Managed Pricing のみを使う。Stripe や自前 billing は追加しない。

## P1-1 Managed Pricing のプラン定義

Branch: `codex/p1-1-managed-pricing-spec`
PR: `#6`

### 変更内容

- [managed-pricing.json](managed-pricing.json) を Managed Pricing plan configuration の source of truth として追加。
- README に Partner Dashboard での設定手順を追記。
- Founding 10 private plan の運用メモを追記。
- Phase 1 の設定作業で分かったことを repository docs に残した。

### プラン

Day 30 plans:

- `Free Preview`: public, `$0/mo`
- `Standard`: public, `$9.99/mo`
- `Founding 10`: private, `$7/mo`, Standard 相当, 12ヶ月 price lock

Future plans:

- `Pro`: public, `$24.99/mo`, P2
- `Scale`: private, `$79+/mo`, P3

### Shopify Dashboard で分かったこと

- listing 編集画面の sidebar 名は `Pricing content` ではなく `Pricing details`。
- Pricing root は `Pricing details > Manage` から遷移する別ページ。
- Managed Pricing の public plan には description field がない。表示は display name と top features で構成される。
- private plan には description field がある。
- private plan は `Stores with plan access` に最低1 store が必要。空だと `At least one target is required` で保存できない。
- `Founding 10` には placeholder として `bulk-update-products.myshopify.com` を登録済み。
- Shopify は private plan handle を kebab-case に正規化する。`founding_10` は `founding-10` になる。
- 既存の free placeholder handle は `free` のまま使い、logical plan id `free_preview` に対応させる。
- Default billing frequency は yearly から monthly に変更済み。
- `I have approval to charge merchants outside of the Shopify Billing API` は絶対に check しない。

### Acceptance Status

- [x] `docs/managed-pricing.json` に day 30 の3プランを記載した。
- [x] README に Partner Dashboard 設定手順と Founding 10 store 追加手順を記載した。
- [x] Partner Dashboard で public plans と Founding 10 private plan の draft 設定を実施した。
- [x] public listing の Pricing section に `Free Preview` と `Standard` が表示されることを確認した。
- [ ] Founding 10 private plan が authorized dev store の admin から選択できることは追加確認が必要。

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

## P1-2 Billing check middleware

Branch: `codex/p1-2-billing-check`
PR: `#7`

### 変更内容

- `src/billing.js` を追加。
- `getCurrentPlan(shop)` と `hasActiveSubscription(shop)` を追加。
- plan 解決結果を 60 秒 in-process cache する。
- plan 解決に失敗した場合は `free_preview` に graceful degrade する。
- mock mode 用に `MOCK_CURRENT_PLAN` を追加。
- `/api/apply` の前段に billing middleware を追加。
- `/api/apply` の既存 response shape は変更していない。

### Shopify API 検証

Shopify Admin docs で `currentAppInstallation activeSubscriptions` を検索済み。

検証済み Admin GraphQL query:

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

### Plan mapping

現時点の name-based mapping:

- subscription name に `Founding` を含む -> `founding_10`
- subscription name に `Standard` を含む -> `standard`
- subscription name に `Pro` を含む -> `pro`
- subscription name に `Scale` を含む -> `scale`
- active subscription なし -> `free_preview`
- lookup error -> `free_preview`

P1-2 では安全側に倒して name-based mapping にしている。Managed Pricing の handle が app から利用できる payload に含まれることを確認できたら、P1-3/P1-4 以降で handle-based mapping に寄せる。

### Acceptance Status

- [x] mock mode は `MOCK_CURRENT_PLAN` で動く。
- [x] 60秒 cache により同一 shop の過剰な Admin API call が発生しない。
- [x] plan 解決失敗時は `free_preview` に degrade する。
- [x] Admin GraphQL query は Shopify schema で検証済み。

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

## P1-3 Usage metering

Status: not started.

次に実装する内容:

- `usage_monthly` migration を追加する。
- `src/usage.js` と usage repository を追加する。
- apply 成功時に usage を increment する。
- `/api/simulate` で upcoming usage を返す。
- `limit` ちょうど / `limit + 1` の boundary test を追加する。
