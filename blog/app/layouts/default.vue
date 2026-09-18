<script setup lang="ts">
const route = useRoute()
const isDiary = computed(() => route.path === '/diary' || route.path.startsWith('/diary/'))
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

      <nav class="content-tabs" aria-label="ブログの表示切り替え">
        <div class="content-tabs-inner">
          <NuxtLink
            to="/"
            class="content-tab"
            :class="{ 'content-tab-active': !isDiary }"
            :aria-current="!isDiary ? 'page' : undefined"
          >
            記事
          </NuxtLink>
          <NuxtLink
            to="/diary"
            class="content-tab"
            :class="{ 'content-tab-active': isDiary }"
            :aria-current="isDiary ? 'page' : undefined"
          >
            日記
          </NuxtLink>
        </div>
      </nav>
    </header>

    <main>
      <slot />
    </main>
  </div>
</template>
