type Env = {
  MEDIA_BUCKET: R2Bucket
  NEXTCLOUD_BASE_URL: string
  NEXTCLOUD_USERNAME: string
  NEXTCLOUD_APP_PASSWORD: string
  NEXTCLOUD_DAILY_DIR: string
  MEDIA_BASE_URL: string
  MANUAL_RUN_SECRET?: string
  WORKER_BASE_URL?: string
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

function logInfo(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...details }))
}

function logWarn(event: string, details: Record<string, unknown>) {
  console.warn(JSON.stringify({ event, ...details }))
}

function logError(event: string, details: Record<string, unknown>) {
  console.error(JSON.stringify({ event, ...details }))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function redactPhotoSourceToken(value: string) {
  return value.replace(/\/source\/[^/]+\/(\d{4}-\d{2}-\d{2}\.png)/g, '/source/[redacted]/$1')
}

function getResponseLog(response: Response) {
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
    cfRay: response.headers.get('cf-ray'),
    cfCacheStatus: response.headers.get('cf-cache-status'),
  }
}

function getNextcloudLogDetails(env: Env, date: string) {
  return {
    date,
    origin: new URL(requireEnv(env, 'NEXTCLOUD_BASE_URL')).origin,
    filename: `${date}.png`,
  }
}

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
  const baseUrl = (env.WORKER_BASE_URL || (request ? new URL(request.url).origin : '')).replace(/\/+$/, '')

  if (!baseUrl) {
    throw new Error('Missing required environment variable: WORKER_BASE_URL')
  }

  return `${baseUrl}/source/${encodeURIComponent(requireEnv(env, 'PHOTO_SOURCE_TOKEN'))}/${date}.png`
}

async function fetchOriginalPhoto(env: Env, date: string) {
  const username = requireEnv(env, 'NEXTCLOUD_USERNAME')
  const appPassword = requireEnv(env, 'NEXTCLOUD_APP_PASSWORD')
  const sourceUrl = createNextcloudUrl(env, date)
  const logDetails = getNextcloudLogDetails(env, date)
  logInfo('nextcloud_fetch_started', {
    ...logDetails,
  })

  const response = await fetch(sourceUrl, {
    headers: {
      Accept: 'image/png,image/*',
      Authorization: createBasicAuth(username, appPassword),
    },
  })

  if (response.status === 404) {
    logWarn('nextcloud_fetch_not_found', {
      ...logDetails,
      ...getResponseLog(response),
    })
    return null
  }

  if (!response.ok || !response.body) {
    logError('nextcloud_fetch_failed', {
      ...logDetails,
      hasBody: Boolean(response.body),
      ...getResponseLog(response),
    })
    throw new Error(`Nextcloud fetch failed for ${date}.png: ${response.status}`)
  }

  logInfo('nextcloud_fetch_succeeded', {
    ...logDetails,
    ...getResponseLog(response),
  })

  return response
}

async function fetchTransformedImage(env: Env, sourceUrl: string, variant: ImageVariant) {
  const transformUrl = createTransformUrl(env, sourceUrl, variant)
  const redactedSourceUrl = redactPhotoSourceToken(sourceUrl)
  const redactedTransformUrl = redactPhotoSourceToken(transformUrl)

  logInfo('image_transform_started', {
    variant,
    sourceUrl: redactedSourceUrl,
    transformUrl: redactedTransformUrl,
  })

  const response = await fetch(transformUrl, {
    headers: {
      Accept: 'image/webp',
    },
  })

  if (response.status === 404) {
    logWarn('image_transform_not_found', {
      variant,
      sourceUrl: redactedSourceUrl,
      transformUrl: redactedTransformUrl,
      ...getResponseLog(response),
    })
    return null
  }

  if (!response.ok || !response.body) {
    logError('image_transform_failed', {
      variant,
      sourceUrl: redactedSourceUrl,
      transformUrl: redactedTransformUrl,
      hasBody: Boolean(response.body),
      ...getResponseLog(response),
    })
    throw new Error(`Image transform failed for ${variant.key}: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''

  if (!contentType.toLowerCase().includes('image/webp')) {
    logError('image_transform_unexpected_content_type', {
      variant,
      sourceUrl: redactedSourceUrl,
      transformUrl: redactedTransformUrl,
      expectedContentType: 'image/webp',
      ...getResponseLog(response),
    })
    throw new Error(
      `Image transform did not produce WebP for ${variant.key}. Received content-type: ${contentType || 'unknown'}`,
    )
  }

  logInfo('image_transform_succeeded', {
    variant,
    sourceUrl: redactedSourceUrl,
    transformUrl: redactedTransformUrl,
    ...getResponseLog(response),
  })

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
  logInfo('photo_publish_started', {
    date,
    trigger: controller ? 'cron' : 'manual',
    largeKey,
    thumbKey,
    scheduledTime: controller?.scheduledTime,
  })

  if (await env.MEDIA_BUCKET.head(largeKey)) {
    const message = `${largeKey} already exists. Skipped.`
    logInfo('photo_publish_skipped_existing', {
      date,
      largeKey,
      message,
    })
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
    logWarn('photo_publish_skipped_not_found', {
      date,
      sourceUrl: redactPhotoSourceToken(sourceUrl),
      message,
    })
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
  logInfo('r2_put_succeeded', {
    date,
    key: thumbKey,
    contentType: 'image/webp',
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
  logInfo('r2_put_succeeded', {
    date,
    key: largeKey,
    contentType: 'image/webp',
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
  logInfo('photo_publish_succeeded', {
    date,
    photosJsonKey,
    totalPhotos: nextPhotos.length,
    message,
  })
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
  const secrets = [env.PHOTO_SOURCE_TOKEN].filter(Boolean)

  if (secrets.length === 0) {
    return false
  }

  return secrets.includes(token)
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      publishDailyPhoto(env, controller).catch((error) => {
        logError('photo_publish_failed', {
          date: getTokyoDate(controller),
          trigger: 'cron',
          scheduledTime: controller.scheduledTime,
          message: getErrorMessage(error),
        })
        throw error
      }),
    )
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
        logError('photo_publish_failed', {
          date: date || getTokyoDate(),
          trigger: 'manual',
          message: getErrorMessage(error),
        })
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
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: {
            allow: 'GET, HEAD',
          },
        })
      }

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
