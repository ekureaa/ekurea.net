# ekurea.log

`blog.ekurea.net` 用の Nuxt Content アプリです。

## Development

```sh
npm install
npm run dev
```

記事は `content/blog/` に Markdown で追加します。

記事を更新した場合はfrontmatterに更新日を追加します。未指定の場合は公開日が最終更新日として扱われます。

```yaml
date: 2026-06-21
updated: 2026-06-22
```

記事のサムネイル画像はPNGのまま `assets/posts/thumbnails/` に置き、frontmatterでパスを指定します。ローカルでは元のPNGを表示し、アップロード時にSNSのリンクプレビュー向けの `1200 × 630px` WebPへ変換します。縦横比が異なる場合は中央基準で切り抜かれます。

```md
image:
  src: thumbnails/example.png
  alt: 記事のサムネイル画像
```

記事本文の画像もPNGのまま `assets/posts/content/` に置き、Markdownから次のように参照します。アップロード時は縦横比を維持し、最大幅1920px（小さい画像は拡大しない）のWebPへ変換します。

```md
![画像の説明](content/example.png)
```

`npm run dev` では両方ともローカルのPNGを直接表示します。本番ビルドでは拡張子を `.webp` に変え、それぞれ `VITE_MEDIA_BASE_URL/blog/thumbnails/` と `VITE_MEDIA_BASE_URL/blog/content/` 配下のR2 URLへ切り替わります。

リポジトリルートから画像をR2へアップロードします。

```sh
npm run blog:images:upload
```

画像アップロードとブログの静的生成をまとめて確認する場合:

```sh
npm run blog:publish
```

このコマンドはリポジトリルートの `.env` を読み込んで静的生成します。Cloudflare Pagesでは従来どおり `npm run generate` を使い、デプロイ先の `VITE_MEDIA_BASE_URL` を使用します。

同名画像を置き換えて再アップロードする場合:

```sh
npm run blog:images:upload -- --force
```

## Static Build

```sh
npm run generate
```

Cloudflare Pages では次のように設定します。

- Root directory: `blog`
- Build command: `npm run generate`
- Build output directory: `dist`
