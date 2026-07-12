import { getCanonicalUrl, getPageSeo, isKnownPage, normalizePathname, socialImageUrl } from './seo'

const seoBlockPattern = /<!-- app-seo:start -->[\s\S]*?<!-- app-seo:end -->/

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createSeoBlock(pathname: string) {
  const seo = getPageSeo(pathname)
  const canonicalUrl = getCanonicalUrl(seo)
  const title = escapeHtml(seo.title)
  const description = escapeHtml(seo.description)

  return [
    '<!-- app-seo:start -->',
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${socialImageUrl}" />`,
    '<meta property="og:image:alt" content="ekurea.net" />',
    '<meta property="og:site_name" content="ekurea.net" />',
    '<meta name="twitter:card" content="summary" />',
    ...(seo.noIndex ? ['<meta name="robots" content="noindex, nofollow" />'] : []),
    '<!-- app-seo:end -->',
  ].join('\n    ')
}

function isPageRequest(request: Request, pathname: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }

  if (isKnownPage(pathname)) {
    return true
  }

  const lastSegment = pathname.split('/').pop() || ''
  if (lastSegment.includes('.')) {
    return false
  }

  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html') || accept === '' || accept === '*/*'
}

async function servePage(request: Request, env: Env, pathname: string) {
  const assetUrl = new URL('/index.html', request.url)
  const assetRequest = new Request(assetUrl, {
    headers: request.headers,
    method: 'GET',
  })
  const assetResponse = await env.ASSETS.fetch(assetRequest)

  if (!assetResponse.ok) {
    return assetResponse
  }

  const normalizedPathname = normalizePathname(pathname)
  const isNotFound = !isKnownPage(normalizedPathname) || normalizedPathname === '/404'
  const html = (await assetResponse.text()).replace(seoBlockPattern, createSeoBlock(normalizedPathname))
  const headers = new Headers(assetResponse.headers)

  headers.set('content-type', 'text/html; charset=utf-8')
  if (isNotFound) {
    headers.set('x-robots-tag', 'noindex, nofollow')
  }

  return new Response(request.method === 'HEAD' ? null : html, {
    status: isNotFound ? 404 : 200,
    headers,
  })
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

async function servePhotosJson(request: Request, env: Env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        allow: 'GET, HEAD',
      },
    })
  }

  const mediaBaseUrl = env.MEDIA_BASE_URL.replace(/\/+$/, '')
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

  return createJsonResponse(await sourceResponse.text(), sourceResponse)
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === '/photos/photos.json') {
      return servePhotosJson(request, env)
    }

    if (isPageRequest(request, url.pathname)) {
      return servePage(request, env, url.pathname)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
