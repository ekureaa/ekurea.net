type Env = {
  SOURCE_ACCESS_TOKEN: string
  UPSTREAM_SOURCE_BASE_URL: string
  UPSTREAM_SOURCE_TOKEN: string
}

function requireEnv(env: Env, name: keyof Env) {
  const value = env[name]

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value.trim()
}

function isAuthorized(token: string, env: Env) {
  return token === requireEnv(env, 'SOURCE_ACCESS_TOKEN')
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/source\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.png$/)

    if (!match) {
      return new Response('Photo source worker.', {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
      })
    }

    if (!isAuthorized(decodeURIComponent(match[1]), env)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const upstreamBaseUrl = requireEnv(env, 'UPSTREAM_SOURCE_BASE_URL').replace(/\/+$/, '')
    const upstreamToken = encodeURIComponent(requireEnv(env, 'UPSTREAM_SOURCE_TOKEN'))
    const upstreamUrl = `${upstreamBaseUrl}/source/${upstreamToken}/${match[2]}.png`
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'image/png,image/*',
      },
    })

    if (!upstream.ok || !upstream.body) {
      return new Response(await upstream.text().catch(() => 'Upstream fetch failed.'), {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        },
      })
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'image/png',
        'cache-control': 'no-store',
      },
    })
  },
}
