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

## Photo Worker

日々の写真追加は `workers/photo-publisher` の Cloudflare Worker で行います。Nextcloud の非公開WebDAVから当日分のPNGを取得し、Cloudflare Image Transformations でWebP変換してR2に保存します。
`large` は Cloudflare のWebP出力が安定する幅として 1920px、`thumb` は 900px で生成します。

元画像のファイル名と公開時刻（JST）:

```sh
yyyy-mm-dd.png    # 06:55
yyyy-mm-dd-2.png  # 11:55
```

R2保存先:

```sh
photos/yyyy-mm-dd-large.webp
photos/yyyy-mm-dd-thumb.webp
photos/yyyy-mm-dd-2-large.webp
photos/yyyy-mm-dd-2-thumb.webp
photos/photos.json
```

Workerは `workers/photo-publisher` を使います。Cron実行、Nextcloudからの元画像取得、画像変換、R2更新を担当します。
同じ公開枠の画像がすでにR2へ保存されている場合、その枠の実行はスキップされます。

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

手動実行で昼分を指定する場合は、通常の認証に加えてクエリへ `slot=2` を付けます。省略時は朝分です。

## Diary Publisher

`diary-admin.ekurea.net` のスマートフォン向けフォームから、ブログの日記を投稿できます。Cloudflare Accessで管理画面を保護し、Workerが写真とカード画像をR2へ保存して、日記のMarkdownをGitHubへ追加します。

詳細な設定は [`workers/diary-publisher/README.md`](workers/diary-publisher/README.md) を参照してください。
