# kando1-ec-shopify

MVP-B: 大量バリアント向け価格一括更新アプリ（まずはAPI土台）

## 実装済み
- `POST /api/simulate` ルール適用結果のプレビュー
- `POST /api/apply` 差分だけ価格更新（ジョブ化）
- `GET /api/jobs/:jobId` ジョブ確認
- `POST /api/jobs/:jobId/undo` 直前ジョブ復元
- Rule Builder + Previewの最小UI（`GET /`）
- 条件演算子 `in`（カンマ区切り複数値 / 配列）対応

> デフォルトは `MOCK_MODE=true` なので、Shopify接続なしで挙動確認できます。

## Setup
```bash
cp .env.example .env
npm install
npm run dev
```

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
1. Shopify OAuth / embedded app化
2. UI（Rule Builder + Preview）
3. bulk updates + retry/backoff
4. Undoの永続化（DB）
