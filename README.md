# ekurea.net Vue

Vue 3 / Vite / Vue Router / Tailwind CSS で制作した個人ホームページです。

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

写真は `src/data/photos.json` で管理します。

元画像は `src/assets/photos/originals/` に置き、次のコマンドで表示用 WebP に変換します。

```sh
npm run photos:build
```

変換後の画像は `src/assets/photos/generated/` に出力されます。

- 一覧用: `写真名-thumb.webp` / 幅 900px / quality 78
- 全画面用: `写真名-large.webp` / 幅 2560px / quality 82

`src/data/photos.json` には自動で追記されます。同じ画像は重複追加されません。

ファイル名が `2026-05-25.png` のような日付形式を含む場合、`date` も自動で入ります。

## Credits

Photo placeholders use images from [Unsplash](https://unsplash.com/license).
