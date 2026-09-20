type Env = {
  ASSETS: Fetcher
  DB: D1Database
  DRAFT_BUCKET: R2Bucket
  IMAGES: ImagesBinding
  MEDIA_BUCKET: R2Bucket
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ACCESS_ALLOWED_EMAIL?: string
  GITHUB_TOKEN?: string
  DISCORD_WEBHOOK_URL?: string
  GITHUB_OWNER: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
  BLOG_BASE_URL: string
  MEDIA_BASE_URL: string
  DEV_AUTH_BYPASS?: string
}

type AccessJwtHeader = {
  alg?: string
  kid?: string
}

type AccessJwk = JsonWebKey & {
  kid?: string
}

type AccessJwtPayload = {
  aud?: string | string[]
  email?: string
  exp?: number
  iat?: number
  iss?: string
  nbf?: number
  sub?: string
  type?: string
}

type Identity = {
  email: string
  sub: string
}

type TokyoDateParts = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

type StoredPhoto = {
  id: string
  key: string
  url: string
  alt: string
}

type DraftTextBlock = {
  id: string
  type: 'text'
  value: string
}

type DraftPhotoBlock = {
  id: string
  type: 'photo'
}

type DraftEmbedBlock = {
  id: string
  type: 'youtube' | 'x'
  url: string
}

type DraftBlock = DraftTextBlock | DraftPhotoBlock | DraftEmbedBlock

type DraftContent = {
  blocks: DraftBlock[]
}

type DiaryEntryStatus = 'draft' | 'publishing' | 'published' | 'failed'

type DiaryEntryRow = {
  entry_date: string
  slug: string
  title: string
  content_json: string
  ready: number
  ready_version: number | null
  ready_at: string | null
  status: DiaryEntryStatus
  version: number
  created_at: string
  updated_at: string
  publish_started_at: string | null
  published_at: string | null
  page_url: string | null
  commit_url: string | null
  commit_sha: string | null
  last_error: string | null
}

type DiaryPhotoRow = {
  id: string
  entry_date: string
  object_key: string
  alt: string
  created_at: string
}

type GitHubContentResponse = {
  content?: {
    html_url?: string
  }
  commit?: {
    html_url?: string
    sha?: string
  }
}

type GitHubFileResponse = {
  type?: string
  encoding?: string
  content?: string
  sha?: string
  html_url?: string
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

class ConfigurationError extends Error {}

const maxTitleLength = 80
const maxBodyLength = 20_000
const maxPhotoCount = 4
const maxPhotoSize = 10 * 1024 * 1024
const maxTotalPhotoSize = 30 * 1024 * 1024
const maxEmbedCount = 10
const maxDraftDataLength = 100_000
const maxBlockCount = 100
const photoIdPattern = /^[a-zA-Z0-9-]{1,64}$/
const entryDatePattern = /^\d{4}-\d{2}-\d{2}$/
const publishHour = 22
const publishLeaseMs = 10 * 60 * 1000
const accessClockSkewSeconds = 60
const jwksCacheTtlMs = 60 * 60 * 1000
const allowedImageFormats = new Set([
  'avif',
  'heic',
  'heif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'jpeg',
  'jpg',
  'png',
  'webp',
])

let cachedJwks: {
  teamDomain: string
  expiresAt: number
  keys: AccessJwk[]
} | undefined

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

function errorResponse(error: unknown, apiRequest: boolean) {
  const status = error instanceof HttpError
    ? error.status
    : error instanceof ConfigurationError
      ? 503
      : 500
  const code = error instanceof HttpError
    ? error.code
    : error instanceof ConfigurationError
      ? 'not_configured'
      : 'internal_error'
  const message = error instanceof HttpError || error instanceof ConfigurationError
    ? error.message
    : '処理に失敗しました。時間を置いてもう一度お試しください。'

  if (apiRequest) {
    return jsonResponse({ ok: false, code, message }, status)
  }

  return new Response(message, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

function requireEnv(env: Env, name: keyof Env) {
  const value = env[name]

  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigurationError(`${String(name)} が設定されていません。`)
  }

  return value.trim()
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function normalizeAccessTeamDomain(value: string) {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new ConfigurationError('ACCESS_TEAM_DOMAIN のURLが正しくありません。')
  }

  if (url.protocol !== 'https:' || !url.hostname.endsWith('.cloudflareaccess.com')) {
    throw new ConfigurationError('ACCESS_TEAM_DOMAIN はCloudflare AccessのHTTPS URLを指定してください。')
  }

  return url.origin
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function parseJwtPart<T>(value: string) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T
  } catch {
    throw new HttpError(401, 'invalid_access_token', '認証情報を確認できませんでした。')
  }
}

async function getAccessJwks(teamDomain: string) {
  if (cachedJwks?.teamDomain === teamDomain && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.keys
  }

  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    throw new HttpError(503, 'access_keys_unavailable', '認証サービスへ接続できませんでした。')
  }

  const body = await response.json<{ keys?: AccessJwk[] }>()

  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new HttpError(503, 'access_keys_unavailable', '認証サービスの公開鍵を取得できませんでした。')
  }

  cachedJwks = {
    teamDomain,
    expiresAt: Date.now() + jwksCacheTtlMs,
    keys: body.keys,
  }

  return body.keys
}

function isLocalRequest(request: Request, url: URL) {
  const connectingIp = request.headers.get('cf-connecting-ip')

  return url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || (
      !request.headers.has('cf-ray')
      && (!connectingIp || connectingIp === '127.0.0.1' || connectingIp === '::1')
    )
}

async function authenticate(request: Request, env: Env): Promise<Identity> {
  const url = new URL(request.url)

  if (isLocalRequest(request, url) && env.DEV_AUTH_BYPASS === 'true') {
    return { email: 'local@example.invalid', sub: 'local-development' }
  }

  const teamDomain = normalizeAccessTeamDomain(requireEnv(env, 'ACCESS_TEAM_DOMAIN'))
  const audience = requireEnv(env, 'ACCESS_AUD')
  const allowedEmail = requireEnv(env, 'ACCESS_ALLOWED_EMAIL').toLowerCase()
  const assertion = request.headers.get('cf-access-jwt-assertion')

  if (!assertion) {
    throw new HttpError(401, 'authentication_required', 'ログインが必要です。')
  }

  const parts = assertion.split('.')

  if (parts.length !== 3) {
    throw new HttpError(401, 'invalid_access_token', '認証情報を確認できませんでした。')
  }

  const header = parseJwtPart<AccessJwtHeader>(parts[0])
  const payload = parseJwtPart<AccessJwtPayload>(parts[1])

  if (header.alg !== 'RS256' || !header.kid) {
    throw new HttpError(401, 'invalid_access_token', '認証方式が正しくありません。')
  }

  let jwks = await getAccessJwks(teamDomain)
  let jwk = jwks.find(key => key.kid === header.kid)

  if (!jwk) {
    cachedJwks = undefined
    jwks = await getAccessJwks(teamDomain)
    jwk = jwks.find(key => key.kid === header.kid)
  }

  if (!jwk) {
    throw new HttpError(401, 'invalid_access_token', '認証用の公開鍵が見つかりませんでした。')
  }

  let verified = false

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
  } catch {
    throw new HttpError(401, 'invalid_access_token', '認証情報の署名を確認できませんでした。')
  }

  if (!verified) {
    throw new HttpError(401, 'invalid_access_token', '認証情報の署名が正しくありません。')
  }

  const now = Math.floor(Date.now() / 1000)
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  const email = payload.email?.toLowerCase()

  if (
    payload.iss !== teamDomain
    || !audiences.includes(audience)
    || typeof payload.exp !== 'number'
    || payload.exp <= now - accessClockSkewSeconds
    || (typeof payload.nbf === 'number' && payload.nbf > now + accessClockSkewSeconds)
    || (typeof payload.iat === 'number' && payload.iat > now + accessClockSkewSeconds)
    || payload.type !== 'app'
    || !payload.sub
    || !email
  ) {
    throw new HttpError(401, 'invalid_access_token', '認証情報の内容が正しくありません。')
  }

  if (email !== allowedEmail) {
    throw new HttpError(403, 'not_allowed', 'このアカウントには投稿権限がありません。')
  }

  return { email, sub: payload.sub }
}

function assertSameOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (origin !== expectedOrigin) {
    throw new HttpError(403, 'invalid_origin', 'この画面以外からは投稿できません。')
  }

  if (fetchSite && fetchSite !== 'same-origin') {
    throw new HttpError(403, 'cross_site_request', '別のサイトからの投稿は受け付けていません。')
  }
}

function getTokyoDateParts(date = new Date()): TokyoDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

function normalizeTitle(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim()
}

function createDescription(body: string) {
  const plainText = body
    .replace(/^::(?:youtube-embed|x-link-card)[^\n]*\n::\s*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return plainText.length > 140 ? `${plainText.slice(0, 139)}…` : plainText
}

function sanitizeMarkdownBody(body: string) {
  return body.replace(/</g, '&lt;')
}

function normalizeYouTubeUrl(value: string) {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return undefined
  }

  if (url.protocol !== 'https:') {
    return undefined
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  const pathParts = url.pathname.split('/').filter(Boolean)
  let videoId = ''

  if (hostname === 'youtu.be') {
    videoId = pathParts[0] || ''
  } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
    videoId = url.searchParams.get('v')
      || (['embed', 'shorts', 'live'].includes(pathParts[0]) ? pathParts[1] || '' : '')
  }

  return /^[a-zA-Z0-9_-]{11}$/.test(videoId)
    ? `https://www.youtube.com/watch?v=${videoId}`
    : undefined
}

function normalizeXPostUrl(value: string) {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return undefined
  }

  const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|mobile\.)/, '')
  const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/)

  if (url.protocol !== 'https:' || !['x.com', 'twitter.com'].includes(hostname) || !match) {
    return undefined
  }

  return `https://x.com/${match[1]}/status/${match[2]}`
}

function normalizeDraftBlocks(input: unknown): DraftBlock[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > maxBlockCount) {
    throw new HttpError(400, 'invalid_blocks', '本文の構成が正しくありません。')
  }

  const ids = new Set<string>()
  let textLength = 0
  let photoCount = 0
  let embedCount = 0
  let hasContent = false

  const blocks = input.map((value): DraftBlock => {
    if (!value || typeof value !== 'object') {
      throw new HttpError(400, 'invalid_blocks', '本文の構成が正しくありません。')
    }

    const candidate = value as Record<string, unknown>

    if (
      typeof candidate.id !== 'string'
      || !photoIdPattern.test(candidate.id)
      || ids.has(candidate.id)
      || typeof candidate.type !== 'string'
    ) {
      throw new HttpError(400, 'invalid_blocks', '本文の構成が正しくありません。')
    }

    ids.add(candidate.id)

    if (candidate.type === 'text') {
      if (typeof candidate.value !== 'string') {
        throw new HttpError(400, 'invalid_blocks', '本文の構成が正しくありません。')
      }

      const normalized = candidate.value.replace(/\r\n?/g, '\n').replace(/\0/g, '')
      textLength += normalized.length
      hasContent ||= Boolean(normalized.trim())
      return { id: candidate.id, type: 'text', value: normalized }
    }

    if (candidate.type === 'photo') {
      photoCount += 1
      hasContent = true
      return { id: candidate.id, type: 'photo' }
    }

    if (candidate.type === 'youtube' || candidate.type === 'x') {
      if (typeof candidate.url !== 'string') {
        throw new HttpError(400, 'invalid_embed_url', 'YouTubeまたはXの投稿URLを確認してください。')
      }

      const url = candidate.type === 'youtube'
        ? normalizeYouTubeUrl(candidate.url)
        : normalizeXPostUrl(candidate.url)

      if (!url) {
        throw new HttpError(400, 'invalid_embed_url', 'YouTubeまたはXの投稿URLを確認してください。')
      }

      embedCount += 1
      hasContent = true
      return { id: candidate.id, type: candidate.type, url }
    }

    throw new HttpError(400, 'invalid_blocks', '本文の構成が正しくありません。')
  })

  if (textLength > maxBodyLength) {
    throw new HttpError(400, 'body_too_long', `本文は${maxBodyLength.toLocaleString('ja-JP')}文字以内にしてください。`)
  }

  if (photoCount > maxPhotoCount) {
    throw new HttpError(400, 'too_many_photos', `写真は${maxPhotoCount}枚までです。`)
  }

  if (embedCount > maxEmbedCount) {
    throw new HttpError(400, 'invalid_embeds', `YouTube・Xの埋め込みは合計${maxEmbedCount}件までです。`)
  }

  if (!hasContent) {
    throw new HttpError(400, 'body_required', '本文または写真を追加してください。')
  }

  return blocks
}

function parseDraftBlocks(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.length > maxDraftDataLength) {
    throw new HttpError(400, 'invalid_blocks', '本文の構成が正しくありません。')
  }

  try {
    return normalizeDraftBlocks(JSON.parse(value))
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    throw new HttpError(400, 'invalid_blocks', '本文の構成が正しくありません。')
  }
}

function parseStoredContent(value: string) {
  try {
    const content = JSON.parse(value) as Partial<DraftContent>
    return normalizeDraftBlocks(content.blocks)
  } catch (error) {
    if (error instanceof HttpError) {
      throw new ConfigurationError('保存済みの日記データが壊れています。')
    }

    throw new ConfigurationError('保存済みの日記データを読み込めませんでした。')
  }
}

function getTokyoDateString(date = new Date()) {
  const parts = getTokyoDateParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function normalizeEntryDate(value: unknown) {
  if (typeof value !== 'string' || !entryDatePattern.test(value)) {
    throw new HttpError(400, 'invalid_entry_date', '日付を確認してください。')
  }

  const parsed = new Date(`${value}T00:00:00+09:00`)

  if (Number.isNaN(parsed.getTime()) || getTokyoDateString(parsed) !== value) {
    throw new HttpError(400, 'invalid_entry_date', '日付を確認してください。')
  }

  if (value > getTokyoDateString()) {
    throw new HttpError(400, 'future_entry_date', '未来の日記はまだ編集できません。')
  }

  return value
}

function createSlug(entryDate: string) {
  return entryDate
}

function createPublishedAt(entryDate: string) {
  return `${entryDate}T${String(publishHour).padStart(2, '0')}:00:00+09:00`
}

function createFallbackTitle(entryDate: string) {
  const [, month, day] = entryDate.split('-')
  return `${entryDate.slice(0, 4)}年${Number(month)}月${Number(day)}日の日記`
}

function getPublishCutoffMs(entryDate: string) {
  return new Date(createPublishedAt(entryDate)).getTime()
}

function isAfterPublishCutoff(entryDate: string, now = Date.now()) {
  return now >= getPublishCutoffMs(entryDate)
}

function isImageInfoWithDimensions(info: ImageInfoResponse): info is Extract<ImageInfoResponse, { width: number }> {
  return 'width' in info && 'height' in info && 'fileSize' in info
}

async function createPhotoBody(file: File) {
  const body = new Response(await file.arrayBuffer()).body

  if (!body) {
    throw new HttpError(400, 'invalid_photo', `${file.name || '写真'}を読み込めませんでした。`)
  }

  return body
}

async function validatePhoto(env: Env, file: File) {
  if (file.size <= 0 || file.size > maxPhotoSize) {
    throw new HttpError(400, 'invalid_photo_size', '写真は1枚10MB以下にしてください。')
  }

  let info: ImageInfoResponse

  try {
    info = await env.IMAGES.info(await createPhotoBody(file))
  } catch {
    throw new HttpError(400, 'invalid_photo', `${file.name || '写真'}を画像として読み込めませんでした。`)
  }

  if (!isImageInfoWithDimensions(info) || !allowedImageFormats.has(info.format.toLowerCase())) {
    throw new HttpError(400, 'unsupported_photo', 'JPEG、PNG、WebP、AVIFまたはHEICの写真を選んでください。')
  }

  if (info.width < 1 || info.height < 1 || info.width > 20_000 || info.height > 20_000) {
    throw new HttpError(400, 'invalid_photo_dimensions', '写真の縦横サイズが対応範囲外です。')
  }
}

async function transformPhoto(env: Env, file: File) {
  const result = await env.IMAGES.input(await createPhotoBody(file))
    .transform({ width: 1920, fit: 'scale-down' })
    .output({ format: 'image/webp', quality: 85, anim: false })
  return new Response(result.image()).arrayBuffer()
}

async function storeDraftPhoto(env: Env, file: File, key: string) {
  const webp = await transformPhoto(env, file)

  await env.DRAFT_BUCKET.put(key, webp, {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'private, no-store',
    },
  })
}

function createPublicMediaUrl(env: Env, key: string) {
  const baseUrl = normalizeBaseUrl(requireEnv(env, 'MEDIA_BASE_URL'))
  return `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }

  return btoa(binary)
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new TextDecoder().decode(bytes)
}

function createDiaryContent(blocks: DraftBlock[], photos: StoredPhoto[]) {
  const photosById = new Map(photos.map(photo => [photo.id, photo]))

  return blocks.map((block) => {
    if (block.type === 'text') {
      return sanitizeMarkdownBody(block.value.trim())
    }

    if (block.type === 'photo') {
      const photo = photosById.get(block.id)

      if (!photo) {
        throw new HttpError(500, 'missing_draft_photo', '下書き写真を確認できませんでした。')
      }

      return `![${photo.alt}](${photo.url})`
    }

    const component = block.type === 'youtube' ? 'youtube-embed' : 'x-link-card'
    return `::${component}{url="${block.url}"}\n::`
  }).filter(Boolean).join('\n\n')
}

function createMarkdown(params: {
  title: string
  description: string
  publishedAt: string
  content: string
}) {
  return [
    '---',
    `title: ${JSON.stringify(params.title)}`,
    `description: ${JSON.stringify(params.description)}`,
    `date: ${JSON.stringify(params.publishedAt)}`,
    '---',
    '',
    params.content,
    '',
  ].join('\n')
}

async function commitDiaryMarkdown(env: Env, slug: string, markdown: string) {
  const owner = requireEnv(env, 'GITHUB_OWNER')
  const repo = requireEnv(env, 'GITHUB_REPO')
  const branch = requireEnv(env, 'GITHUB_BRANCH')
  const token = requireEnv(env, 'GITHUB_TOKEN')
  const contentPath = `blog/content/diary/${slug}.md`
  const encodedPath = contentPath.split('/').map(encodeURIComponent).join('/')
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'ekurea-diary-publisher',
    'x-github-api-version': '2022-11-28',
  }
  const existingResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers })

  if (existingResponse.ok) {
    const existing = await existingResponse.json<GitHubFileResponse>()

    if (
      existing.type === 'file'
      && existing.encoding === 'base64'
      && typeof existing.content === 'string'
      && decodeBase64Utf8(existing.content) === markdown
    ) {
      return {
        content: { html_url: existing.html_url },
        commit: { sha: existing.sha },
      } satisfies GitHubContentResponse
    }

    throw new HttpError(409, 'github_content_conflict', '同じ日付の記事がすでに存在します。内容を確認してください。')
  }

  if (existingResponse.status !== 404) {
    const details = (await existingResponse.text()).slice(0, 1000)
    console.error(JSON.stringify({
      event: 'diary_github_lookup_failed',
      status: existingResponse.status,
      details,
    }))
    throw new HttpError(502, 'github_lookup_failed', 'GitHub上の記事状態を確認できませんでした。')
  }

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      ...headers,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      branch,
      message: `日記を追加: ${slug}`,
      content: encodeBase64Utf8(markdown),
    }),
  })

  if (!response.ok) {
    const details = (await response.text()).slice(0, 1000)
    console.error(JSON.stringify({
      event: 'diary_github_commit_failed',
      status: response.status,
      details,
    }))
    throw new HttpError(502, 'github_commit_failed', '日記をGitHubへ保存できませんでした。')
  }

  return response.json<GitHubContentResponse>()
}

async function getDiaryEntry(env: Env, entryDate: string) {
  return env.DB.prepare('SELECT * FROM diary_entries WHERE entry_date = ?1')
    .bind(entryDate)
    .first<DiaryEntryRow>()
}

async function getDiaryPhotos(env: Env, entryDate: string) {
  const result = await env.DB.prepare('SELECT * FROM diary_photos WHERE entry_date = ?1 ORDER BY created_at, id')
    .bind(entryDate)
    .all<DiaryPhotoRow>()
  return result.results
}

function entryBlocksForClient(env: Env, entry: DiaryEntryRow, blocks: DraftBlock[]) {
  let photoIndex = 0

  return blocks.map((block) => {
    if (block.type !== 'photo') {
      return block
    }

    const url = entry.status === 'published'
      ? createPublicMediaUrl(env, publicPhotoKey(entry.slug, photoIndex))
      : `/api/draft/photo/${encodeURIComponent(block.id)}?v=${entry.version}`
    photoIndex += 1
    return { ...block, url }
  })
}

async function createDraftState(env: Env, entryDate: string, now = Date.now()) {
  const entry = await getDiaryEntry(env, entryDate)
  const afterCutoff = isAfterPublishCutoff(entryDate, now)

  if (!entry) {
    return {
      entry: {
        exists: false,
        date: entryDate,
        title: '',
        blocks: [],
        ready: false,
        status: 'draft' as DiaryEntryStatus,
        version: 0,
        updatedAt: null,
        publishedAt: null,
        pageUrl: null,
        commitUrl: null,
        lastError: null,
        afterCutoff,
        canEdit: true,
        canManualPublish: false,
      },
      serverNow: new Date(now).toISOString(),
      today: getTokyoDateString(new Date(now)),
      cutoffAt: createPublishedAt(entryDate),
    }
  }

  const blocks = parseStoredContent(entry.content_json)
  const ready = entry.ready === 1 && entry.ready_version === entry.version

  return {
    entry: {
      exists: true,
      date: entry.entry_date,
      title: entry.title,
      blocks: entryBlocksForClient(env, entry, blocks),
      ready,
      status: entry.status,
      version: entry.version,
      updatedAt: entry.updated_at,
      publishedAt: entry.published_at,
      pageUrl: entry.page_url,
      commitUrl: entry.commit_url,
      lastError: entry.last_error,
      afterCutoff,
      canEdit: entry.status !== 'published' && entry.status !== 'publishing',
      canManualPublish: afterCutoff && ready && (entry.status === 'draft' || entry.status === 'failed'),
    },
    serverNow: new Date(now).toISOString(),
    today: getTokyoDateString(new Date(now)),
    cutoffAt: createPublishedAt(entryDate),
  }
}

async function getDraft(request: Request, env: Env) {
  const url = new URL(request.url)
  const entryDate = normalizeEntryDate(url.searchParams.get('date') || getTokyoDateString())
  return jsonResponse({ ok: true, ...await createDraftState(env, entryDate) })
}

async function getDraftPhoto(env: Env, id: string) {
  if (!photoIdPattern.test(id)) {
    throw new HttpError(404, 'photo_not_found', '写真が見つかりませんでした。')
  }

  const photo = await env.DB.prepare('SELECT object_key FROM diary_photos WHERE id = ?1')
    .bind(id)
    .first<Pick<DiaryPhotoRow, 'object_key'>>()

  if (!photo) {
    throw new HttpError(404, 'photo_not_found', '写真が見つかりませんでした。')
  }

  const object = await env.DRAFT_BUCKET.get(photo.object_key)

  if (!object || !('body' in object)) {
    throw new HttpError(404, 'photo_not_found', '写真が見つかりませんでした。')
  }

  return new Response(object.body, {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': object.httpMetadata?.contentType || 'image/webp',
      'x-content-type-options': 'nosniff',
    },
  })
}

function getFormString(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

async function saveDraft(request: Request, env: Env, identity: Identity) {
  assertSameOrigin(request)

  const contentType = request.headers.get('content-type') || ''

  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new HttpError(415, 'unsupported_content_type', '保存データの形式が正しくありません。')
  }

  const contentLength = Number(request.headers.get('content-length') || 0)

  if (contentLength > maxTotalPhotoSize + maxDraftDataLength + 1024 * 1024) {
    throw new HttpError(413, 'request_too_large', '保存データが大きすぎます。')
  }

  let formData: FormData

  try {
    formData = await request.formData()
  } catch {
    throw new HttpError(400, 'invalid_form_data', '保存データを読み込めませんでした。')
  }

  const entryDate = normalizeEntryDate(getFormString(formData, 'date'))
  const requestedVersion = Number(getFormString(formData, 'version'))
  const title = normalizeTitle(formData.get('title'))
  const blocks = parseDraftBlocks(formData.get('blocks'))
  const files = formData.getAll('photos').filter((value): value is File => value instanceof File && value.size > 0)
  const newPhotoIds = formData.getAll('photoIds').map(value => typeof value === 'string' ? value : '')

  if (!Number.isSafeInteger(requestedVersion) || requestedVersion < 0) {
    throw new HttpError(400, 'invalid_version', '下書きの版情報が正しくありません。')
  }

  if (title.length > maxTitleLength) {
    throw new HttpError(400, 'title_too_long', `タイトルは${maxTitleLength}文字以内にしてください。`)
  }

  if (files.length !== newPhotoIds.length || newPhotoIds.some(id => !photoIdPattern.test(id))) {
    throw new HttpError(400, 'invalid_photo_layout', '写真の保存情報が正しくありません。')
  }

  const uniqueNewPhotoIds = new Set(newPhotoIds)

  if (uniqueNewPhotoIds.size !== newPhotoIds.length) {
    throw new HttpError(400, 'invalid_photo_layout', '写真の保存情報が正しくありません。')
  }

  const totalPhotoSize = files.reduce((total, photo) => total + photo.size, 0)

  if (totalPhotoSize > maxTotalPhotoSize) {
    throw new HttpError(400, 'photos_too_large', '写真の合計サイズは30MB以下にしてください。')
  }

  const [existingEntry, existingPhotos] = await Promise.all([
    getDiaryEntry(env, entryDate),
    getDiaryPhotos(env, entryDate),
  ])

  if ((existingEntry?.version || 0) !== requestedVersion) {
    throw new HttpError(409, 'draft_conflict', '別の画面で下書きが更新されています。再読み込みしてください。')
  }

  if (existingEntry?.status === 'published') {
    throw new HttpError(409, 'already_published', '公開済みの日記はこの画面から変更できません。')
  }

  if (existingEntry?.status === 'publishing') {
    throw new HttpError(409, 'publish_in_progress', '公開処理中です。少し待ってから再読み込みしてください。')
  }

  const photoBlockIds = blocks.filter((block): block is DraftPhotoBlock => block.type === 'photo').map(block => block.id)
  const photoBlockIdSet = new Set(photoBlockIds)
  const existingPhotoById = new Map(existingPhotos.map(photo => [photo.id, photo]))

  if (
    newPhotoIds.some(id => !photoBlockIdSet.has(id) || existingPhotoById.has(id))
    || photoBlockIds.some(id => !existingPhotoById.has(id) && !uniqueNewPhotoIds.has(id))
  ) {
    throw new HttpError(400, 'invalid_photo_layout', '本文中の写真と保存する写真が一致しません。')
  }

  for (const file of files) {
    await validatePhoto(env, file)
  }

  const removedPhotos = existingPhotos.filter(photo => !photoBlockIdSet.has(photo.id))
  const now = new Date().toISOString()
  const newVersion = requestedVersion + 1
  const storedDraftKeys: string[] = []

  try {
    const newPhotoRows: DiaryPhotoRow[] = []

    for (const [index, file] of files.entries()) {
      const id = newPhotoIds[index]
      const key = `drafts/${entryDate}/${id}.webp`
      await storeDraftPhoto(env, file, key)
      storedDraftKeys.push(key)
      newPhotoRows.push({
        id,
        entry_date: entryDate,
        object_key: key,
        alt: `日記の写真 ${photoBlockIds.indexOf(id) + 1}`,
        created_at: now,
      })
    }

    const contentJson = JSON.stringify({ blocks } satisfies DraftContent)
    const statements: D1PreparedStatement[] = []

    if (existingEntry) {
      statements.push(env.DB.prepare([
        'UPDATE diary_entries SET title = ?1, content_json = ?2, ready = 0, ready_version = NULL, ready_at = NULL,',
        "status = 'draft', version = ?3, updated_at = ?4, publish_started_at = NULL, last_error = NULL",
        'WHERE entry_date = ?5',
      ].join(' ')).bind(title, contentJson, newVersion, now, entryDate))
    } else {
      statements.push(env.DB.prepare([
        'INSERT INTO diary_entries',
        '(entry_date, slug, title, content_json, ready, status, version, created_at, updated_at)',
        "VALUES (?1, ?2, ?3, ?4, 0, 'draft', 1, ?5, ?5)",
      ].join(' ')).bind(entryDate, createSlug(entryDate), title, contentJson, now))
    }

    for (const photo of removedPhotos) {
      statements.push(env.DB.prepare('DELETE FROM diary_photos WHERE id = ?1 AND entry_date = ?2').bind(photo.id, entryDate))
    }

    for (const photo of newPhotoRows) {
      statements.push(env.DB.prepare([
        'INSERT INTO diary_photos (id, entry_date, object_key, alt, created_at)',
        'VALUES (?1, ?2, ?3, ?4, ?5)',
      ].join(' ')).bind(photo.id, photo.entry_date, photo.object_key, photo.alt, photo.created_at))
    }

    await env.DB.batch(statements)
  } catch (error) {
    if (storedDraftKeys.length > 0) {
      await env.DRAFT_BUCKET.delete(storedDraftKeys)
    }
    throw error
  }

  if (removedPhotos.length > 0) {
    await env.DRAFT_BUCKET.delete(removedPhotos.map(photo => photo.object_key))
  }

  console.log(JSON.stringify({
    event: 'diary_draft_saved',
    actor: identity.email,
    subject: identity.sub,
    entryDate,
    version: newVersion,
    photoCount: photoBlockIds.length,
  }))

  return jsonResponse({
    ok: true,
    ...await createDraftState(env, entryDate),
    message: '下書きを保存しました。内容を直したため、公開OKはオフになっています。',
  })
}

function getDiscordWebhookUrl(env: Env) {
  const value = env.DISCORD_WEBHOOK_URL?.trim()

  if (!value) {
    return null
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new ConfigurationError('DISCORD_WEBHOOK_URL のURLが正しくありません。')
  }

  const allowedHosts = new Set([
    'discord.com',
    'discordapp.com',
    'ptb.discord.com',
    'canary.discord.com',
  ])

  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || !url.pathname.startsWith('/api/webhooks/')) {
    throw new ConfigurationError('DISCORD_WEBHOOK_URL はDiscordのHTTPS Webhook URLを指定してください。')
  }

  return url.toString()
}

async function notifyDiscordOfPublishedDiary(env: Env, title: string, pageUrl: string) {
  const webhookUrl = getDiscordWebhookUrl(env)

  if (!webhookUrl) {
    console.warn(JSON.stringify({
      event: 'diary_discord_notification_skipped',
      reason: 'webhook_not_configured',
    }))
    return false
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'ekurea-diary-publisher',
    },
    body: JSON.stringify({
      content: `${title}\n${pageUrl}`,
      allowed_mentions: { parse: [] },
    }),
  })

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500)
    throw new Error(`Discord webhook returned ${response.status}: ${details}`)
  }

  return true
}

async function readJsonObject(request: Request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_content_type', 'リクエストの形式が正しくありません。')
  }

  try {
    const value = await request.json<unknown>()

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid json object')
    }

    return value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'invalid_json', 'リクエストを読み込めませんでした。')
  }
}

async function updateDraftReady(request: Request, env: Env, identity: Identity) {
  assertSameOrigin(request)
  const input = await readJsonObject(request)
  const entryDate = normalizeEntryDate(input.date)
  const requestedVersion = input.version
  const ready = input.ready

  if (!Number.isSafeInteger(requestedVersion) || typeof ready !== 'boolean') {
    throw new HttpError(400, 'invalid_ready_state', '公開OKの状態を確認できませんでした。')
  }

  const entry = await getDiaryEntry(env, entryDate)

  if (!entry) {
    throw new HttpError(409, 'draft_not_saved', '先に下書きを保存してください。')
  }

  if (entry.version !== requestedVersion) {
    throw new HttpError(409, 'draft_conflict', '別の画面で下書きが更新されています。再読み込みしてください。')
  }

  if (entry.status === 'published') {
    throw new HttpError(409, 'already_published', 'この日記は公開済みです。')
  }

  if (entry.status === 'publishing') {
    throw new HttpError(409, 'publish_in_progress', '公開処理中です。少し待ってから再読み込みしてください。')
  }

  const now = new Date().toISOString()
  await env.DB.prepare([
    'UPDATE diary_entries SET ready = ?1, ready_version = ?2, ready_at = ?3, updated_at = ?4,',
    "status = CASE WHEN ?1 = 0 AND status = 'failed' THEN 'draft' ELSE status END,",
    'last_error = CASE WHEN ?1 = 0 THEN NULL ELSE last_error END WHERE entry_date = ?5',
  ].join(' ')).bind(ready ? 1 : 0, ready ? entry.version : null, ready ? now : null, now, entryDate).run()

  console.log(JSON.stringify({
    event: 'diary_ready_changed',
    actor: identity.email,
    subject: identity.sub,
    entryDate,
    ready,
    version: entry.version,
  }))

  return jsonResponse({
    ok: true,
    ...await createDraftState(env, entryDate),
    message: ready
      ? isAfterPublishCutoff(entryDate)
        ? '公開OKにしました。22時を過ぎているため、手動公開してください。'
        : '公開OKにしました。22時の自動公開対象です。'
      : '公開OKをオフにしました。',
  })
}

function publicPhotoKey(slug: string, index: number) {
  return `blog/diary/content/${slug}-${index + 1}.webp`
}

async function copyDraftPhotosForPublish(
  env: Env,
  entry: DiaryEntryRow,
  blocks: DraftBlock[],
  photoRows: DiaryPhotoRow[],
) {
  const rowById = new Map(photoRows.map(photo => [photo.id, photo]))
  const photoBlocks = blocks.filter((block): block is DraftPhotoBlock => block.type === 'photo')
  const storedPhotos: StoredPhoto[] = []

  for (const [index, block] of photoBlocks.entries()) {
    const row = rowById.get(block.id)

    if (!row) {
      throw new HttpError(500, 'missing_draft_photo', '下書き写真の情報を確認できませんでした。')
    }

    const key = publicPhotoKey(entry.slug, index)
    const draftObject = await env.DRAFT_BUCKET.get(row.object_key)

    if (draftObject && 'body' in draftObject) {
      await env.MEDIA_BUCKET.put(key, draftObject.body, {
        httpMetadata: {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      })
    } else if (!await env.MEDIA_BUCKET.head(key)) {
      throw new HttpError(500, 'missing_draft_photo', '下書き写真を読み込めませんでした。')
    }

    storedPhotos.push({
      id: block.id,
      key,
      url: createPublicMediaUrl(env, key),
      alt: `日記の写真 ${index + 1}`,
    })
  }

  return storedPhotos
}

function publishErrorMessage(error: unknown) {
  return error instanceof HttpError
    ? error.message
    : '公開処理に失敗しました。手動公開でもう一度お試しください。'
}

async function publishDiaryEntry(env: Env, entryDate: string, actor: string) {
  const entry = await getDiaryEntry(env, entryDate)

  if (!entry) {
    throw new HttpError(404, 'draft_not_found', '公開する下書きがありません。')
  }

  if (entry.status === 'published') {
    return entry
  }

  if (entry.ready !== 1 || entry.ready_version !== entry.version) {
    throw new HttpError(409, 'not_ready', '公開OKになっていません。')
  }

  if (
    entry.status === 'publishing'
    && entry.publish_started_at
    && Date.now() - new Date(entry.publish_started_at).getTime() < publishLeaseMs
  ) {
    throw new HttpError(409, 'publish_in_progress', 'すでに公開処理中です。')
  }

  const startedAt = new Date().toISOString()
  await env.DB.prepare([
    "UPDATE diary_entries SET status = 'publishing', publish_started_at = ?1, last_error = NULL",
    'WHERE entry_date = ?2',
  ].join(' ')).bind(startedAt, entryDate).run()

  try {
    const blocks = parseStoredContent(entry.content_json)
    const photoRows = await getDiaryPhotos(env, entryDate)
    const storedPhotos = await copyDraftPhotosForPublish(env, entry, blocks, photoRows)
    const title = entry.title || createFallbackTitle(entryDate)
    const content = createDiaryContent(blocks, storedPhotos)
    const description = createDescription(content) || title
    const markdown = createMarkdown({
      title,
      description,
      publishedAt: createPublishedAt(entryDate),
      content,
    })
    const github = await commitDiaryMarkdown(env, entry.slug, markdown)
    const pageUrl = `${normalizeBaseUrl(requireEnv(env, 'BLOG_BASE_URL'))}/diary/${entry.slug}`
    const publishedAt = new Date().toISOString()
    const commitUrl = github.commit?.html_url || github.content?.html_url || null
    const commitSha = github.commit?.sha || null

    await env.DB.prepare([
      "UPDATE diary_entries SET status = 'published', published_at = ?1, page_url = ?2,",
      'commit_url = ?3, commit_sha = ?4, publish_started_at = NULL, last_error = NULL',
      'WHERE entry_date = ?5',
    ].join(' ')).bind(publishedAt, pageUrl, commitUrl, commitSha, entryDate).run()

    let discordNotified = false

    try {
      discordNotified = await notifyDiscordOfPublishedDiary(env, title, pageUrl)
    } catch (notificationError) {
      console.error(JSON.stringify({
        event: 'diary_discord_notification_failed',
        entryDate,
        message: notificationError instanceof Error ? notificationError.message : 'Unknown error',
      }))
    }

    if (photoRows.length > 0) {
      try {
        await env.DRAFT_BUCKET.delete(photoRows.map(photo => photo.object_key))
      } catch (cleanupError) {
        console.error(JSON.stringify({
          event: 'diary_draft_photo_cleanup_failed',
          entryDate,
          message: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
        }))
      }
    }

    console.log(JSON.stringify({
      event: 'diary_published',
      actor,
      entryDate,
      slug: entry.slug,
      version: entry.version,
      photoCount: storedPhotos.length,
      commitSha,
      discordNotified,
    }))

    return await getDiaryEntry(env, entryDate) as DiaryEntryRow
  } catch (error) {
    const message = publishErrorMessage(error)

    try {
      await env.DB.prepare([
        "UPDATE diary_entries SET status = 'failed', publish_started_at = NULL, last_error = ?1",
        "WHERE entry_date = ?2 AND status = 'publishing'",
      ].join(' ')).bind(message, entryDate).run()
    } catch (statusError) {
      console.error(JSON.stringify({
        event: 'diary_publish_status_failed',
        entryDate,
        message: statusError instanceof Error ? statusError.message : 'Unknown error',
      }))
    }

    throw error
  }
}

async function publishDraftManually(request: Request, env: Env, identity: Identity) {
  assertSameOrigin(request)
  const input = await readJsonObject(request)
  const entryDate = normalizeEntryDate(input.date)

  if (!isAfterPublishCutoff(entryDate)) {
    throw new HttpError(409, 'before_publish_time', '手動公開は22時以降に利用できます。')
  }

  await publishDiaryEntry(env, entryDate, `manual:${identity.email}`)

  return jsonResponse({
    ok: true,
    ...await createDraftState(env, entryDate),
    message: '日記を公開しました。公開サイトの更新には少し時間がかかります。',
  })
}

function withAdminSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers)

  headers.set('cache-control', 'no-store')
  headers.set('content-security-policy', [
    "default-src 'none'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'frame-src https://www.youtube-nocookie.com https://platform.x.com https://platform.twitter.com',
    "img-src 'self' blob: data: https://blog.ekurea.net",
    "script-src 'self' https://platform.x.com https://platform.twitter.com",
    "style-src 'self'",
    "base-uri 'none'",
  ].join('; '))
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=()')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-frame-options', 'DENY')
  headers.set('x-robots-tag', 'noindex, nofollow')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    const isApiRequest = url.pathname.startsWith('/api/')

    try {
      const identity = await authenticate(request, env)

      if (url.pathname === '/api/draft' && request.method === 'GET') {
        return await getDraft(request, env)
      }

      if (url.pathname === '/api/draft/save' && request.method === 'POST') {
        return await saveDraft(request, env, identity)
      }

      if (url.pathname === '/api/draft/ready' && request.method === 'POST') {
        return await updateDraftReady(request, env, identity)
      }

      if (url.pathname === '/api/draft/publish' && request.method === 'POST') {
        return await publishDraftManually(request, env, identity)
      }

      const photoMatch = url.pathname.match(/^\/api\/draft\/photo\/([a-zA-Z0-9-]{1,64})$/)

      if (photoMatch && request.method === 'GET') {
        return await getDraftPhoto(env, photoMatch[1])
      }

      if (isApiRequest) {
        return jsonResponse({ ok: false, code: 'not_found', message: 'APIが見つかりませんでした。' }, 404)
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { allow: 'GET, HEAD' },
        })
      }

      return withAdminSecurityHeaders(await env.ASSETS.fetch(request))
    } catch (error) {
      console.error(JSON.stringify({
        event: 'diary_request_failed',
        host: url.hostname,
        path: url.pathname,
        status: error instanceof HttpError
          ? error.status
          : error instanceof ConfigurationError
            ? 503
            : 500,
        code: error instanceof HttpError ? error.code : undefined,
        message: error instanceof Error ? error.message : 'Unknown error',
      }))
      return errorResponse(error, isApiRequest)
    }
  },
  async scheduled(controller: ScheduledController, env: Env) {
    const entryDate = getTokyoDateString(new Date(controller.scheduledTime))
    const entry = await getDiaryEntry(env, entryDate)

    if (
      !entry
      || entry.status === 'published'
      || entry.ready !== 1
      || entry.ready_version !== entry.version
      || !entry.ready_at
      || new Date(entry.ready_at).getTime() > controller.scheduledTime
    ) {
      console.log(JSON.stringify({
        event: 'diary_schedule_skipped',
        entryDate,
        reason: !entry
          ? 'no_draft'
          : entry.status === 'published'
            ? 'already_published'
            : entry.ready_at && new Date(entry.ready_at).getTime() > controller.scheduledTime
              ? 'ready_after_cutoff'
              : 'not_ready',
      }))
      return
    }

    await publishDiaryEntry(env, entryDate, 'scheduled')
  },
} satisfies ExportedHandler<Env>
