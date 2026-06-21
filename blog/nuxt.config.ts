import { resolve } from 'node:path'
import sirv from 'sirv'

const localBlogImagesDir = resolve('./assets/posts')

export default defineNuxtConfig({
  modules: ['@nuxt/content'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  app: {
    head: {
      htmlAttrs: { lang: 'ja' },
      meta: [
        { name: 'theme-color', content: '#fffaf4' },
        { name: 'color-scheme', content: 'light' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap',
        },
      ],
    },
  },
  runtimeConfig: {
    public: {
      siteUrl: 'https://blog.ekurea.net',
      mediaBaseUrl: process.env.VITE_MEDIA_BASE_URL || '',
    },
  },
  vite: {
    plugins: [
      {
        name: 'serve-local-blog-images',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/__blog-images', sirv(localBlogImagesDir, { dev: true }))
        },
      },
    ],
  },
  nitro: {
    prerender: {
      autoSubfolderIndex: false,
      crawlLinks: true,
      failOnError: true,
      routes: ['/', '/sitemap.xml'],
    },
  },
  routeRules: {
    '/**': { prerender: true },
  },
  compatibilityDate: '2026-06-21',
})
