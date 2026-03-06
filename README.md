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
