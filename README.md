# kando1-ec-shopify

MVP-B: 大量バリアント向け価格一括更新アプリ（まずはAPI土台）

## MVP実装内容
- `POST /api/simulate` ルール適用結果のプレビュー
- `POST /api/apply` 差分だけ価格更新（ジョブ化）
- `GET /api/jobs/:jobId` ジョブ確認
- `POST /api/jobs/:jobId/undo` 直前ジョブ復元
- ルールビルダーUI（`GET /`）:
  - 条件演算子 `in`（複数値）対応
  - `in` 条件の候補値チェックボックス選択（option1/option2/option3）
  - `Pick` ボタンで開く value picker（他操作では閉じない）
  - App Bridge Resource Picker による商品選択（Product ID手入力を削減）
  - モバイル崩れ修正、入力欄幅・placeholder可読性改善
- Shopify連携:
  - OAuth最小導線（`/auth` → `/auth/callback`）
  - shop単位アクセストークン管理（SQLite永続化）
  - スコープ: `read_products,write_products`
  - 価格更新は Admin GraphQL `productVariantsBulkUpdate` を利用
  - Shopify Admin 埋め込み起動時は URL の `shop` を自動利用（通常は Shop Domain 入力不要）
  - `?debug=1` で Shop Domain 入力欄を表示（開発/デバッグ用）
- 言語対応:
  - `ja/en` 自動切替（`?locale=` 優先、次にブラウザ言語）
  - App Store listing の言語設定と実装言語を一致させる前提

> デフォルトは `MOCK_MODE=true` なので、Shopify接続なしで挙動確認できます。

## Setup
```bash
cp .env.example .env
npm install
npm run dev
```

## Shopify管理画面での検証（App Store公開なし）
1. Partner Dashboardで `Public app` か `Custom app` を作成
2. `App URL` と `Allowed redirection URL(s)` を設定
   - App URL: `https://<公開URL>/`
   - Redirect URL: `https://<公開URL>/auth/callback`
3. `.env` を設定して `MOCK_MODE=false` で起動
4. `/auth?shop=<your-shop>.myshopify.com` にアクセスしてインストール
5. 管理画面のアプリから起動して利用

ローカル検証で `APP_URL` に `localhost` を使う場合は、Shopifyから到達できるトンネルURL（Cloudflare Tunnel, ngrokなど）に置き換えてください。

## 本番リリースまでの手順

1. Shopify Partner 側の準備
- Partnerアカウント作成
- Dev Dashboardで dev store 作成
- Dev Dashboardでアプリ作成（例: `bulk-update-products`）
- アプリに必要スコープを設定（`read_products,write_products`）

2. ローカルアプリとShopifyアプリの紐付け
- `shopify auth login`
- `shopify app config link --client-id <APP_CLIENT_ID>`
- `shopify.app.toml` の `application_url` / `redirect_urls` を実URLに合わせる

3. 到達可能URLを用意（ローカル検証時）
- `npm run dev` で `:8787` 起動
- Cloudflare Tunnel などで公開URLを作成
- 404回避のため、必要に応じて `--config /dev/null` を使って既存 `~/.cloudflared/config.yml` の影響を除外
- quick tunnel のURLは失効するため、URL変更時は `.env` と `shopify.app.toml` を更新し `shopify app deploy` を再実行

4. OAuthインストールと埋め込み確認
- `APP_URL` と redirect URL を Shopify 側設定と一致させる
- `/auth?shop=<dev-store>.myshopify.com` でインストールフロー実行
- Shopify Admin の Apps から起動し、埋め込み内で画面表示を確認
- Product Picker、simulate/apply、条件ルールの動作を確認

5. リリース設定
- URLや設定変更後は `shopify app deploy` で反映
- Dev Dashboard の Distribution を本番方針に合わせて設定
- App Store公開する場合は listing（説明、画像、価格、サポート、プライバシー）を整備
- 言語は実装済みのみ掲載（本プロジェクトは `ja/en` 自動切替対応）
- 公開URLの例:
  - Privacy policy: `https://kando1-bulk-pricing.fly.dev/privacy.html`
  - Support: `https://kando1-bulk-pricing.fly.dev/support.html`

6. 最終チェック
- 権限スコープ最小化
- OAuth, apply/undo, エラーハンドリング確認
- 機密情報（`.env`、シークレット、トークン）をコミットしていないことを確認
- 申請・公開後に実ストアで再検証

## Managed Pricing 設定

Plan spec は [docs/managed-pricing.json](docs/managed-pricing.json) を正とする。Shopify Managed Pricing は Partner Dashboard で設定するため、この JSON は実装コードではなく運用・レビュー用の source of truth。

参照:
- [Managed App Pricing](https://shopify.dev/docs/apps/launch/billing/managed-pricing)

### Day 30 plan

- `Free Preview`: public, `$0/mo`
- `Standard`: public, `$9.99/mo`
- `Founding 10`: private, `$7/mo`, 最大20 store, Standard相当, 12ヶ月 price lock

### Partner Dashboard 設定手順

> 用語ガイド: Shopify の listing 編集画面の左サイドバーは `Pricing details`（`Pricing content` ではない）。本手順内の `Pricing details` はすべてこの sidebar tab を指す。Pricing root（plan の handle / billing model を扱う画面）は listing 編集画面とは別ページで、`Pricing details > Manage` から遷移する。

#### 0. Pricing method を Managed pricing に切り替える（初回のみ）

1. listing 編集画面 → 左 sidebar の `Pricing details` → 右上の `Manage` で Pricing root に入る
2. Pricing root の右上 `Settings`（歯車アイコン）を開く
3. `Pricing method` を `Manual pricing` から `Managed pricing` に切り替える（`Switch to managed pricing?` ダイアログで `Switch`）
4. `Default billing frequency` が **`Yearly`** で表示されるので **`Monthly`** に変更する（[docs/managed-pricing.json](docs/managed-pricing.json) の全 plan が monthly のため）
5. `Save`

> 注意: 切替時に既存の `free` placeholder plan が残る。これは削除せずそのまま `Free Preview` として編集する設計（handle は `free` のまま、display name で `Free Preview` と表示）。新規 handle で作り直したい場合は、Pricing root の `free` 行 `…` メニューから削除してから `Add` で再作成する。

#### 1. Public plan を作成・編集する

1. Pricing root の `Public plans` で:
   - 既存の `free` 行を開いて編集する（→ Free Preview として使う）
   - `Add` で `standard` を新規作成する
2. 各 public plan の **plan-level 設定**（Pricing root の plan ページ）:
   - `Internal plan handle`: `free`（既存維持）/ `standard`
   - `Billing` dropdown: `free` は `Free`、`standard` は `Monthly recurring`（`Monthly recurring, with yearly discount` ではない）
   - `Monthly charge`: `0` / `9.99`
   - `Free trial duration`: Day 30 時点では **`0`**（trial は使わない）
   - `Redirect URL`: `/`
3. 各 public plan の **listing-level 設定**（listing 編集画面の `Pricing details` 内、各 plan カード）:
   - `Display name`: `Free Preview` / `Standard`
   - `Top features`: 各 plan につき 5 個まで（`+ Add` で追加、各 40 文字以内）
4. `Provide a URL where merchants can find more pricing information (optional)` は空のまま
5. `I have approval to charge merchants outside of the Shopify Billing API` checkbox は **絶対に check しない**（Shopify policy 違反）
6. `Save`（listing top の `Unsaved changes` バーから）

> 重要: Managed Pricing の **public plan には「description」フィールドが存在しない**。説明は Display name + Top features の 2 要素のみで構成する。`docs/managed-pricing.json` の `descriptions.en/ja` は内部参照用で UI には反映されない（top features に分解して入力する）。

#### 2. Private plan（Founding 10）を作成する

1. Pricing root の `Private plans` で `Add` を押す
2. 入力項目（同一ページに display name / description まで含む）:
   - `Internal plan handle`: `founding_10` と入力すると Shopify が自動で **`founding-10`**（kebab-case）に正規化する。これが正の handle（`docs/managed-pricing.json` の `shopifyHandle` フィールドを参照）
   - `Billing`: `Monthly recurring`
   - `Monthly charge`: `7`
   - `Free trial duration`: `0`
   - `Redirect URL`: `/`
   - `Display name`: `Founding 10`
   - `Description`: `Invite-only early customer plan with Standard-level limits and a 12-month price lock.`（private plan のみ description フィールドあり）
3. `Stores with plan access` に **最低 1 store を追加する**。Shopify は空保存を許可しない（"At least one target is required" でエラー）。
   - 招待候補が未確定なら **dev store を placeholder として登録**: `bulk-update-products`（input の suffix が `.myshopify.com`）
   - 追加後、本物の Founding 10 候補が決まったら `…` メニューから dev store を remove する
4. `Save`

#### 3. 検証

1. 公開 listing URL（`https://apps.shopify.com/bulk-update-products`）を開き、`Pricing` セクションに `Free Preview` と `Standard` が JSON spec 通り表示されることを確認
2. **Founding 10（private）は public listing には出ない**。authorized store の admin から確認する:
   - dev store admin → Apps → bulk-update-products → plan 選択画面で `Founding 10` も含む 3 plans が見えること
3. test plan selection / test subscription を 1 件実行し、Shopify Billing 側で plan selection flow が OK か確認

### Founding 10 store 追加手順

1. Partner Dashboard で対象 app を開く
2. `Distribution` > `Shopify App Store listing` > `Manage listing`
3. `Pricing details` > `Manage`（左 sidebar の `Pricing details`、右上の `Manage` ボタン）
4. Pricing root で `Private plans` 配下の `founding-10` を開く
5. `Stores with plan access` に `example` 形式（`.myshopify.com` 自動付加）または `example.myshopify.com` 形式で store domain を追加
6. dev store の placeholder が残っていれば、本物の候補を 1 件以上追加してから dev store を remove する
7. 追加後、対象 merchant に Shopify admin 内の plan selection page から選択してもらう

注意:
- private plan は翻訳非対応なので、`Founding 10` の表示文は English で統一する
- private plan は **必ず最低 1 store** を `Stores with plan access` に持つ必要がある（Shopify 仕様）
- private plan handle は **kebab-case に自動正規化される**（`founding_10` → `founding-10`）。API 呼び出しは正規化後の handle を使う
- public plan は最大 4 件まで。Day 30 時点では `Free Preview` と `Standard` の 2 件だけ使い、`Pro` と将来枠を残す
- public plan に "description" フィールドは無い（Display name + Top features の 2 要素のみ）。Private plan のみ description あり
- trial は Day 30 時点では付けない。`Pro` 公開時のみ 14日 trial を使う
- Managed Pricing を使うため、自前 billing や Stripe は追加しない
- `I have approval to charge merchants outside of the Shopify Billing API` の checkbox は絶対に check しない

## Example
```bash
curl -X POST http://localhost:8787/api/simulate \
  -H 'content-type: application/json' \
  -d '{
    "productId":"gid://shopify/Product/123",
    "rules":[
      {
        "priority":1,
        "conditions":[
          {"field":"option1","op":"in","value":["Black1","Black2","Black3","Black4","Black5"]},
          {"field":"option2","op":"equals","value":"Pro"}
        ],
        "action":{"type":"add","value":300}
      }
    ]
  }'
```

## App Listing 下書き

最新の listing copy は [docs/listing-copy.md](docs/listing-copy.md) を source of truth とする。Shopify の App Store requirements では、埋め込みアプリは session token を使うこと、課金がある場合は Shopify Billing API か Managed Pricing を使うこと、listing は正確であることが求められる。
参照:
- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
- [Best practices for apps in the Shopify App Store](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)

### 基本情報
- App name:
  - `Bulk Pricing Rule Builder`
- Primary language:
  - `English`
- Additional language:
  - `Japanese`
- Sales channel requirement:
  - `No online store required`
- Public URLs:
  - Privacy policy: `https://kando1-bulk-pricing.fly.dev/privacy.html`
  - Support: `https://kando1-bulk-pricing.fly.dev/support.html`

### 英語 listing 文案
- App introduction:
  - `Bulk-edit variant prices across size/color/material combinations with preview and safe rollback.`
- App details:
  - `Update variant prices across size, color, material, and other option combinations without editing each variant one by one. Kando1 Variant Bulk Editor lets you build rules, preview the exact variants that will change, and apply only the differences.`
  - `Use it when a product has many variants and you need a controlled way to adjust prices for selected combinations. Each run keeps a job history so recent changes can be reviewed and rolled back when needed.`
- Key benefits:
  - `Save time on repeated variant price updates across option combinations.`
  - `Preview affected variants before committing a bulk change.`
  - `Reduce accidental edits by updating only variants that match your rules.`
  - `Roll back retained jobs when a price change needs to be restored.`
- Screenshot captions:
  - `Build a rule with size, color, material, and other option conditions.`
  - `Preview every affected variant before applying a price change.`
  - `Apply only changed variants and review the completed job summary.`
  - `Track usage and job history from the embedded app home.`

### 日本語 listing 文案
- App introduction:
  - `サイズ・カラー・素材など複数条件でバリアント価格を一括更新。プレビュー付きで安全に実行。`
- App details:
  - `サイズ、カラー、素材、その他のオプション条件を組み合わせて、バリアント価格をまとめて更新できます。Kando1 Variant Bulk Editor では、ルールを作成し、変更対象のバリアントを事前に確認してから、差分だけを反映できます。`
  - `多くのバリアントを持つ商品の価格調整を、手作業ではなく管理された手順で進めたい場合に使えます。各実行はジョブ履歴として残り、必要に応じて保持中の変更を確認・復元できます。`
- Key benefits:
  - `オプション条件をまたいだバリアント価格更新の手間を減らせます。`
  - `一括反映前に、変更対象のバリアントを確認できます。`
  - `ルールに一致したバリアントだけを更新し、意図しない編集を減らせます。`
  - `保持中のジョブ履歴から、必要な価格変更を復元できます。`
- Screenshot captions:
  - `サイズ、カラー、素材などのオプション条件を組み合わせてルールを作成。`
  - `価格変更を反映する前に、対象バリアントを一覧で確認。`
  - `差分だけを反映し、完了したジョブの結果を確認。`
  - `埋め込みアプリのホームで usage とジョブ履歴を確認。`

### 画像と copy の禁止事項
- pricing 情報は `Pricing details` のみに記載し、screenshot や app details には入れない。
- reviews、testimonials、rating を listing copy や screenshot に入れない。
- statistics、保証、誇大な outcome claim は入れない。
- screenshot は実際の app UI を中心にし、browser chrome、desktop background、個人情報を含めない。

### カテゴリ候補
- Primary category:
  - `Store management`
- Secondary category:
  - `Selling products`

### Review 用テスト情報の下書き
- Review store:
  - `bulk-update-products.myshopify.com`
- Core flow:
  - `Open the app from Shopify Admin > Apps`
  - `Pick a product with variants`
  - `Create a rule using in (multi-select) for Option 1, Option 2, or Option 3`
  - `Click Preview and confirm changed variants`
  - `Click Apply and confirm errors=0`
- Notes for reviewer:
  - `The app is embedded and should be opened from Shopify Admin.`
  - `Billing uses Shopify Managed Pricing. Pricing copy must stay in Pricing details only.`

## 2026-03-15 時点の差分

前回の README は「公開準備中」の内容までをまとめていたが、2026-03-15 時点では App Store review を提出済みで、現在は reviewer assignment 待ちの状態。

### 現在の審査状態
- Shopify Partner の `App Store review` で `Submitted`
- ステータス表示:
  - `We're assigning a reviewer to your submission`
- review requirement の表示カテゴリ:
  - `Functionality`
  - `App Store listing`
  - `Embedded`
- Listing 言語:
  - `English` を primary として提出
- App Store visibility:
  - 公開後もしばらくは `direct URL only`（fully visible 未実施）

### 公開準備で追加したもの
- Fly 本番 URL で運用:
  - `https://kando1-bulk-pricing.fly.dev`
- App Store listing 用の静的ページ:
  - Privacy policy: `https://kando1-bulk-pricing.fly.dev/privacy.html`
  - Support: `https://kando1-bulk-pricing.fly.dev/support.html`
- Screencast URL 用ファイル:
  - `https://kando1-bulk-pricing.fly.dev/screencast.mp4`
  - 補助ページ: `https://kando1-bulk-pricing.fly.dev/screencast.html`
- review 用補助デモ:
  - `https://kando1-bulk-pricing.fly.dev/review-demo.html`

### listing 下書きからの確定差分
- App name の最終候補は generic name を避けて `Kando1 Variant Bulk Editor` を採用
- pricing / price という単語は App name や App details から外し、pricing section 以外では使わない方針に変更
- Pricing details は billing 未実装のため `Free` plan 1本で提出
- Protected customer data は `My app won't use customer data` で申請
- Capabilities は `Embedded` のみを選択
- Category は実態に合わせて `Store management > Operations > Bulk editor` で入力

### 審査提出時の運用メモ
- `Checking app listing...` は Shopify 側でエラーになる場合があるが、submit 自体は可能
- `Screencast URL` は HTML ページではなく動画直URLの方が安定
- `missing or invalid: authenticity_token` は入力値ではなく Shopify 側編集セッション切れで発生する
- フォーム保存エラー時は、まず入力値ではなく GraphQL response 本文を確認する

### 現時点での未対応項目
- Billing 実装は未着手（別 PR で対応予定）
- App Store fully visible 化は未実施
- 日本語 listing は primary ではなく、必要なら追加 translation として後続対応
