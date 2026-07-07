type Env = {
  MEDIA_BASE_URL?: string
  VITE_MEDIA_BASE_URL?: string
}

function createJsonResponse(body: string, sourceResponse: Response) {
  const headers = new Headers(sourceResponse.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'public, max-age=60')
  headers.delete('access-control-allow-origin')

  return new Response(body, {
    status: sourceResponse.status,
    statusText: sourceResponse.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname !== '/photos/photos.json') {
      return new Response('Not found', { status: 404 })
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          allow: 'GET, HEAD',
        },
      })
    }

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

    if (request.method === 'HEAD') {
      return new Response(null, {
        status: sourceResponse.status,
        statusText: sourceResponse.statusText,
        headers: sourceResponse.headers,
      })
    }

    const body = await sourceResponse.text()

    return createJsonResponse(body, sourceResponse)
  },
} satisfies ExportedHandler<Env>
