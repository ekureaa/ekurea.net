import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/Home.vue'
import About from '@/pages/About.vue'
import Photo from '@/pages/Photo.vue'
import Links from '@/pages/Links.vue'
import NotFound from '@/pages/NotFound.vue'

const siteTitle = 'ekurea.net'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: siteTitle } },
    { path: '/about', name: 'about', component: About, meta: { title: `About | ${siteTitle}` } },
    { path: '/photo', name: 'photo', component: Photo, meta: { title: `Photo | ${siteTitle}` } },
    { path: '/links', name: 'links', component: Links, meta: { title: `Links | ${siteTitle}` } },
    { path: '/404', name: 'not-found', component: NotFound, meta: { title: `404 | ${siteTitle}` } },
    { path: '/:pathMatch(.*)*', redirect: '/404' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = typeof to.meta.title === 'string' ? to.meta.title : siteTitle
})

export default router
