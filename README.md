# ekurea.net

私のホームページです。

## Setup

```sh
npm install
npm run dev
```

## Pages

- Home
- About
- Photo
- Links

## Photo Data

写真は `src/data/photos.json` で管理します。表示用の実ファイルは Cloudflare R2 にアップロードし、公開 URL は `VITE_MEDIA_BASE_URL` から組み立てます。

元画像は `src/assets/photos/originals/` に置き、次のコマンドで表示用 WebP に変換します。

```sh
npm run photos:build
```

変換後の画像は `src/assets/photos/generated/` に出力されます。

- 一覧用: `写真名-thumb.webp` / 幅 900px / quality 78
- 全画面用: `写真名-large.webp` / 幅 2560px / quality 82

`src/data/photos.json` には自動で追記されます。同じ画像は重複追加されません。

ファイル名が `2026-05-25.png` のような日付形式を含む場合、`date` も自動で入ります。

R2 にアップロードするには `.env` に次の値を設定します。

```sh
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
VITE_MEDIA_BASE_URL=
```

Cloudflare R2 の S3 互換 API を使うため、endpoint は未指定なら `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` を使います。R2 の custom domain は本番配信用に `VITE_MEDIA_BASE_URL` と同じホストへ接続してください。

デプロイ先のビルド環境にも `VITE_MEDIA_BASE_URL` を設定します。

```sh
npm run photos:upload
```

アップロード前に R2 へ送る object key だけ確認する場合:

```sh
npm run photos:upload -- --dry-run
```

生成とアップロードをまとめて行う場合:

```sh
npm run photos:publish
```
