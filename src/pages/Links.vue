<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft, Copy, Download, Gift, KeyRound, Mail, X } from '@lucide/vue'
import { siGithub, siKeybase, siVrchat, siX } from 'simple-icons'

const pgpKeyUrl = '/pgp/ekurea.asc'
const pgpFingerprint = 'C155E125150D72438953DFD389F0CEE91E50408D'
const isPgpOpen = ref(false)
const pgpKey = ref('')
const pgpError = ref('')
const copied = ref(false)

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
    name: 'PGP Key',
    username: pgpFingerprint,
    url: pgpKeyUrl,
    action: 'pgp',
    icon: KeyRound,
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

async function openPgpKey() {
  isPgpOpen.value = true

  if (pgpKey.value || pgpError.value) return

  try {
    const response = await fetch(pgpKeyUrl)
    if (!response.ok) {
      throw new Error(`Failed to load PGP key: ${response.status}`)
    }
    pgpKey.value = await response.text()
  } catch {
    pgpError.value = 'Failed to load PGP key.'
  }
}

function closePgpKey() {
  isPgpOpen.value = false
}

async function copyPgpKey() {
  if (!pgpKey.value) return

  await navigator.clipboard.writeText(pgpKey.value)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1800)
}
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
        <component
          v-for="link in links"
          :is="link.action === 'pgp' ? 'button' : 'a'"
          :key="link.name"
          v-bind="link.action === 'pgp' ? { type: 'button' } : { href: link.url, target: '_blank', rel: 'noopener noreferrer' }"
          class="flex w-full items-center gap-4 rounded-lg bg-cream p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-brown-soft hover:shadow-md focus:outline-none focus:ring-2 focus:ring-peach"
          @click="link.action === 'pgp' && openPgpKey()"
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
        </component>
      </section>
    </div>

    <Teleport to="body">
      <Transition name="pgp-modal">
        <div
          v-if="isPgpOpen"
          class="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4 py-6"
          @click.self="closePgpKey"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pgp-key-title"
            class="flex max-h-[86dvh] w-full max-w-3xl flex-col rounded-lg bg-cream shadow-xl"
          >
            <header class="flex items-start justify-between gap-4 border-b border-brown-soft px-5 py-4">
              <div class="min-w-0">
                <h2 id="pgp-key-title" class="text-lg font-medium text-ink">PGP Key</h2>
                <p class="mt-1 break-all text-sm text-ink-soft">{{ pgpFingerprint }}</p>
              </div>
              <button
                type="button"
                class="grid size-10 shrink-0 place-items-center rounded-full bg-white text-ink-soft transition hover:bg-brown-soft hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach"
                aria-label="Close"
                @click="closePgpKey"
              >
                <X :size="20" />
              </button>
            </header>

            <div class="flex flex-wrap gap-3 border-b border-brown-soft px-5 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-ink-soft transition hover:bg-brown-soft hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach disabled:opacity-50"
                :disabled="!pgpKey"
                @click="copyPgpKey"
              >
                <Copy :size="16" />
                {{ copied ? 'Copied' : 'Copy' }}
              </button>
              <a
                :href="pgpKeyUrl"
                download="ekurea.asc"
                class="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-ink-soft transition hover:bg-brown-soft hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach"
              >
                <Download :size="16" />
                Download
              </a>
            </div>

            <div class="min-h-0 overflow-auto p-5">
              <p v-if="pgpError" class="text-sm text-ink-soft">{{ pgpError }}</p>
              <p v-else-if="!pgpKey" class="text-sm text-ink-soft">Loading...</p>
              <pre
                v-else
                class="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-4 font-mono text-xs leading-relaxed text-ink"
              >{{ pgpKey }}</pre>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style scoped>
.pgp-modal-enter-active,
.pgp-modal-leave-active {
  transition: opacity 260ms ease;
}

.pgp-modal-enter-active section,
.pgp-modal-leave-active section {
  transition:
    opacity 300ms ease,
    transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.pgp-modal-enter-from,
.pgp-modal-leave-to {
  opacity: 0;
}

.pgp-modal-enter-from section,
.pgp-modal-leave-to section {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .pgp-modal-enter-active,
  .pgp-modal-leave-active,
  .pgp-modal-enter-active section,
  .pgp-modal-leave-active section {
    transition-duration: 1ms;
  }
}
</style>
