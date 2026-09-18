# Diary publisher

`diary-admin.ekurea.net` でスマートフォン向け投稿画面を配信するCloudflare Workerです。

投稿時に次の処理を行います。

1. Cloudflare AccessのJWTを検証
2. 添付写真をWebPへ変換してR2へ保存
3. 日付・タイトル・faviconから1200×630pxのカード画像を生成してR2へ保存
4. `blog/content/diary/`へMarkdownを追加

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
```

- `ACCESS_TEAM_DOMAIN`: `https://<team>.cloudflareaccess.com`
- `ACCESS_AUD`: Access applicationのAUD Tag
- `ACCESS_ALLOWED_EMAIL`: 投稿を許可するメールアドレス
- `GITHUB_TOKEN`: `ekureaa/ekurea.net`だけを対象にしたFine-grained PAT。Repository permissionsの`Contents: Read and write`だけを許可

値が不足している間はWorkerが`503`を返し、管理画面や投稿APIを公開しません。

## Development

ローカルだけ認証を省略する場合、コミットしない`.dev.vars`をこのディレクトリへ作成します。

```dotenv
DEV_AUTH_BYPASS=true
GITHUB_TOKEN=...
```

```sh
npm run diary:worker:dev
```

`DEV_AUTH_BYPASS`はlocalhostまたはCloudflareの接続ヘッダーがないローカルランタイムでしか動作しません。画像の文字合成を含む確認にはWranglerのremote developmentが必要です。
