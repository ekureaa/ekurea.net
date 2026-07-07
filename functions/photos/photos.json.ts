type Env = {
  MEDIA_BASE_URL?: string
  VITE_MEDIA_BASE_URL?: string
}

type PagesContext = {
  request: Request
  env: Env
}

export async function onRequestGet({ env }: PagesContext) {
  const mediaBaseUrl = (env.MEDIA_BASE_URL || env.VITE_MEDIA_BASE_URL || '').replace(/\/+$/, '')

  if (!mediaBaseUrl) {
    return new Response('MEDIA_BASE_URL is not configured.', { status: 500 })
  }

  const sourceResponse = await fetch(`${mediaBaseUrl}/photos/photos.json`, {
    headers: {
      accept: 'application/json',
    },
    cf: {
      cacheTtl: 60,
      cacheEverything: true,
    },
  })

  const headers = new Headers(sourceResponse.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'public, max-age=60')
  headers.delete('access-control-allow-origin')

  return new Response(sourceResponse.body, {
    status: sourceResponse.status,
    statusText: sourceResponse.statusText,
    headers,
  })
}

export function onRequestHead() {
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'public, max-age=60',
    },
  })
}
