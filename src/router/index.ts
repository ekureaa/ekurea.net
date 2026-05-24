import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/Home.vue'
import About from '@/pages/About.vue'
import Photo from '@/pages/Photo.vue'
import Links from '@/pages/Links.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/about', name: 'about', component: About },
    { path: '/photo', name: 'photo', component: Photo },
    { path: '/links', name: 'links', component: Links },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
