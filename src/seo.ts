export const siteUrl = 'https://ekurea.net'
export const socialImageUrl = `${siteUrl}/icons/icon-512.png`

export type PageSeo = {
  title: string
  description: string
  canonicalPath: string
  noIndex?: boolean
}

const pages: Record<string, PageSeo> = {
  '/': {
    title: 'ekurea.net',
    description: 'エクレアのホームページ。VRChatのワールド制作や写真、ブログ、各種リンクをまとめています。',
    canonicalPath: '/',
  },
  '/about': {
    title: 'About | ekurea.net',
    description: 'ekureaのプロフィール。VRChatのワールド制作、アバター改変、音楽、ポーカーなどについて紹介しています。',
    canonicalPath: '/about',
  },
  '/photo': {
    title: 'Photo | ekurea.net',
    description: 'ekureaがVRChatで撮影した写真を掲載しています。',
    canonicalPath: '/photo',
  },
  '/links': {
    title: 'Links | ekurea.net',
    description: 'ekureaのVRChat、X、GitHub、メール、PGP鍵などのリンク集です。',
    canonicalPath: '/links',
  },
  '/404': {
    title: '404 | ekurea.net',
    description: 'お探しのページは見つかりませんでした。',
    canonicalPath: '/404',
    noIndex: true,
  },
}

export function normalizePathname(pathname: string) {
  if (pathname === '/') {
    return pathname
  }

  return pathname.replace(/\/+$/, '') || '/'
}

export function isKnownPage(pathname: string) {
  return normalizePathname(pathname) in pages
}

export function getPageSeo(pathname: string): PageSeo {
  return pages[normalizePathname(pathname)] || pages['/404']
}

export function getCanonicalUrl(seo: PageSeo) {
  return `${siteUrl}${seo.canonicalPath === '/' ? '' : seo.canonicalPath}`
}
