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
- [x] Founding 10 private plan が authorized dev store の admin から選択できることを確認した。

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

### Manual verification

2026-04-26 に dev store admin の plan selection page で確認した。

- URL: `https://admin.shopify.com/store/bulk-update-products/charges/bulk-update-products-3/pricing_plans`
- 表示確認: `Founding 10`, `Free Preview`, `Standard`
- `Founding 10` は `$7 / 30 days`、`Created for you` として表示された。
- `Founding 10` の承認画面で `You will not be billed for this test charge.` を確認した。
- ユーザー確認後、`Founding 10` test subscription を承認した。
- Shopify Admin GraphQL で active subscription を確認した。

```json
{
  "id": "gid://shopify/AppSubscription/31556894883",
  "name": "Founding 10",
  "status": "ACTIVE",
  "test": true
}
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
PR: `#8`

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
PR: `#9`

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
PR: `#10`

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
PR: `#11`

### 変更内容

- app home 上部に usage meter widget を追加した。
- `/api/usage` endpoint を追加した。
- app 起動時に usage を取得し、現在 plan と今月の残量を表示する。
- Apply 成功後に usage meter を再取得する。
- tasks の progress bar と variants cap のテキスト表示を追加した。
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
- [x] tasks progress bar と variants cap テキストを表示する。
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
PR: `#12`

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
- [x] Shopify CLI webhook testing は本番 app config deploy 後に手動確認済み。

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

2026-04-26 に本番 `https://kando1-bulk-pricing.fly.dev/webhooks` 宛で確認済み。

確認 topics:

- `app/uninstalled`
- `shop/redact`
- `customers/data_request`
- `customers/redact`

結果:

- Shopify CLI の `shopify app webhook trigger` は4 topics すべて enqueue 成功。
- Fly logs で4 topics の受信を確認。
- 自前 smoke test で valid HMAC は `200`、invalid HMAC は `401` を確認。
- customer payload の raw email / phone をログに残さないことを確認。

## P1-8 Review prompt trigger

Branch: `codex/p1-8-review-prompt`
PR: `#13`

### 変更内容

- App Bridge Reviews API の `shopify.reviews.request()` を使う frontend hook を追加した。
- 2回目の `apply_succeeded` 後だけ review prompt 候補にする。
- `undo_succeeded` 後は review prompt 候補にする。
- `apply_failed` 直後は出さない。
- 同 shop に 30日以内に複数回出さない。
- `review_prompt_shown` / `review_prompt_dismissed` を critical event として保存する。
- Reviews API が使えない環境では何もしない。

### Shopify docs 確認

Reviews API は App Bridge の `reviews.request()` で review modal を要求する。表示可否は Shopify 側の rate limit / eligibility に従う。

Shopify 側の制限:

- 60日以内に1回まで。
- 365日以内に3回まで。
- 既に review 済み、mobile、merchant ineligible、install 24時間未満などでは表示されない。

参照:

- https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/reviews-api
- https://shopify.dev/changelog/request-app-reviews-in-admin-with-the-new-reviews-api

### Trigger 条件

- 初回 apply: 表示しない。
- 2回目の successful apply: 表示候補。
- 3回目以降の apply: 表示しない。
- undo success: 表示候補。
- 30日以内に `review_prompt_shown` がある shop: 表示しない。
- task 失敗直後: 表示しない。

### Acceptance Status

- [x] 初回 apply では出ない。
- [x] 2回目 apply で `reviewPrompt.shouldShow=true` を返す。
- [x] undo success で `reviewPrompt.shouldShow=true` を返す。
- [x] 30日以内の再表示を suppress する。
- [x] task failure trigger は対象外。
- [x] App Bridge Reviews API hook を frontend に追加した。

### Verification

```bash
npm test
```

Result:

```text
tests 23
pass 23
fail 0
```

## P1-9 Listing copy rewrite

Branch: `codex/p1-9-listing-copy`
PR: `#14`

### 変更内容

- [listing-copy.md](listing-copy.md) を新設し、Shopify App Store listing copy の source of truth にした。
- EN / JA の app introduction、app details、key benefits、screenshot captions を outcome ベースに更新した。
- README の `App Listing 下書き` セクションを最新 copy と `docs/listing-copy.md` 参照に差し替えた。
- pricing、reviews、誇大な outcome claim を screenshot / listing 本文に入れない運用ルールを明記した。

### Shopify docs 確認

Shopify docs で App Store listing requirements と best practices を確認した。

確認した制約:

- pricing 情報は指定された Pricing details 以外に入れない。
- reviews / testimonials を listing 本文や画像に入れない。
- statistics、保証、誇大な outcome claim を入れない。
- screenshots は実際の app UI / features を中心にし、browser chrome や desktop background を含めない。
- screenshots は重複させず、異なる feature / view / state を示す。

参照:

- https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices

### Acceptance Status

- [x] `docs/listing-copy.md` に JA / EN の全セクションを追加した。
- [x] EN intro は指定文言を使用した。
- [x] JA intro は指定文言を使用した。
- [x] details 先頭2文相当、key benefits 4件、screenshots captions 4件を JA / EN で揃えた。
- [x] pricing / reviews / 誇大な outcome を screenshot に入れない原則を明記した。
- [x] README の `App Listing 下書き` セクションを更新した。
- [x] Partner Dashboard の English listing に EN copy を反映して保存した。

### Verification

```bash
npm test
```

Result:

```text
tests 23
pass 23
fail 0
```

### Manual verification

2026-04-26 に Partner Dashboard の English listing を更新し、`App listing saved` を確認した。

反映済み:

- App introduction
- App details
- Features 4件
- 既存 desktop screenshots 3枚分の alt text

2026-04-26 に追加で Japanese listing を公開前チェックし、Dashboard 上で `Incomplete` を解消した。

追加反映済み:

- Japanese listing の App name / App introduction / App details / Features
- Japanese listing の desktop screenshots 4枚分と alt text
- Feature media を画像に変更し、4枚目画像を反映
- Support email / support URL / privacy policy URL
- Merchant review email: `contact@kando1.com`
- App discovery content: subtitle と search terms
- Pricing details: `無料プレビュー` / `スタンダード`

公開状態:

- App Store listing: `Published`
- Published languages: `English`, `Japanese`
- App Store visibility: `Fully visible`
- Listing URL: `https://apps.shopify.com/bulk-update-products`

残作業:

- なし。P1 の公開前 blocker は解消済み。

2026-04-29 追記:

- Option 3 対応に合わせて `docs/listing-copy.md` と README の listing 文案を更新した。
- Partner Dashboard の English / Japanese listing は、次回編集時に source of truth と同期する。
