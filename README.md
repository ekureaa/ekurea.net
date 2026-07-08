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

Photoページは同一オリジンの `/photos/photos.json` を読み込みます。このパスは Worker / Pages Function で Cloudflare R2 上の `photos/photos.json` に中継します。画像URLは `VITE_MEDIA_BASE_URL` から組み立てます。

デプロイ先のビルド環境に次の値を設定します。

```sh
VITE_MEDIA_BASE_URL=
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

Workerは `workers/photo-publisher` を使います。Cron実行、Nextcloudからの元画像取得、画像変換、R2更新を担当します。

Worker の Variables / Secrets:

```sh
NEXTCLOUD_BASE_URL
NEXTCLOUD_USERNAME
NEXTCLOUD_APP_PASSWORD
NEXTCLOUD_DAILY_DIR
MEDIA_BASE_URL
WORKER_BASE_URL
PHOTO_SOURCE_TOKEN
```

デプロイ:

```sh
npm run photos:worker:deploy
```

ローカルでCronハンドラを確認する場合:

```sh
npm run photos:worker:dev
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```
