<script setup lang="ts">
const route = useRoute()
const isDiary = computed(() => route.path === '/diary' || route.path.startsWith('/diary/'))
const isContentIndex = computed(() => route.path === '/' || route.path === '/diary' || route.path === '/diary/')
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <div class="header-inner">
        <NuxtLink to="/" class="brand" aria-label="ekurea blog home">
          <img src="/favicon.png" alt="" class="brand-icon">
          <span>blog</span>
        </NuxtLink>

        <nav class="site-nav" aria-label="Main navigation">
          <a href="https://ekurea.net">ekurea.net に戻る</a>
        </nav>
      </div>
    </header>

    <main>
      <nav v-if="isContentIndex" class="content-switcher" aria-label="ブログの表示切り替え">
        <NuxtLink
          to="/"
          class="content-switch-button"
          :class="{ 'content-switch-button-active': !isDiary }"
          :aria-current="!isDiary ? 'page' : undefined"
        >
          記事
        </NuxtLink>
        <NuxtLink
          to="/diary"
          class="content-switch-button"
          :class="{ 'content-switch-button-active': isDiary }"
          :aria-current="isDiary ? 'page' : undefined"
        >
          日記
        </NuxtLink>
      </nav>

      <slot />
    </main>
  </div>
</template>
