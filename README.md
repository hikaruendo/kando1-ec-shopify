# kando1-ec-shopify

MVP-B: 大量バリアント向け価格一括更新アプリ（まずはAPI土台）

## 実装済み
- `POST /api/simulate` ルール適用結果のプレビュー
- `POST /api/apply` 差分だけ価格更新（ジョブ化）
- `GET /api/jobs/:jobId` ジョブ確認
- `POST /api/jobs/:jobId/undo` 直前ジョブ復元
- Rule Builder + Previewの最小UI（`GET /`）
- 条件演算子 `in`（カンマ区切り複数値 / 配列）対応
- `in` 条件で候補値をチェックボックス選択（option1/option2/title）
- Shopify OAuth（`/auth` → `/auth/callback`）の最小導線
- shop単位のアクセストークン管理（メモリ）

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

## 次ステップ
1. session token + embedded app本対応（App Bridge）
2. UI（Rule Builder + Preview）
3. bulk updates + retry/backoff
4. Undoの永続化（DB）
