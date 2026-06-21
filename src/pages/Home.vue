<script setup lang="ts">
import eclairImage from '@/assets/eclair.png'
import homeImage from '@/assets/home.webp'

const navLinks = [
  { to: '/about', label: 'About' },
  { to: '/photo', label: 'Photo' },
  { href: 'https://blog.ekurea.net', label: 'Blog' },
  { to: '/links', label: 'Links' },
]
</script>

<template>
  <main class="relative min-h-dvh select-none overflow-hidden bg-milk">
    <img
      :src="homeImage"
      alt="ekurea.net home background"
      draggable="false"
      class="photo-fade absolute inset-0 h-full w-full object-cover"
    />

    <section class="home-copy relative z-10 flex min-h-dvh flex-col px-6 py-8 text-white sm:px-10 sm:py-10">
      <div class="title-fade-up mt-auto max-w-3xl pb-64 sm:pb-80">
        <h1 class="text-6xl font-medium leading-tight sm:text-8xl">ekurea.net</h1>
      </div>

      <nav class="absolute bottom-8 left-6 flex flex-col gap-4 sm:left-10">
        <template v-for="link in navLinks" :key="link.to || link.href">
          <RouterLink
            v-if="link.to"
            :to="link.to"
            class="link-fade-up w-fit text-4xl font-normal leading-none transition hover:opacity-75 focus:outline-none sm:text-5xl"
          >
            {{ link.label }}
          </RouterLink>
          <a
            v-else-if="link.href"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            class="link-fade-up w-fit text-4xl font-normal leading-none transition hover:opacity-75 focus:outline-none sm:text-5xl"
          >
            {{ link.label }}
          </a>
        </template>
      </nav>

      <div class="icon-fade absolute bottom-5 right-5 grid size-24 place-items-center rounded-full bg-white/90 p-4 shadow-sm sm:bottom-8 sm:right-8 sm:size-32 sm:p-5">
        <img
          :src="eclairImage"
          alt="ekurea.net icon"
          draggable="false"
          class="size-full select-none object-contain"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.photo-fade {
  animation: photoFadeIn 2.4s ease-out both;
}

.title-fade-up {
  animation: contentFadeUp 1.4s ease-out 0.7s both;
}

.link-fade-up {
  animation: contentFadeUp 1.4s ease-out 1s both;
}

.icon-fade {
  animation: iconFadeIn 1.4s ease-out 1.15s both;
}

@media (orientation: portrait) {
  .home-copy {
    color: #4b4646;
  }
}

@keyframes photoFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes iconFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes contentFadeUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
