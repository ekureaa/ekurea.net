<script setup lang="ts">
import { ArrowLeft, Gift, Mail } from '@lucide/vue'
import { siGithub, siKeybase, siVrchat, siX } from 'simple-icons'

const links = [
  {
    name: 'VRChat',
    username: 'ekureaa',
    url: 'https://vrchat.com/home/user/usr_e20c0da3-a465-42af-b4c6-7350f1cf3323',
    brandIcon: siVrchat,
  },
  {
    name: 'X',
    username: '@ekureaa_vrc',
    url: 'https://x.com/ekureaa_vrc',
    brandIcon: siX,
  },
  {
    name: 'Email',
    username: 'contact@ekurea.net',
    url: 'mailto:contact@ekurea.net',
    icon: Mail,
  },
  {
    name: 'GitHub',
    username: 'ekureaa',
    url: 'https://github.com/ekureaa',
    brandIcon: siGithub,
  },
  {
    name: 'Keybase',
    username: 'ekurea',
    url: 'https://keybase.io/ekurea',
    brandIcon: siKeybase,
  },
  {
    name: '干し芋',
    username: 'booth の欲しいものリスト',
    url: 'https://booth.pm/wish_list_names/drGTGnXm',
    icon: Gift,
  },
]
</script>

<template>
  <main class="min-h-dvh bg-cream">
    <div class="mx-auto max-w-3xl px-6 py-10 sm:px-10 sm:py-14">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-ink-soft shadow-sm transition hover:bg-brown-soft hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach"
      >
        <ArrowLeft :size="18" />
        Back
      </RouterLink>

      <header class="mt-10">
        <h1 class="text-4xl font-medium leading-tight text-ink sm:text-5xl">Links</h1>
      </header>

      <section class="mt-10 space-y-4">
        <a
          v-for="link in links"
          :key="link.name"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-4 rounded-lg bg-cream p-5 shadow-sm transition hover:-translate-y-0.5 hover:bg-brown-soft hover:shadow-md focus:outline-none focus:ring-2 focus:ring-peach"
        >
          <span class="grid size-12 shrink-0 place-items-center rounded-full bg-white text-ink">
            <svg
              v-if="link.brandIcon"
              class="size-6"
              viewBox="0 0 24 24"
              role="img"
              :aria-label="`${link.name} logo`"
              fill="currentColor"
            >
              <path :d="link.brandIcon.path" />
            </svg>
            <component v-else :is="link.icon" :size="24" />
          </span>
          <span class="min-w-0">
            <span class="block text-base font-medium text-ink">{{ link.name }}</span>
            <span class="block truncate text-sm text-ink-soft">{{ link.username }}</span>
          </span>
        </a>
      </section>
    </div>
  </main>
</template>
