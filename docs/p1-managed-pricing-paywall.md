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

Branch: `codex/p1-3-usage-metering`
PR: `#9`

### 変更内容

- `usage_monthly` migration を追加する。
- `src/usage.js` と usage repository を追加する。
- apply 成功時に usage を increment する。失敗した task は使用量に加算しない。
- `/api/simulate` で upcoming usage を返す。
- uninstall / shop redact cleanup で対象 shop の usage を削除する。
- `limit` ちょうど / `limit + 1` の boundary test を追加する。

### データモデル

追加テーブル:

- `usage_monthly`

主キー:

- `shop`
- `year_month`

保持する値:

- `completed_tasks`
- `affected_variants_total`

月次 reset は UTC の `YYYY-MM` で行う。月初に全行を更新するのではなく、当月キーを変えることで自然に reset する。

### Plan caps

P1-3 時点の plan cap:

- `free_preview`: `100 variants/task`, `3 tasks/month`
- `standard`: `5,000 variants/task`, `20 tasks/month`
- `founding_10`: `5,000 variants/task`, `20 tasks/month`
- `pro`: `50,000 variants/task`, monthly task は unlimited
- `scale`: `250,000 variants/task`, monthly task は unlimited

### `/api/simulate` の追加 field

既存 response shape は維持し、top-level に `usage` を追加する。

```json
{
  "summary": {},
  "diffs": [],
  "usage": {
    "currentPlan": "free_preview",
    "planCaps": {
      "variantsPerTask": 100,
      "tasksPerMonth": 3
    },
    "affectedVariantsInThisPreview": 3,
    "monthlyTasksUsed": 1,
    "monthlyTasksRemaining": 2,
    "affectedVariantsTotalThisMonth": 3
  }
}
```

### Acceptance Status

- [x] 月初 reset は UTC `YYYY-MM` key で実装した。
- [x] apply 成功時に `completed_tasks` と `affected_variants_total` を increment する。
- [x] `/api/simulate` で upcoming usage を返す。
- [x] usage は uninstall / shop redact cleanup 対象に含めた。
- [x] boundary test で `limit` ちょうど / `limit + 1` を確認した。

### Verification

```bash
npm test
```

Result:

```text
tests 14
pass 14
fail 0
```

## P1-4 Hard paywall

Branch: `codex/p1-4-hard-paywall`
PR: `#10`

### 変更内容

- `/api/simulate` の `usage` に `paywall` object を追加した。
- `/api/apply` の直前で同じ usage limit 判定を行い、cap 超過時は `402` で block する。
- `usage.js` に paywall object 生成を追加した。
- UI では preview 結果表示後、Apply ボタン直上に hard paywall を表示する。
- paywall 表示時は Apply ボタンを disabled にする。
- upgrade CTA は `/billing/upgrade?plan=...&shop=...` に遷移する。
- `/billing/upgrade` は Shopify hosted Managed Pricing page に redirect する。
- paywall 表示と upgrade click は `/api/events` 経由で記録する。

### API 追加 field

`/api/simulate` の既存 field は維持し、`usage.paywall` を追加する。

```json
{
  "usage": {
    "currentPlan": "free_preview",
    "planCaps": {
      "variantsPerTask": 100,
      "tasksPerMonth": 3
    },
    "affectedVariantsInThisPreview": 3,
    "monthlyTasksUsed": 3,
    "monthlyTasksRemaining": 0,
    "affectedVariantsTotalThisMonth": 3,
    "paywall": {
      "kind": "tasks_over_cap",
      "shouldBlockApply": true,
      "suggestedPlan": "standard",
      "suggestedPlanPrice": "$9.99",
      "upgradeUrl": "/billing/upgrade?plan=standard"
    }
  }
}
```

`/api/apply` の cap 超過時 response:

```json
{
  "error": "paywall",
  "usage": {},
  "paywall": {}
}
```

### 表示ルール

- 表示する場所: preview 結果表示後、Apply ボタン直上。
- 表示しない場所: install 直後、rule builder の入口、product picker の前、task 失敗直後。
- preview が paywall 対象外になったら paywall を非表示にし、Apply を再度有効化する。

### Shopify hosted page

`/billing/upgrade` は次の形式に redirect する。

```text
https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
```

`SHOPIFY_APP_HANDLE` は `.env.example` に追加済み。現在の default は `bulk-update-products`。

### Acceptance Status

- [x] free_preview で月内3回 apply 後の4回目は paywall 表示対象になる。
- [x] apply 直前でも同じ条件で `402` block する。
- [x] standard の `5,000` / `5,001` variants 境界は usage unit test で確認済み。
- [x] free_preview の `100` / `101` variants 境界は usage unit test で確認済み。
- [x] paywall 表示時に `paywall_shown` event を送る UI hook を追加した。
- [x] upgrade CTA click で `paywall_clicked_upgrade` event を送る UI hook を追加した。
- [x] upgrade CTA は Shopify hosted Managed Pricing page に redirect する。

### Verification

```bash
npm test
```

Result:

```text
tests 16
pass 16
fail 0
```

## P1-5 Soft paywall

Branch: `codex/p1-5-soft-paywall`
PR: `#11`

### 変更内容

- 未実装の Pro 機能入口として `Schedule` / `Save as template` / `Older history` ボタンを追加した。
- 各ボタンのクリック時に soft paywall modal を表示する。
- modal には Pro upgrade CTA と close ボタンを置く。
- `paywall_shown` event を feature ごとの kind で記録する。
- upgrade CTA click 時に `paywall_clicked_upgrade` event を記録する。
- UI 文言は JA/EN の i18n に追加した。

### event kind

- schedule: `schedule_pro_required`
- template: `template_pro_required`
- history: `history_pro_required`

### 表示ルール

- schedule / template / older history の入口は常時表示する。
- 実処理はまだ行わず、クリック時に Pro 案内だけを表示する。
- この段階では需要計測が目的。P2 で実機能を追加する。

### Acceptance Status

- [x] schedule toggle クリック用の UI と soft paywall modal を追加した。
- [x] save as template クリック用の UI と soft paywall modal を追加した。
- [x] history の older access 入口と soft paywall modal を追加した。
- [x] `paywall_shown` event hook を feature 別 kind で追加した。
- [x] upgrade CTA click の `paywall_clicked_upgrade` hook を追加した。
- [x] JA/EN i18n を追加した。

### Verification

```bash
npm test
```

Result:

```text
tests 17
pass 17
fail 0
```

## P1-6 Usage meter widget

Branch: `codex/p1-6-usage-meter`
PR: `#12`

### 変更内容

- app home 上部に usage meter widget を追加した。
- `/api/usage` endpoint を追加した。
- app 起動時に usage を取得し、現在 plan と今月の残量を表示する。
- Apply 成功後に usage meter を再取得する。
- tasks と variants の progress bar を追加した。
- upgrade CTA は current plan に応じて Standard / Pro へ向ける。
- mobile では widget を1カラムに落として横はみ出しを避ける。
- UI 文言は JA/EN の i18n に追加した。

### `/api/usage` response

```json
{
  "usage": {
    "currentPlan": "standard",
    "planCaps": {
      "variantsPerTask": 5000,
      "tasksPerMonth": 20
    },
    "affectedVariantsInThisPreview": 0,
    "monthlyTasksUsed": 1,
    "monthlyTasksRemaining": 19,
    "affectedVariantsTotalThisMonth": 7,
    "paywall": {
      "kind": null,
      "shouldBlockApply": false,
      "suggestedPlan": null,
      "suggestedPlanPrice": null,
      "upgradeUrl": null
    }
  }
}
```

### Acceptance Status

- [x] `/api/usage` endpoint を追加した。
- [x] app 起動時に usage meter を読み込む。
- [x] Apply 成功後に usage meter を更新する。
- [x] 現在 plan、残り tasks、variants cap を表示する。
- [x] progress bar 2本を表示する。
- [x] mobile で1カラム表示にする。

### Verification

```bash
npm test
```

Result:

```text
tests 18
pass 18
fail 0
```

## P1-7 Uninstall webhook / GDPR webhooks

Branch: `codex/p1-7-webhook-compliance`
PR: 未作成

### 変更内容

- `shopify.app.toml` の webhook 登録内容をテストで固定した。
- `app/uninstalled` は `/webhooks` で受け、shop 単位の persisted data を削除する。
- compliance topics は `/webhooks` で受ける。
- `customers/data_request` は customer data を保持していないため no-op `200`。
- `customers/redact` は customer data を保持していないため no-op `200`。
- `shop/redact` は shop 単位の persisted data を削除する。
- customer compliance payload の本文をログに出さないことをテストで固定した。

### Shopify docs 確認

Shopify docs では app-specific webhooks を `shopify.app.toml` に設定し、`shopify app deploy` で反映する方式が推奨されている。

登録内容:

```toml
[webhooks]
api_version = "2026-01"

[[webhooks.subscriptions]]
compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "/webhooks"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "/webhooks"
```

参照:

- https://shopify.dev/docs/api/shopify-app-remix/latest/guide-webhooks
- https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance

### cleanup 対象

`app/uninstalled` / `shop/redact` で削除するもの:

- `jobs`
- `job_snapshots`
- `shop_sessions`
- `events`
- `usage_monthly`

### Acceptance Status

- [x] 4 webhooks が `shopify.app.toml` に登録されている。
- [x] HMAC 検証は `/webhooks` で必須。
- [x] invalid HMAC は `401` を返す。
- [x] `app/uninstalled` で対象 shop の persisted data を削除する。
- [x] `shop/redact` で対象 shop の persisted data を削除する。
- [x] `customers/data_request` は no-op `200`。
- [x] `customers/redact` は no-op `200`。
- [x] customer payload の email / phone をログに残さない。
- [ ] Shopify CLI webhook testing は本番 app config deploy 後に手動確認が必要。

### Verification

```bash
npm test
```

Result:

```text
tests 20
pass 20
fail 0
```

### Deploy / manual check

設定反映:

```bash
shopify app deploy
```

手動確認:

```bash
npm test
```

Shopify CLI の webhook testing は、Partner Dashboard / Shopify CLI の対象 app config が本番 app と一致している状態で実施する。
