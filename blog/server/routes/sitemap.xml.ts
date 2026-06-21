import { queryCollection } from '@nuxt/content/server'

const siteUrl = 'https://blog.ekurea.net'

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export default defineEventHandler(async (event) => {
  const posts = await queryCollection(event, 'blog')
    .select('path', 'date', 'updated')
    .order('date', 'DESC')
    .all()
  const latestDate = posts
    .map(post => post.updated || post.date)
    .sort((a, b) => b.localeCompare(a))[0]
  const urls = [
    { path: '/', lastmod: latestDate },
    ...posts.map(post => ({
      path: post.path,
      lastmod: post.updated || post.date,
    })),
  ]

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(({ path, lastmod }) => [
      '  <url>',
      `    <loc>${escapeXml(`${siteUrl}${path}`)}</loc>`,
      lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : '',
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
    '',
  ].join('\n')
})
