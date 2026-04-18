# kando1-ec-shopify

MVP-B: 大量バリアント向け価格一括更新アプリ（まずはAPI土台）

## MVP実装内容
- `POST /api/simulate` ルール適用結果のプレビュー
- `POST /api/apply` 差分だけ価格更新（ジョブ化）
- `GET /api/jobs/:jobId` ジョブ確認
- `POST /api/jobs/:jobId/undo` 直前ジョブ復元
- ルールビルダーUI（`GET /`）:
  - 条件演算子 `in`（複数値）対応
  - `in` 条件の候補値チェックボックス選択（option1/option2/title）
  - `Pick` ボタンで開く value picker（他操作では閉じない）
  - App Bridge Resource Picker による商品選択（Product ID手入力を削減）
  - モバイル崩れ修正、入力欄幅・placeholder可読性改善
- Shopify連携:
  - OAuth最小導線（`/auth` → `/auth/callback`）
  - shop単位アクセストークン管理（メモリ）
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

Shopify の App Store requirements では、埋め込みアプリは session token を使うこと、課金がある場合は Shopify Billing API か Managed Pricing を使うこと、listing は正確であることが求められる。
参照:
- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)

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
- One-line summary:
  - `Bulk update variant prices by combining multiple option values in a single rule.`
- Short description:
  - `Preview and apply bulk price changes for variants filtered by multiple option values such as color groups and grades.`
- Full description:
  - `Bulk Pricing Rule Builder helps merchants update variant prices faster when products have many option combinations.`
  - `Instead of editing each SKU one by one, merchants can define rules such as "Option 1 is any of Black1 to Black5" and "Option 2 equals Standard", preview the affected variants, and then apply the update in one action.`
  - `The app is designed for products with large variant matrices where Shopify's native bulk editing flow is too slow for repeated price operations.`
- Key benefits:
  - `Filter variants by multiple option values in one rule`
  - `Preview every affected variant before applying changes`
  - `Update only changed variants`
  - `Undo the most recent pricing job`
- Suggested feature bullets:
  - `Multi-value filtering for option1, option2, and title`
  - `Add, set, or multiply prices`
  - `Embedded admin experience with product picker`
  - `Japanese and English UI support`

### 日本語 listing 文案
- One-line summary:
  - `複数のバリアント条件を組み合わせて、価格を一括更新できるアプリ`
- Short description:
  - `色グループやグレードなど複数のオプション値でバリアントを絞り込み、価格変更をプレビューして一括反映できます。`
- Full description:
  - `Bulk Pricing Rule Builder は、バリアント数が多い商品の価格更新を効率化するためのアプリです。`
  - `SKU を1件ずつ手作業で編集する代わりに、たとえば「Option 1 が Black1 から Black5 のいずれか」「Option 2 が Standard」といった条件を作成し、対象バリアントをプレビューしたうえで一括反映できます。`
  - `Shopify 標準の一括編集では扱いづらい、複数条件を組み合わせた価格更新に向いています。`
- Key benefits:
  - `複数のオプション値を 1 つのルールで指定可能`
  - `反映前に対象バリアントを一覧で確認可能`
  - `変更が必要なバリアントだけを更新`
  - `直前の価格更新ジョブを取り消し可能`

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
  - `Create a rule using in (multi-select) for Option 1 and Option 2`
  - `Click Preview and confirm changed variants`
  - `Click Apply and confirm errors=0`
- Notes for reviewer:
  - `The app is embedded and should be opened from Shopify Admin.`
  - `Billing is not implemented yet in this branch and should not be described in the listing.`

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
