<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, X } from '@lucide/vue'
import photosData from '@/data/photos.json'

type PhotoData = {
  id: number
  image: string
  alt: string
  date?: string
}

const localPhotoModules = import.meta.glob<string>('../assets/photos/generated/*', {
  eager: true,
  import: 'default',
  query: '?url',
})

const localPhotos = Object.fromEntries(
  Object.entries(localPhotoModules).map(([path, url]) => [
    path.replace(/^.*\/assets\/photos\//, ''),
    url,
  ]),
)

function resolvePhotoUrl(image: string) {
  if (image.startsWith('http') || image.startsWith('/')) {
    return image
  }

  return localPhotos[image] ?? ''
}

function resolveLargePhotoUrl(image: string) {
  if (image.startsWith('http') || image.startsWith('/')) {
    return image
  }

  const largeImage = image.replace(/-thumb(\.[a-z0-9]+)$/i, '-large$1')

  return localPhotos[largeImage] ?? localPhotos[image] ?? ''
}

const photos = (photosData as PhotoData[]).map((photo) => ({
  ...photo,
  url: resolvePhotoUrl(photo.image),
  largeUrl: resolveLargePhotoUrl(photo.image),
}))

type Photo = (typeof photos)[number]

const photosPerPage = 24
const selectedPhoto = ref<Photo | null>(null)
const visibleCount = ref(Math.min(photosPerPage, photos.length))
const loadMoreTrigger = ref<HTMLElement | null>(null)
const loadedPhotoIds = ref(new Set<number>())
const selectedPhotoUrl = computed(() => selectedPhoto.value?.largeUrl || selectedPhoto.value?.url || '')
const visiblePhotos = computed(() => photos.slice(0, visibleCount.value))
const hasMorePhotos = computed(() => visibleCount.value < photos.length)
let loadMoreObserver: IntersectionObserver | null = null

function isPhotoLoaded(photoId: number) {
  return loadedPhotoIds.value.has(photoId)
}

function markPhotoLoaded(photoId: number) {
  loadedPhotoIds.value = new Set(loadedPhotoIds.value).add(photoId)
}

function loadMorePhotos() {
  if (!hasMorePhotos.value) {
    return
  }

  visibleCount.value = Math.min(visibleCount.value + photosPerPage, photos.length)
}

function openPhoto(photo: Photo) {
  selectedPhoto.value = photo
}

function closePhoto() {
  selectedPhoto.value = null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closePhoto()
  }
}

watch(selectedPhoto, (photo) => {
  document.body.style.overflow = photo ? 'hidden' : ''
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)

  if (!loadMoreTrigger.value) {
    return
  }

  loadMoreObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        loadMorePhotos()
      }
    },
    {
      rootMargin: '600px 0px',
    },
  )

  loadMoreObserver.observe(loadMoreTrigger.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  loadMoreObserver?.disconnect()
  document.body.style.overflow = ''
})

watch(hasMorePhotos, (hasMore) => {
  if (!hasMore) {
    loadMoreObserver?.disconnect()
  }
})
</script>

<template>
  <main class="min-h-dvh bg-cream">
    <div class="mx-auto max-w-7xl px-6 py-10 sm:px-10 sm:py-14">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-ink-soft shadow-sm transition hover:bg-brown-soft hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach"
      >
        <ArrowLeft :size="18" />
        Back
      </RouterLink>

      <header class="mt-10 max-w-2xl">
        <h1 class="text-4xl font-medium leading-tight text-ink sm:text-5xl">Photo</h1>
      </header>

      <section class="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="photo in visiblePhotos"
          :key="photo.id"
          class="group overflow-hidden rounded-lg bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
        >
          <button
            type="button"
            class="relative block aspect-[3/4] w-full overflow-hidden bg-blush text-left focus:outline-none focus:ring-2 focus:ring-peach"
            @click="openPhoto(photo)"
          >
            <span
              class="photo-skeleton absolute inset-0 transition-opacity duration-500"
              :class="isPhotoLoaded(photo.id) ? 'opacity-0' : 'opacity-100'"
              aria-hidden="true"
            />
            <img
              :src="photo.url"
              :alt="photo.alt"
              loading="lazy"
              decoding="async"
              class="relative h-full w-full object-cover transition duration-500 group-hover:scale-105"
              :class="isPhotoLoaded(photo.id) ? 'opacity-100' : 'opacity-0'"
              @load="markPhotoLoaded(photo.id)"
              @error="markPhotoLoaded(photo.id)"
            />
          </button>
        </article>
      </section>

      <div
        v-if="hasMorePhotos"
        ref="loadMoreTrigger"
        class="h-16"
        aria-hidden="true"
      />
    </div>

    <Transition name="lightbox">
      <div
        v-if="selectedPhoto"
        class="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
        @click.self="closePhoto"
      >
        <button
          type="button"
          class="lightbox-close absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/12 text-white transition hover:bg-white/22 focus:outline-none sm:right-6 sm:top-6"
          aria-label="Close photo"
          @click="closePhoto"
        >
          <X :size="24" />
        </button>

        <img
          :src="selectedPhotoUrl"
          :alt="selectedPhoto.alt"
          class="lightbox-photo h-auto max-h-[calc(100dvh-6rem)] w-auto max-w-[calc(100vw-2rem)] select-none object-contain sm:max-h-[calc(100dvh-4rem)] sm:max-w-[calc(100vw-4rem)]"
          draggable="false"
          decoding="async"
        />
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.photo-skeleton {
  background:
    linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.42) 48%, transparent 66%),
    linear-gradient(180deg, #ffe8ec 0%, #fffdf9 100%);
  background-size: 220% 100%, 100% 100%;
  animation: photoSkeleton 1.6s ease-in-out infinite;
}

.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 360ms ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

.lightbox-photo,
.lightbox-close {
  transition:
    opacity 360ms ease,
    transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lightbox-enter-from .lightbox-photo,
.lightbox-leave-to .lightbox-photo {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

.lightbox-enter-from .lightbox-close,
.lightbox-leave-to .lightbox-close {
  opacity: 0;
  transform: translateY(-6px) scale(0.92);
}

@keyframes photoSkeleton {
  from {
    background-position: 160% 0, 0 0;
  }

  to {
    background-position: -60% 0, 0 0;
  }
}
</style>
