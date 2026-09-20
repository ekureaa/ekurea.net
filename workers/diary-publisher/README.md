# Diary publisher

`diary-admin.ekurea.net` でスマートフォン向け投稿画面を配信するCloudflare Workerです。

下書き保存時に次の処理を行います。

1. Cloudflare AccessのJWTを検証
2. タイトル・本文・公開状態をD1へ保存
3. 添付写真をWebPへ変換して非公開R2へ保存

1日1件の下書きを何度でも保存・確認できます。保存すると版番号が上がり、公開OKは自動でオフになります。最後の保存内容を確認して公開OKをオンにすると、日本時間22時のCron Triggerがその版をGitHubへ公開します。22時時点で公開OKがオフなら公開しません。22時以降の未公開記事と自動公開に失敗した記事は、管理画面の手動公開を使用します。公開済みの記事は管理画面から変更できません。

投稿画面は文章・写真・YouTube動画・Xの投稿を交互に置けるブロック型です。本文内のカーソル位置へ写真を挿入でき、YouTube動画またはXの投稿URLは貼り付けるだけで専用ブロックになります。編集画面とMarkdownプレビューを切り替えられ、プレビューではXの公式ウィジェットも読み込みます。公開時に検証済みの画像を公開R2へコピーし、YouTubeとXをMDC記法へ変換して `blog/content/diary/` へMarkdownを追加します。

## Storage and schedule

- D1: `ekurea-diary`（binding: `DB`）
- 下書き写真用R2: `ekurea-diary-drafts`（binding: `DRAFT_BUCKET`、公開ドメインなし）
- 公開写真用R2: `media-ekurea-net`（binding: `MEDIA_BUCKET`）
- Cron: `0 13 * * *`（UTC、日本時間22時）

D1の変更は `migrations/` で管理します。

```sh
npm run diary:db:migrate
```

## Cloudflare Access

Zero TrustでSelf-hosted applicationを作成します。

- Application domain: `diary-admin.ekurea.net`
- Allow: 投稿に使うアカウントだけ
- MFA: 有効

Application Audience (AUD) Tagとチームドメインを控えます。WorkerはAccessの入口だけに依存せず、`Cf-Access-Jwt-Assertion`の署名、issuer、audience、有効期限、メールアドレスを再検証します。

## Secrets

初回デプロイ後、次の値をWorker Secretへ設定します。

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN -c workers/diary-publisher/wrangler.jsonc
npx wrangler secret put ACCESS_AUD -c workers/diary-publisher/wrangler.jsonc
npx wrangler secret put ACCESS_ALLOWED_EMAIL -c workers/diary-publisher/wrangler.jsonc
npx wrangler secret put GITHUB_TOKEN -c workers/diary-publisher/wrangler.jsonc
npx wrangler secret put DISCORD_WEBHOOK_URL -c workers/diary-publisher/wrangler.jsonc
```

- `ACCESS_TEAM_DOMAIN`: `https://<team>.cloudflareaccess.com`
- `ACCESS_AUD`: Access applicationのAUD Tag
- `ACCESS_ALLOWED_EMAIL`: 投稿を許可するメールアドレス
- `GITHUB_TOKEN`: `ekureaa/ekurea.net`だけを対象にしたFine-grained PAT。Repository permissionsの`Contents: Read and write`だけを許可
- `DISCORD_WEBHOOK_URL`: 公開成功後にタイトルと公開URLを送るDiscordチャンネルのWebhook URL

値が不足している間はWorkerが`503`を返し、管理画面や投稿APIを公開しません。

## Development

ローカルだけ認証を省略する場合、コミットしない`.dev.vars`をこのディレクトリへ作成します。

```dotenv
DEV_AUTH_BYPASS=true
GITHUB_TOKEN=...
DISCORD_WEBHOOK_URL=...
```

```sh
npm run diary:db:migrate:local
npm run diary:worker:dev
```

`DEV_AUTH_BYPASS`はlocalhostまたはCloudflareの接続ヘッダーがないローカルランタイムでしか動作しません。
