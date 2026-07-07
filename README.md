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

Photoページは Cloudflare R2 上の `photos/photos.json` を読み込みます。公開 URL は `VITE_MEDIA_BASE_URL` から組み立てます。

デプロイ先のビルド環境に次の値を設定します。

```sh
VITE_MEDIA_BASE_URL=
```

`photos/photos.json` はブラウザから `fetch()` するため、R2バケットのCORSで `GET` を許可します。少なくとも本番サイトの origin とローカル確認用の origin を許可してください。

```json
[
  {
    "AllowedOrigins": ["https://ekurea.net", "http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
```

既存写真の初回移行や手動反映が必要な場合は、ローカルの `src/data/photos.json` と生成済みWebPをR2へアップロードできます。

```sh
npm run photos:upload
```

`photos:upload` は画像に加えて `photos/photos.json` もR2へアップロードします。

## Photo Worker

日々の写真追加は `workers/photo-publisher` の Cloudflare Worker で行います。Nextcloud の非公開WebDAVから当日分の `yyyy-mm-dd.png` を取得し、Cloudflare Image Transformations でWebP変換してR2に保存します。
`large` は Cloudflare のWebP出力が安定する幅として 1920px、`thumb` は 900px で生成します。

R2保存先:

```sh
photos/yyyy-mm-dd-large.webp
photos/yyyy-mm-dd-thumb.webp
photos/photos.json
```

Workerは2つ使います。

- `workers/photo-publisher`: Cron実行、画像変換、R2更新
- `workers/photo-source`: `cf.image` 用の変換元プロキシ

Worker の Variables / Secrets:

```sh
NEXTCLOUD_BASE_URL
NEXTCLOUD_USERNAME
NEXTCLOUD_APP_PASSWORD
NEXTCLOUD_DAILY_DIR
MEDIA_BASE_URL
PHOTO_SOURCE_BASE_URL
PHOTO_SOURCE_TOKEN
SOURCE_ACCESS_TOKEN
UPSTREAM_SOURCE_TOKEN
```

デプロイ:

```sh
npm run photos:source:deploy
npm run photos:worker:deploy
```

ローカルでCronハンドラを確認する場合:

```sh
npm run photos:worker:dev
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```
