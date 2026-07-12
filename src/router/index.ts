import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/Home.vue'
import About from '@/pages/About.vue'
import Photo from '@/pages/Photo.vue'
import Links from '@/pages/Links.vue'
import NotFound from '@/pages/NotFound.vue'
import { getCanonicalUrl, getPageSeo, socialImageUrl } from '@/seo'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/about', name: 'about', component: About },
    { path: '/photo', name: 'photo', component: Photo },
    { path: '/links', name: 'links', component: Links },
    { path: '/404', name: 'not-found', component: NotFound },
    { path: '/:pathMatch(.*)*', component: NotFound },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const seo = getPageSeo(to.path)
  document.title = seo.title

  setMeta('name', 'description', seo.description)
  setMeta('property', 'og:title', seo.title)
  setMeta('property', 'og:description', seo.description)
  setMeta('property', 'og:type', 'website')
  setMeta('property', 'og:url', getCanonicalUrl(seo))
  setMeta('property', 'og:image', socialImageUrl)
  setMeta('property', 'og:image:alt', 'ekurea.net')
  setMeta('property', 'og:site_name', 'ekurea.net')
  setMeta('name', 'twitter:card', 'summary')
  setCanonical(getCanonicalUrl(seo))

  if (seo.noIndex) {
    setMeta('name', 'robots', 'noindex, nofollow')
  } else {
    document.head.querySelector('meta[name="robots"]')?.remove()
  }
})

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)

  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }

  element.content = content
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')

  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }

  element.href = href
}

export default router
