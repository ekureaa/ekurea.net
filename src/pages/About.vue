<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import eclairImage from '@/assets/eclair.png'
</script>

<template>
  <main class="min-h-dvh bg-milk">
    <div class="mx-auto max-w-5xl px-6 py-10 sm:px-10 sm:py-14">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-2 rounded-full bg-cream px-4 py-2 text-sm text-ink-soft transition hover:bg-[#eaded2] hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach"
      >
        <ArrowLeft :size="18" />
        Back
      </RouterLink>

      <section class="mx-auto mt-10 flex max-w-3xl flex-col items-center">
        <h1 class="self-start text-4xl font-medium leading-tight text-ink sm:text-5xl">About</h1>

        <div class="mt-10 grid size-36 place-items-center rounded-full bg-white/55 p-5 shadow-sm sm:size-44 sm:p-6">
          <img
            :src="eclairImage"
            alt="ekurea.net icon"
            class="aspect-square w-full select-none object-contain drop-shadow-sm"
            draggable="false"
          />
        </div>

        <div class="mt-10 w-full rounded-lg bg-white/55 p-6 shadow-sm sm:p-8">
          <div class="space-y-5 text-base leading-8 text-ink-soft">
            <p>こんにちは！</p>
            <p>普段はVRChat のワールドを作ったり、アバターの写真を撮って遊んでます。</p>
            <p>でも大体は寝てます。いっしょに寝てくれる人を常に募集しています。</p>
          </div>

          <section class="mt-10">
            <h2 class="border-b border-ink/15 pb-3 text-2xl font-medium leading-tight text-ink">趣味</h2>
            <div class="mt-5 space-y-5 text-base leading-8 text-ink-soft">
              <div class="relative pl-5 before:absolute before:left-0 before:top-[0.85em] before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-peach">
                <h3 class="font-medium text-ink">改変</h3>
              </div>

              <div class="relative pl-5 before:absolute before:left-0 before:top-[0.85em] before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-peach">
                <h3 class="font-medium text-ink">音楽</h3>
                <p class="mt-1">サカナクション、くるり、おいしくるメロンパン、TK from 凛として時雨… などなど。</p>
              </div>

              <div class="relative pl-5 before:absolute before:left-0 before:top-[0.85em] before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-peach">
                <h3 class="font-medium text-ink">ポーカー</h3>
                <p class="mt-1">
                  たまに
                  <a
                    href="https://vrchat.com/home/group/grp_5529c266-3102-4cf7-9579-a6940a8d69a1"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-ink underline decoration-peach underline-offset-4 transition hover:opacity-70"
                  >
                    ポーカーのイベント
                  </a>
                  に参加させていただいてます。楽しいのでぜひ。
                </p>
              </div>

              <div class="relative pl-5 before:absolute before:left-0 before:top-[0.85em] before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-peach">
                <h3 class="font-medium text-ink">ゲーム</h3>
                <p class="mt-1">現在の積みリスト: 紅の砂漠、スルタンのゲーム</p>
              </div>
            </div>
          </section>

          <section class="mt-10">
            <h2 class="border-b border-ink/15 pb-3 text-2xl font-medium leading-tight text-ink">ワールド</h2>
            <div class="mt-5 space-y-4 text-base leading-8 text-ink-soft">
              <p class="relative pl-5 before:absolute before:left-0 before:top-[0.85em] before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-peach">
                定期的に更新したりしてます。良いところなので一回来てね。
                <a
                  href="https://vrchat.com/home/world/wrld_0943f225-a66d-4f80-b529-681e0971f00d/info"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block text-ink underline decoration-peach underline-offset-4 transition hover:opacity-70"
                >
                  彼方を望む - Yearning for the Beyond
                </a>
              </p>
            </div>
          </section>

          <section class="mt-10">
            <h2 class="border-b border-ink/15 pb-3 text-2xl font-medium leading-tight text-ink">その他</h2>
            <p class="relative mt-5 pl-5 text-base leading-8 text-ink-soft before:absolute before:left-0 before:top-[0.85em] before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-peach">こまどアバターはいいぞ！</p>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>
