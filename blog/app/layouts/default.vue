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
      <slot />
    </main>
  </div>
</template>
