# Listing copy rewrite

作成日: 2026-04-26
対象タスク: P1-9 Listing copy rewrite

このファイルは Shopify App Store listing の文案 source of truth です。UI 実装ではなく、Partner Dashboard に入力する copy と review 時の判断材料を管理します。

## 参照した Shopify 要件

- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Best practices for apps in the Shopify App Store](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)

重要な制約:

- pricing 情報は Pricing details 以外に入れない。
- review / testimonial は listing 本文や画像に入れない。
- statistics、保証表現、誇大な outcome は入れない。
- screenshot は実際の app UI / features を中心にし、browser chrome や desktop background を含めない。
- screenshot はそれぞれ違う feature / view / state を示す。

## EN

### App Introduction

Bulk-edit variant prices across size/color combinations with preview and safe rollback.

### App Details

Update variant prices across size, color, and other option combinations without editing each variant one by one. Kando1 Variant Bulk Editor lets you build rules, preview the exact variants that will change, and apply only the differences.

Use it when a product has many variants and you need a controlled way to adjust prices for selected combinations. Each run keeps a job history so recent changes can be reviewed and rolled back when needed.

### Key Benefits

- Save time on repeated variant price updates across option combinations.
- Preview affected variants before committing a bulk change.
- Reduce accidental edits by updating only variants that match your rules.
- Roll back retained jobs when a price change needs to be restored.

### Screenshot Captions

1. Build a rule with size, color, title, and other variant conditions.
2. Preview every affected variant before applying a price change.
3. Apply only changed variants and review the completed job summary.
4. Track usage and job history from the embedded app home.

## JA

### App Introduction

サイズ・カラーなど複数条件でバリアント価格を一括更新。プレビュー付きで安全に実行。

### App Details

サイズ、カラー、その他のオプション条件を組み合わせて、バリアント価格をまとめて更新できます。Kando1 Variant Bulk Editor では、ルールを作成し、変更対象のバリアントを事前に確認してから、差分だけを反映できます。

多くのバリアントを持つ商品の価格調整を、手作業ではなく管理された手順で進めたい場合に使えます。各実行はジョブ履歴として残り、必要に応じて保持中の変更を確認・復元できます。

### Key Benefits

- オプション条件をまたいだバリアント価格更新の手間を減らせます。
- 一括反映前に、変更対象のバリアントを確認できます。
- ルールに一致したバリアントだけを更新し、意図しない編集を減らせます。
- 保持中のジョブ履歴から、必要な価格変更を復元できます。

### Screenshot Captions

1. サイズ、カラー、タイトルなどの条件を組み合わせてルールを作成。
2. 価格変更を反映する前に、対象バリアントを一覧で確認。
3. 差分だけを反映し、完了したジョブの結果を確認。
4. 埋め込みアプリのホームで usage とジョブ履歴を確認。

## 画像作成ルール

- 価格、plan、trial、discount などの pricing 情報を screenshot に入れない。
- review、rating、testimonial を screenshot に入れない。
- 「売上アップ」「CVR 改善」など、検証不能な outcome claim を入れない。
- 実 UI だけを見せ、ブラウザ枠、OS desktop、個人情報、store 固有の機密情報を入れない。
- 4枚の screenshot は、それぞれ rule builder、preview、apply result、usage/history など違う状態を示す。

