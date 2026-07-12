type Env = {
  MEDIA_BUCKET: R2Bucket
  SOURCE_BUCKET: R2Bucket
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

type RunTrigger = 'cron' | 'manual'
type RunPhase = 'started' | 'completed' | 'failed'
type RunStep = {
  at: string
  event: string
  details?: Record<string, unknown>
}
type RunDiagnostics = {
  runId: string
  date: string
  trigger: RunTrigger
  startedAt: string
  scheduledTime?: number
  steps: RunStep[]
}

const photosJsonKey = 'photos/photos.json'
const publisherStatusKey = 'photos/publisher-status.json'
const transformRetryDelaysMs = [10_000, 30_000, 60_000]

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

function createRunId() {
  return crypto.randomUUID()
}

function sanitizeRunId(value: string | null) {
  if (!value || !/^[a-zA-Z0-9-]{8,80}$/.test(value)) {
    return ''
  }

  return value
}

function redactPhotoSourceToken(value: string) {
  return value.replace(
    /\/source\/[^/]+\/(\d{4}-\d{2}-\d{2})(?:\/[a-zA-Z0-9-]+)?\.png/g,
    '/source/[redacted]/$1/[run-id].png',
  )
}

function getResponseLog(response: Response) {
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
    cfRay: response.headers.get('cf-ray'),
    cfCacheStatus: response.headers.get('cf-cache-status'),
    cfResized: response.headers.get('cf-resized'),
    warning: response.headers.get('warning'),
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetryableTransformResponse(response: Response) {
  if (response.status === 429 || response.status >= 500) {
    return true
  }

  const resized = response.headers.get('cf-resized') || ''

  return /\berr=(9504|9505|9510|9522|9529)\b/.test(resized)
}

function getOrigin(value: string) {
  return new URL(value).origin
}

function getOptionalOrigin(value: string) {
  return value ? getOrigin(value) : ''
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

function createTemporarySourceKey(date: string, runId: string) {
  return `photos/publisher-sources/${date}-${runId}.png`
}

function createWorkerSourceUrl(env: Env, date: string, runId: string, request?: Request) {
  const baseUrl = (env.WORKER_BASE_URL || (request ? new URL(request.url).origin : '')).replace(/\/+$/, '')

  if (!baseUrl) {
    throw new Error('Missing required environment variable: WORKER_BASE_URL')
  }

  return `${baseUrl}/source/${encodeURIComponent(requireEnv(env, 'PHOTO_SOURCE_TOKEN'))}/${date}/${encodeURIComponent(runId)}.png`
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

function getR2ObjectLog(object: R2Object) {
  return {
    size: object.size,
    etag: object.etag,
    uploaded: object.uploaded.toISOString(),
    contentType: object.httpMetadata?.contentType || null,
  }
}

async function fetchTransformedImage(
  env: Env,
  sourceUrl: string,
  variant: ImageVariant,
  run?: RunDiagnostics,
) {
  const transformUrl = createTransformUrl(env, sourceUrl, variant)
  const redactedSourceUrl = redactPhotoSourceToken(sourceUrl)
  const redactedTransformUrl = redactPhotoSourceToken(transformUrl)
  const details = {
    variant,
    sourceUrl: redactedSourceUrl,
    sourceOrigin: getOrigin(sourceUrl),
    transformUrl: redactedTransformUrl,
    transformOrigin: getOrigin(transformUrl),
  }
  const maxAttempts = transformRetryDelaysMs.length + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now()
    const attemptDetails = {
      ...details,
      attempt,
      maxAttempts,
    }

    logInfo('image_transform_started', {
      ...attemptDetails,
    })
    if (run) {
      await recordRunStep(env, run, 'image_transform_started', attemptDetails)
    }

    const response = await fetch(transformUrl, {
      headers: {
        Accept: 'image/webp',
      },
    })

    if (response.status === 404) {
      const responseDetails = {
        ...attemptDetails,
        elapsedMs: Date.now() - startedAt,
        response: getResponseLog(response),
      }
      logWarn('image_transform_not_found', {
        ...responseDetails,
      })
      if (run) {
        await recordRunStep(env, run, 'image_transform_not_found', responseDetails)
      }
      return null
    }

    if (!response.ok || !response.body) {
      const retryable = isRetryableTransformResponse(response)
      const retryDelayMs = retryable ? transformRetryDelaysMs[attempt - 1] : undefined
      const responseDetails = {
        ...attemptDetails,
        elapsedMs: Date.now() - startedAt,
        hasBody: Boolean(response.body),
        retryable,
        retryDelayMs,
        response: getResponseLog(response),
      }
      logError('image_transform_failed', {
        ...responseDetails,
      })
      if (run) {
        await recordRunStep(env, run, 'image_transform_failed', responseDetails)
      }

      if (retryable && retryDelayMs) {
        logWarn('image_transform_retry_scheduled', {
          ...attemptDetails,
          retryDelayMs,
        })
        if (run) {
          await recordRunStep(env, run, 'image_transform_retry_scheduled', {
            ...attemptDetails,
            retryDelayMs,
          })
        }
        await sleep(retryDelayMs)
        continue
      }

      throw new Error(`Image transform failed for ${variant.key}: ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''

    if (!contentType.toLowerCase().includes('image/webp')) {
      const responseDetails = {
        ...attemptDetails,
        elapsedMs: Date.now() - startedAt,
        expectedContentType: 'image/webp',
        response: getResponseLog(response),
      }
      logError('image_transform_unexpected_content_type', {
        ...responseDetails,
      })
      if (run) {
        await recordRunStep(env, run, 'image_transform_unexpected_content_type', responseDetails)
      }
      throw new Error(
        `Image transform did not produce WebP for ${variant.key}. Received content-type: ${contentType || 'unknown'}`,
      )
    }

    const responseDetails = {
      ...attemptDetails,
      elapsedMs: Date.now() - startedAt,
      response: getResponseLog(response),
    }
    logInfo('image_transform_succeeded', {
      ...responseDetails,
    })
    if (run) {
      await recordRunStep(env, run, 'image_transform_succeeded', responseDetails)
    }

    return response
  }

  throw new Error(`Image transform failed for ${variant.key}.`)
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

async function writePublisherStatus(
  env: Env,
  status: {
    date: string
    trigger: RunTrigger
    phase: RunPhase
    result?: PublishResult['status']
    message?: string
    scheduledTime?: number
    runId?: string
    startedAt?: string
    steps?: RunStep[]
  },
) {
  const body = `${JSON.stringify(
    {
      ...status,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`
  const runStatusKey = `photos/publisher-runs/${status.date}-${status.trigger}.json`
  const metadata = {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=60',
    },
  }

  await Promise.all([
    env.MEDIA_BUCKET.put(publisherStatusKey, body, metadata),
    env.MEDIA_BUCKET.put(runStatusKey, body, metadata),
  ])
}

async function safeWritePublisherStatus(
  env: Env,
  status: Parameters<typeof writePublisherStatus>[1],
) {
  try {
    await writePublisherStatus(env, status)
  } catch (error) {
    logError('publisher_status_write_failed', {
      date: status.date,
      trigger: status.trigger,
      phase: status.phase,
      message: getErrorMessage(error),
    })
  }
}

function createRunDiagnostics(date: string, trigger: RunTrigger, scheduledTime?: number): RunDiagnostics {
  return {
    runId: createRunId(),
    date,
    trigger,
    startedAt: new Date().toISOString(),
    scheduledTime,
    steps: [],
  }
}

async function recordRunStep(
  env: Env,
  run: RunDiagnostics,
  event: string,
  details?: Record<string, unknown>,
) {
  run.steps.push({
    at: new Date().toISOString(),
    event,
    details,
  })

  await safeWritePublisherStatus(env, {
    date: run.date,
    trigger: run.trigger,
    phase: 'started',
    scheduledTime: run.scheduledTime,
    runId: run.runId,
    startedAt: run.startedAt,
    steps: run.steps,
  })
}

async function writeSourceRequestStatus(
  env: Env,
  status: {
    date: string
    runId: string
    phase: RunPhase
    message?: string
    response?: Record<string, unknown>
  },
) {
  const body = `${JSON.stringify(
    {
      ...status,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`

  await env.MEDIA_BUCKET.put(`photos/publisher-source-runs/${status.date}-${status.runId}.json`, body, {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=60',
    },
  })
}

async function safeWriteSourceRequestStatus(
  env: Env,
  status: Parameters<typeof writeSourceRequestStatus>[1],
) {
  try {
    await writeSourceRequestStatus(env, status)
  } catch (error) {
    logError('source_request_status_write_failed', {
      date: status.date,
      runId: status.runId,
      phase: status.phase,
      message: getErrorMessage(error),
    })
  }
}

async function publishDailyPhoto(
  env: Env,
  controller?: ScheduledController,
  dateOverride?: string,
  request?: Request,
  run?: RunDiagnostics,
): Promise<PublishResult> {
  const date = dateOverride || getTokyoDate(controller)
  const largeKey = `photos/${date}-large.webp`
  const thumbKey = `photos/${date}-thumb.webp`

  requireEnv(env, 'MEDIA_BASE_URL')
  requireEnv(env, 'NEXTCLOUD_BASE_URL')
  requireEnv(env, 'NEXTCLOUD_USERNAME')
  requireEnv(env, 'NEXTCLOUD_APP_PASSWORD')
  requireEnv(env, 'NEXTCLOUD_DAILY_DIR')
  requireEnv(env, 'PHOTO_SOURCE_TOKEN')

  if (run) {
    await recordRunStep(env, run, 'publish_env_validated', {
      mediaOrigin: getOrigin(requireEnv(env, 'MEDIA_BASE_URL')),
      nextcloudOrigin: getOrigin(requireEnv(env, 'NEXTCLOUD_BASE_URL')),
      workerOrigin: getOptionalOrigin(env.WORKER_BASE_URL || (request ? new URL(request.url).origin : '')),
      transformOrigin: getOrigin(env.IMAGE_TRANSFORM_BASE_URL || 'https://ekurea.net'),
      hasManualRunSecret: Boolean(env.MANUAL_RUN_SECRET),
      hasPhotoSourceToken: Boolean(env.PHOTO_SOURCE_TOKEN),
    })
  }

  logInfo('photo_publish_started', {
    date,
    trigger: controller ? 'cron' : 'manual',
    largeKey,
    thumbKey,
    scheduledTime: controller?.scheduledTime,
  })
  if (run) {
    await recordRunStep(env, run, 'photo_publish_started', {
      largeKey,
      thumbKey,
      scheduledTime: controller?.scheduledTime,
    })
  }

  if (run) {
    await recordRunStep(env, run, 'r2_existing_check_started', {
      key: largeKey,
    })
  }

  const existingLarge = await env.MEDIA_BUCKET.head(largeKey)

  if (run) {
    await recordRunStep(env, run, 'r2_existing_check_completed', {
      key: largeKey,
      exists: Boolean(existingLarge),
      size: existingLarge?.size,
      etag: existingLarge?.etag,
      uploaded: existingLarge?.uploaded?.toISOString(),
    })
  }

  if (existingLarge) {
    const message = `${largeKey} already exists. Skipped.`
    logInfo('photo_publish_skipped_existing', {
      date,
      largeKey,
      message,
    })
    if (run) {
      await recordRunStep(env, run, 'photo_publish_skipped_existing', {
        key: largeKey,
        message,
      })
    }
    return {
      date,
      status: 'skipped',
      message,
    }
  }

  const sourceRunId = run?.runId || createRunId()
  const temporarySourceKey = createTemporarySourceKey(date, sourceRunId)
  let temporarySourceUploaded = false

  try {
    if (run) {
      await recordRunStep(env, run, 'nextcloud_fetch_started', getNextcloudLogDetails(env, date))
    }
    const original = await fetchOriginalPhoto(env, date)

    if (!original) {
      const message = `${date}.png was not found in Nextcloud. Skipped.`
      if (run) {
        await recordRunStep(env, run, 'photo_publish_skipped_not_found', { message })
      }
      return { date, status: 'not-found', message }
    }

    if (run) {
      await recordRunStep(env, run, 'nextcloud_fetch_succeeded', getResponseLog(original))
      await recordRunStep(env, run, 'temporary_source_put_started', {
        sourceRunId,
        contentType: original.headers.get('content-type') || 'image/png',
        contentLength: original.headers.get('content-length'),
      })
    }
    await env.SOURCE_BUCKET.put(temporarySourceKey, original.body, {
      httpMetadata: {
        contentType: original.headers.get('content-type') || 'image/png',
        cacheControl: 'no-store',
      },
    })
    temporarySourceUploaded = true
    if (run) {
      await recordRunStep(env, run, 'temporary_source_put_succeeded', { sourceRunId })
    }

    const sourceUrl = createWorkerSourceUrl(env, date, sourceRunId, request)
    if (run) {
      await recordRunStep(env, run, 'source_url_created', {
        sourceUrl: redactPhotoSourceToken(sourceUrl),
        sourceOrigin: getOrigin(sourceUrl),
        sourceRunStatusKey: `photos/publisher-source-runs/${date}-${sourceRunId}.json`,
      })
    }

    const thumb = await fetchTransformedImage(env, sourceUrl, {
      key: thumbKey,
      width: 900,
      quality: 78,
    }, run)
    if (!thumb) {
      throw new Error(`Temporary source image was not found for ${date}.png.`)
    }
    await env.MEDIA_BUCKET.put(thumbKey, thumb.body, {
      httpMetadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })
    if (run) {
      await recordRunStep(env, run, 'r2_put_succeeded', { key: thumbKey, contentType: 'image/webp' })
    }

    const large = await fetchTransformedImage(env, sourceUrl, {
      key: largeKey,
      width: 1920,
      quality: 82,
    }, run)
    if (!large) {
      throw new Error('Temporary source image disappeared before creating the large variant.')
    }
    await env.MEDIA_BUCKET.put(largeKey, large.body, {
      httpMetadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })
    if (run) {
      await recordRunStep(env, run, 'r2_put_succeeded', { key: largeKey, contentType: 'image/webp' })
      await recordRunStep(env, run, 'photos_json_read_started', { key: photosJsonKey })
    }

    const photos = await readPhotosJson(env.MEDIA_BUCKET)
    const nextPhotos = upsertPhoto(photos, {
      id: createPhotoId(date),
      key: `photos/${date}`,
      image: `${date}-thumb.webp`,
      alt: date.replaceAll('-', ' '),
      date,
    })
    if (run) {
      await recordRunStep(env, run, 'photos_json_write_started', {
        key: photosJsonKey,
        previousCount: photos.length,
        nextCount: nextPhotos.length,
      })
    }
    await writePhotosJson(env.MEDIA_BUCKET, nextPhotos)
    const message = `Published ${date} to R2 and updated ${photosJsonKey}.`
    if (run) {
      await recordRunStep(env, run, 'photo_publish_succeeded', {
        photosJsonKey,
        totalPhotos: nextPhotos.length,
        message,
      })
    }
    return { date, status: 'published', message }
  } finally {
    if (temporarySourceUploaded) {
      try {
        await env.SOURCE_BUCKET.delete(temporarySourceKey)
        if (run) {
          await recordRunStep(env, run, 'temporary_source_delete_succeeded', { sourceRunId })
        }
      } catch (error) {
        logError('temporary_source_delete_failed', {
          date,
          sourceRunId,
          message: getErrorMessage(error),
        })
        if (run) {
          await recordRunStep(env, run, 'temporary_source_delete_failed', {
            sourceRunId,
            message: getErrorMessage(error),
          })
        }
      }
    }
  }
}

async function runPublishDailyPhoto(
  env: Env,
  trigger: RunTrigger,
  controller?: ScheduledController,
  dateOverride?: string,
  request?: Request,
) {
  const date = dateOverride || getTokyoDate(controller)
  const run = createRunDiagnostics(date, trigger, controller?.scheduledTime)

  await safeWritePublisherStatus(env, {
    date,
    trigger,
    phase: 'started',
    scheduledTime: controller?.scheduledTime,
    runId: run.runId,
    startedAt: run.startedAt,
    steps: run.steps,
  })
  await recordRunStep(env, run, 'run_started', {
    date,
    trigger,
    scheduledTime: controller?.scheduledTime,
  })

  try {
    const result = await publishDailyPhoto(env, controller, date, request, run)
    await safeWritePublisherStatus(env, {
      date,
      trigger,
      phase: 'completed',
      result: result.status,
      message: result.message,
      scheduledTime: controller?.scheduledTime,
      runId: run.runId,
      startedAt: run.startedAt,
      steps: run.steps,
    })

    return result
  } catch (error) {
    await safeWritePublisherStatus(env, {
      date,
      trigger,
      phase: 'failed',
      message: getErrorMessage(error),
      scheduledTime: controller?.scheduledTime,
      runId: run.runId,
      startedAt: run.startedAt,
      steps: run.steps,
    })
    throw error
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
      runPublishDailyPhoto(env, 'cron', controller).catch((error) => {
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
        result = await runPublishDailyPhoto(env, 'manual', undefined, date || undefined, request)
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

    const sourceWithTokenMatch = url.pathname.match(
      /^\/source\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/([a-zA-Z0-9-]+)\.png$/,
    )

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

      const sourceDate = sourceWithTokenMatch[2]
      const sourceRunId = sanitizeRunId(sourceWithTokenMatch[3])

      if (!sourceRunId) {
        return new Response('Not Found', { status: 404 })
      }

      await safeWriteSourceRequestStatus(env, {
        date: sourceDate,
        runId: sourceRunId,
        phase: 'started',
        message: 'Image Transformations requested the temporary R2 source image.',
      })

      const original = await env.SOURCE_BUCKET.get(createTemporarySourceKey(sourceDate, sourceRunId))

      if (!original) {
        await safeWriteSourceRequestStatus(env, {
          date: sourceDate,
          runId: sourceRunId,
          phase: 'completed',
          message: 'Temporary R2 source image was not found.',
          response: {
            status: 404,
          },
        })
        return new Response('Not Found', { status: 404 })
      }

      await safeWriteSourceRequestStatus(env, {
        date: sourceDate,
        runId: sourceRunId,
        phase: 'completed',
        message: 'Temporary R2 source image was served to Image Transformations.',
        response: getR2ObjectLog(original),
      })

      return new Response(request.method === 'HEAD' ? null : original.body, {
        status: 200,
        headers: {
          'content-type': original.httpMetadata?.contentType || 'image/png',
          'content-length': String(original.size),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
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
