# AGENTS.md

このファイルのスコープは、このリポジトリ全体です。

## プロジェクト概要
- Shopify埋め込みアプリ（MVP）で、バリアント価格の一括更新を行う。
- 主要API:
  - `POST /api/simulate`
  - `POST /api/apply`
  - `GET /api/jobs/:jobId`
  - `POST /api/jobs/:jobId/undo`
- フロントは `public/app.js` と `public/index.html`。

## 開発時の基本コマンド
- セットアップ: `npm install`
- 起動: `npm run dev`
- サーバーは `src/server.js`（Express）で `:8787` を使用。

## Shopify検証方針
- ローカル検証は `MOCK_MODE=true` でも可能。
- 実ストア検証は `MOCK_MODE=false` + OAuth（`/auth` → `/auth/callback`）を使う。
- `APP_URL` は Shopify から到達可能な URL（Cloudflare Tunnel など）を使う。

## 実装ルール
- UI文言は `public/app.js` の i18n 辞書（`en` / `ja`）を使い、直書きしない。
- 既存の挙動を崩さない:
  - `Pick product` は App Bridge Resource Picker を使用。
  - `valuePicker` は対応する `Pick` ボタンでのみ開閉。
- モバイル表示を常に維持（横はみ出しを作らない）。

## セキュリティ/運用
- 機密情報をコミットしない（`.env`、アクセストークン、APIシークレット）。
- `shopify.app.toml` はローカル用途があるため、扱いに注意して不要な公開を避ける。
- 破壊的な git 操作（`reset --hard` など）は明示依頼なしで実行しない。
