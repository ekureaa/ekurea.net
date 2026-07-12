<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import eclairImage from '@/assets/eclair.png'
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-cream px-6 py-10">
    <section class="flex max-w-lg flex-col items-center text-center">
      <div class="grid size-32 place-items-center rounded-full bg-white/55 p-5 shadow-sm sm:size-40 sm:p-6">
        <img
          :src="eclairImage"
          alt="ekurea.net icon"
          class="size-full select-none object-contain drop-shadow-sm"
          draggable="false"
        />
      </div>

      <p class="mt-8 text-sm font-medium tracking-[0.25em] text-ink-soft">404</p>
      <h1 class="mt-3 text-3xl font-medium leading-tight text-ink sm:text-4xl">
        ページが見つかりません
      </h1>
      <p class="mt-5 leading-8 text-ink-soft">
        URLが間違っているか、ページが移動した可能性があります。
      </p>

      <RouterLink
        to="/"
        class="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm text-ink-soft shadow-sm transition hover:bg-brown-soft hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach"
      >
        <ArrowLeft :size="18" />
        ホームへ戻る
      </RouterLink>
    </section>
  </main>
</template>
