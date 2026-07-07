type Env = {
  MEDIA_BUCKET: R2Bucket
  NEXTCLOUD_BASE_URL: string
  NEXTCLOUD_USERNAME: string
  NEXTCLOUD_APP_PASSWORD: string
  NEXTCLOUD_DAILY_DIR: string
  MEDIA_BASE_URL: string
  MANUAL_RUN_SECRET?: string
  WORKER_BASE_URL?: string
  PHOTO_SOURCE_BASE_URL?: string
  PHOTO_SOURCE_TOKEN?: string
  IMAGE_TRANSFORM_BASE_URL?: string
}

type PhotoRecord = {
  id?: number
  key?: string
  image?: string
  thumb?: string
  large?: string
  alt?: string
  date?: string
}

type ImageVariant = {
  key: string
  width: number
  quality: number
}

type PublishResult = {
  date: string
  status: 'published' | 'skipped' | 'not-found'
  message: string
}

const photosJsonKey = 'photos/photos.json'

function requireEnv(env: Env, name: keyof Env) {
  const value = env[name]

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value.trim()
}

function encodePath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function getTokyoDate(controller?: ScheduledController) {
  const date = controller?.scheduledTime ? new Date(controller.scheduledTime) : new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''

  return `${value('year')}-${value('month')}-${value('day')}`
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function createBasicAuth(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return `Basic ${btoa(binary)}`
}

function createNextcloudUrl(env: Env, date: string) {
  const baseUrl = requireEnv(env, 'NEXTCLOUD_BASE_URL').replace(/\/+$/, '')
  const username = requireEnv(env, 'NEXTCLOUD_USERNAME')
  const dailyDir = requireEnv(env, 'NEXTCLOUD_DAILY_DIR')

  return `${baseUrl}/remote.php/dav/files/${encodePath(username)}/${encodePath(dailyDir)}/${date}.png`
}

function createWorkerSourceUrl(env: Env, date: string, request?: Request) {
  const baseUrl = (
    env.PHOTO_SOURCE_BASE_URL ||
    env.WORKER_BASE_URL ||
    (request ? new URL(request.url).origin : '')
  ).replace(/\/+$/, '')

  if (!baseUrl) {
    throw new Error('Missing required environment variable: WORKER_BASE_URL')
  }

  return `${baseUrl}/source/${encodeURIComponent(requireEnv(env, 'PHOTO_SOURCE_TOKEN'))}/${date}.png`
}

async function fetchOriginalPhoto(env: Env, date: string) {
  const username = requireEnv(env, 'NEXTCLOUD_USERNAME')
  const appPassword = requireEnv(env, 'NEXTCLOUD_APP_PASSWORD')
  const sourceUrl = createNextcloudUrl(env, date)
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: 'image/png,image/*',
      Authorization: createBasicAuth(username, appPassword),
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok || !response.body) {
    throw new Error(`Nextcloud fetch failed for ${date}.png: ${response.status}`)
  }

  return response
}

async function fetchTransformedImage(env: Env, sourceUrl: string, variant: ImageVariant) {
  const response = await fetch(createTransformUrl(env, sourceUrl, variant), {
    headers: {
      Accept: 'image/webp',
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok || !response.body) {
    throw new Error(`Image transform failed for ${variant.key}: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''

  if (!contentType.toLowerCase().includes('image/webp')) {
    throw new Error(
      `Image transform did not produce WebP for ${variant.key}. Received content-type: ${contentType || 'unknown'}`,
    )
  }

  return response
}

function createTransformUrl(env: Env, sourceUrl: string, variant: ImageVariant) {
  const baseUrl = (env.IMAGE_TRANSFORM_BASE_URL || 'https://ekurea.net').replace(/\/+$/, '')
  const options = [`width=${variant.width}`, 'fit=scale-down', 'format=webp', `quality=${variant.quality}`].join(',')

  return `${baseUrl}/cdn-cgi/image/${options}/${sourceUrl}`
}

async function readPhotosJson(bucket: R2Bucket) {
  const object = await bucket.get(photosJsonKey)

  if (!object) {
    return []
  }

  const text = await object.text()

  if (!text.trim()) {
    return []
  }

  const photos = JSON.parse(text)

  if (!Array.isArray(photos)) {
    throw new Error(`${photosJsonKey} must contain an array.`)
  }

  return photos as PhotoRecord[]
}

function getSortValue(photo: PhotoRecord) {
  return photo.date || photo.key || photo.large || photo.thumb || photo.image || ''
}

function createPhotoId(date: string) {
  return Number(date.replaceAll('-', ''))
}

function upsertPhoto(photos: PhotoRecord[], photo: PhotoRecord) {
  const nextPhotos = photos.filter((item) => {
    if (photo.date && item.date === photo.date) {
      return false
    }

    return item.key !== photo.key
  })

  return [photo, ...nextPhotos]
    .sort((a, b) => getSortValue(b).localeCompare(getSortValue(a)))
    .map((item, index) => ({
      ...item,
      id: item.id || (item.date ? createPhotoId(item.date) : index + 1),
    }))
}

async function writePhotosJson(bucket: R2Bucket, photos: PhotoRecord[]) {
  await bucket.put(photosJsonKey, `${JSON.stringify(photos, null, 2)}\n`, {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=60',
    },
  })
}

async function publishDailyPhoto(
  env: Env,
  controller?: ScheduledController,
  dateOverride?: string,
  request?: Request,
): Promise<PublishResult> {
  const date = dateOverride || getTokyoDate(controller)
  const largeKey = `photos/${date}-large.webp`
  const thumbKey = `photos/${date}-thumb.webp`

  requireEnv(env, 'MEDIA_BASE_URL')

  if (await env.MEDIA_BUCKET.head(largeKey)) {
    const message = `${largeKey} already exists. Skipped.`
    console.log(message)
    return {
      date,
      status: 'skipped',
      message,
    }
  }

  const sourceUrl = createWorkerSourceUrl(env, date, request)

  const thumb = await fetchTransformedImage(env, sourceUrl, {
    key: thumbKey,
    width: 900,
    quality: 78,
  })

  if (!thumb) {
    const message = `${date}.png was not found in Nextcloud. Skipped.`
    console.log(message)
    return {
      date,
      status: 'not-found',
      message,
    }
  }

  await env.MEDIA_BUCKET.put(thumbKey, thumb.body, {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  const large = await fetchTransformedImage(env, sourceUrl, {
    key: largeKey,
    width: 1920,
    quality: 82,
  })

  if (!large) {
    throw new Error(`${date}.png disappeared before creating the large variant.`)
  }

  await env.MEDIA_BUCKET.put(largeKey, large.body, {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  const photos = await readPhotosJson(env.MEDIA_BUCKET)
  const nextPhotos = upsertPhoto(photos, {
    id: createPhotoId(date),
    key: `photos/${date}`,
    image: `${date}-thumb.webp`,
    alt: date.replaceAll('-', ' '),
    date,
  })

  await writePhotosJson(env.MEDIA_BUCKET, nextPhotos)
  const message = `Published ${date} to R2 and updated ${photosJsonKey}.`
  console.log(message)
  return {
    date,
    status: 'published',
    message,
  }
}

function authorizeManualRun(request: Request, env: Env) {
  const secret = env.MANUAL_RUN_SECRET

  if (!secret) {
    return false
  }

  return request.headers.get('Authorization') === `Bearer ${secret}`
}

function authorizeSourceToken(token: string, env: Env) {
  const secrets = [env.MANUAL_RUN_SECRET, env.PHOTO_SOURCE_TOKEN].filter(Boolean)

  if (secrets.length === 0) {
    return false
  }

  return secrets.includes(token)
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(publishDailyPhoto(env, controller))
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === '/run') {
      if (!authorizeManualRun(request, env)) {
        return new Response('Unauthorized', { status: 401 })
      }

      const date = url.searchParams.get('date')

      if (date && !isDateString(date)) {
        return new Response('Invalid date. Use yyyy-mm-dd.', { status: 400 })
      }

      let result: PublishResult

      try {
        result = await publishDailyPhoto(env, undefined, date || undefined, request)
      } catch (error) {
        return new Response(
          `${JSON.stringify(
            {
              date: date || getTokyoDate(),
              status: 'error',
              message: error instanceof Error ? error.message : 'Photo publish failed.',
            },
            null,
            2,
          )}\n`,
          {
            status: 500,
            headers: {
              'content-type': 'application/json; charset=utf-8',
            },
          },
        )
      }

      return new Response(`${JSON.stringify(result, null, 2)}\n`, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    }

    const sourceWithTokenMatch = url.pathname.match(/^\/source\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.png$/)

    if (sourceWithTokenMatch) {
      const isAuthorized = authorizeSourceToken(decodeURIComponent(sourceWithTokenMatch[1]), env)

      if (!isAuthorized) {
        return new Response('Unauthorized', { status: 401 })
      }

      const original = await fetchOriginalPhoto(env, sourceWithTokenMatch[2])

      if (!original) {
        return new Response('Not Found', { status: 404 })
      }

      return new Response(original.body, {
        status: 200,
        headers: {
          'content-type': original.headers.get('content-type') || 'image/png',
          'cache-control': 'no-store',
        },
      })
    }

    return new Response('Photo publisher worker is scheduled by Cron.', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  },
}
