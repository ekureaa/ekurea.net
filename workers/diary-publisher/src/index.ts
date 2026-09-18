type TextOptions = {
  font?: { url: string }
  color?: string
  size?: number
}

type TextImagesBinding = ImagesBinding & {
  text(content: string, options?: TextOptions): ImageTransformer
}

type Env = {
  ASSETS: Fetcher
  IMAGES: TextImagesBinding
  MEDIA_BUCKET: R2Bucket
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ACCESS_ALLOWED_EMAIL?: string
  GITHUB_TOKEN?: string
  GITHUB_OWNER: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
  BLOG_BASE_URL: string
  MEDIA_BASE_URL: string
  FAVICON_URL: string
  CARD_FONT_URL: string
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
  key: string
  url: string
  alt: string
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

function normalizeBody(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim()
}

function createDescription(body: string) {
  const plainText = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return plainText.length > 140 ? `${plainText.slice(0, 139)}…` : plainText
}

function sanitizeMarkdownBody(body: string) {
  return body.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function createSlug(parts: TokyoDateParts) {
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}${parts.second}-${randomPart}`
}

function createPublishedAt(parts: TokyoDateParts) {
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`
}

function createFallbackTitle(parts: TokyoDateParts) {
  return `${parts.year}年${Number(parts.month)}月${Number(parts.day)}日の日記`
}

function createCardDate(parts: TokyoDateParts) {
  return `${parts.year}.${parts.month}.${parts.day}`
}

function getTextWidthUnits(character: string) {
  return /^[\x00-\x7F]$/.test(character) ? 0.55 : 1
}

function splitTitleForCard(title: string) {
  const maxUnits = 13
  const maxLines = 3
  const characters = Array.from(title)
  const lines: string[] = []
  let currentLine = ''
  let currentUnits = 0

  while (characters.length > 0 && lines.length < maxLines) {
    const character = characters.shift() as string
    const units = getTextWidthUnits(character)

    if (currentLine && currentUnits + units > maxUnits) {
      lines.push(currentLine.trimEnd())
      currentLine = ''
      currentUnits = 0
    }

    currentLine += character
    currentUnits += units
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine.trimEnd())
  }

  if (characters.length > 0 && lines.length > 0) {
    const lastIndex = lines.length - 1
    lines[lastIndex] = `${lines[lastIndex].replace(/[、。，．\s]+$/u, '')}…`
  }

  return lines
}

async function createContentHash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .slice(0, 6)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createCardBaseSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">',
    '<rect width="1200" height="630" fill="#fffaf4"/>',
    '<circle cx="1120" cy="58" r="250" fill="#ffe8ec"/>',
    '<circle cx="1138" cy="42" r="166" fill="#ffd7c2" fill-opacity="0.7"/>',
    '<path d="M0 508C139 449 250 468 357 630H0Z" fill="#d9f0e7" fill-opacity="0.76"/>',
    '<circle cx="900" cy="690" r="235" fill="#eaded2" fill-opacity="0.38"/>',
    '</svg>',
  ].join('')
}

async function storeCardImage(
  env: Env,
  key: string,
  title: string,
  cardDate: string,
) {
  const faviconResponse = await fetch(requireEnv(env, 'FAVICON_URL'), {
    headers: { accept: 'image/png,image/*' },
  })

  if (!faviconResponse.ok || !faviconResponse.body) {
    throw new HttpError(502, 'favicon_unavailable', 'カード用のfaviconを取得できませんでした。')
  }

  const fontUrl = requireEnv(env, 'CARD_FONT_URL')
  const baseBody = new Response(createCardBaseSvg(), {
    headers: { 'content-type': 'image/svg+xml' },
  }).body

  if (!baseBody) {
    throw new Error('Failed to create card background stream.')
  }

  let card = env.IMAGES.input(baseBody)
    .draw(env.IMAGES.text(cardDate, {
      font: { url: fontUrl },
      color: '#756b6b',
      size: 34,
    }), { top: 72, left: 82 })

  const titleLines = splitTitleForCard(title)
  const lineHeight = 84
  const firstLineTop = 522 - titleLines.length * lineHeight

  titleLines.forEach((line, index) => {
    card = card.draw(env.IMAGES.text(line, {
      font: { url: fontUrl },
      color: '#3b3535',
      size: 68,
    }), { top: firstLineTop + index * lineHeight, left: 82 })
  })

  card = card.draw(
    env.IMAGES.input(faviconResponse.body).transform({
      width: 116,
      height: 116,
      fit: 'contain',
    }),
    { right: 68, bottom: 56 },
  )

  const result = await card.output({
    format: 'image/jpeg',
    quality: 88,
    background: '#fffaf4',
    anim: false,
  })

  await env.MEDIA_BUCKET.put(key, result.image(), {
    httpMetadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })
}

function isImageInfoWithDimensions(info: ImageInfoResponse): info is Extract<ImageInfoResponse, { width: number }> {
  return 'width' in info && 'height' in info && 'fileSize' in info
}

async function validatePhoto(env: Env, file: File) {
  if (file.size <= 0 || file.size > maxPhotoSize) {
    throw new HttpError(400, 'invalid_photo_size', '写真は1枚10MB以下にしてください。')
  }

  let info: ImageInfoResponse

  try {
    info = await env.IMAGES.info(file.stream())
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

async function storePhoto(env: Env, file: File, key: string) {
  const result = await env.IMAGES.input(file.stream())
    .transform({ width: 1920, fit: 'scale-down' })
    .output({ format: 'image/webp', quality: 85, anim: false })

  await env.MEDIA_BUCKET.put(key, result.image(), {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
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

function createMarkdown(params: {
  title: string
  description: string
  publishedAt: string
  cardUrl: string
  body: string
  photos: StoredPhoto[]
}) {
  const photoMarkdown = params.photos
    .map(photo => `![${photo.alt}](${photo.url})`)
    .join('\n\n')
  const content = [sanitizeMarkdownBody(params.body), photoMarkdown]
    .filter(Boolean)
    .join('\n\n')

  return [
    '---',
    `title: ${JSON.stringify(params.title)}`,
    `description: ${JSON.stringify(params.description)}`,
    `date: ${JSON.stringify(params.publishedAt)}`,
    'image:',
    `  src: ${JSON.stringify(params.cardUrl)}`,
    `  alt: ${JSON.stringify(`${params.title}のカード画像`)}`,
    '---',
    '',
    content,
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
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`, {
    method: 'PUT',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'ekurea-diary-publisher',
      'x-github-api-version': '2022-11-28',
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

async function deleteStoredObjects(env: Env, keys: string[]) {
  await Promise.all(keys.map(async (key) => {
    try {
      await env.MEDIA_BUCKET.delete(key)
    } catch (error) {
      console.error(JSON.stringify({
        event: 'diary_cleanup_failed',
        key,
        message: error instanceof Error ? error.message : 'Unknown error',
      }))
    }
  }))
}

async function publishDiary(request: Request, env: Env, identity: Identity) {
  assertSameOrigin(request)

  const contentType = request.headers.get('content-type') || ''

  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new HttpError(415, 'unsupported_content_type', '投稿データの形式が正しくありません。')
  }

  const contentLength = Number(request.headers.get('content-length') || 0)

  if (contentLength > maxTotalPhotoSize + maxBodyLength + 1024 * 1024) {
    throw new HttpError(413, 'request_too_large', '投稿データが大きすぎます。')
  }

  let formData: FormData

  try {
    formData = await request.formData()
  } catch {
    throw new HttpError(400, 'invalid_form_data', '投稿データを読み込めませんでした。')
  }

  const body = normalizeBody(formData.get('body'))
  const requestedTitle = normalizeTitle(formData.get('title'))
  const photos = formData.getAll('photos').filter((value): value is File => value instanceof File && value.size > 0)

  if (!body) {
    throw new HttpError(400, 'body_required', '本文を入力してください。')
  }

  if (body.length > maxBodyLength) {
    throw new HttpError(400, 'body_too_long', `本文は${maxBodyLength.toLocaleString('ja-JP')}文字以内にしてください。`)
  }

  if (requestedTitle.length > maxTitleLength) {
    throw new HttpError(400, 'title_too_long', `タイトルは${maxTitleLength}文字以内にしてください。`)
  }

  if (photos.length > maxPhotoCount) {
    throw new HttpError(400, 'too_many_photos', `写真は${maxPhotoCount}枚までです。`)
  }

  const totalPhotoSize = photos.reduce((total, photo) => total + photo.size, 0)

  if (totalPhotoSize > maxTotalPhotoSize) {
    throw new HttpError(400, 'photos_too_large', '写真の合計サイズは30MB以下にしてください。')
  }

  for (const photo of photos) {
    await validatePhoto(env, photo)
  }

  const dateParts = getTokyoDateParts()
  const title = requestedTitle || createFallbackTitle(dateParts)
  const slug = createSlug(dateParts)
  const publishedAt = createPublishedAt(dateParts)
  const description = createDescription(body)
  const contentHash = await createContentHash(`${title}\n${publishedAt}\n${body}`)
  const storedKeys: string[] = []

  try {
    const storedPhotos: StoredPhoto[] = []

    for (const [index, photo] of photos.entries()) {
      const key = `blog/diary/content/${slug}-${index + 1}.webp`
      await storePhoto(env, photo, key)
      storedKeys.push(key)
      storedPhotos.push({
        key,
        url: createPublicMediaUrl(env, key),
        alt: `日記の写真 ${index + 1}`,
      })
    }

    const cardKey = `blog/diary/og/${slug}-${contentHash}.jpg`
    await storeCardImage(env, cardKey, title, createCardDate(dateParts))
    storedKeys.push(cardKey)
    const cardUrl = createPublicMediaUrl(env, cardKey)
    const markdown = createMarkdown({
      title,
      description,
      publishedAt,
      cardUrl,
      body,
      photos: storedPhotos,
    })
    const github = await commitDiaryMarkdown(env, slug, markdown)
    const pageUrl = `${normalizeBaseUrl(requireEnv(env, 'BLOG_BASE_URL'))}/diary/${slug}`

    console.log(JSON.stringify({
      event: 'diary_published',
      actor: identity.email,
      subject: identity.sub,
      slug,
      photoCount: storedPhotos.length,
      objectKeys: storedKeys,
      commitSha: github.commit?.sha,
    }))

    return jsonResponse({
      ok: true,
      title,
      pageUrl,
      commitUrl: github.commit?.html_url,
      cardUrl,
      message: '日記を保存しました。公開サイトの更新には少し時間がかかります。',
    }, 201)
  } catch (error) {
    await deleteStoredObjects(env, storedKeys)
    throw error
  }
}

function withAdminSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers)

  headers.set('cache-control', 'no-store')
  headers.set('content-security-policy', [
    "default-src 'none'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' blob: data: https://blog.ekurea.net",
    "script-src 'self'",
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
    const isPublishRequest = url.pathname === '/api/publish'

    try {
      const identity = await authenticate(request, env)

      if (isPublishRequest) {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', {
            status: 405,
            headers: { allow: 'POST' },
          })
        }

        return await publishDiary(request, env, identity)
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
      return errorResponse(error, isPublishRequest)
    }
  },
} satisfies ExportedHandler<Env>
