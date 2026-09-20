<script setup lang="ts">
const props = defineProps<{
  url: string
}>()

function getVideoId(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    let videoId = ''

    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] || ''
    } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
      const pathParts = url.pathname.split('/').filter(Boolean)
      const firstPathPart = pathParts[0] || ''
      videoId = url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(firstPathPart) ? pathParts[1] || '' : '')
    }

    return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : ''
  } catch {
    return ''
  }
}

const videoId = computed(() => getVideoId(props.url))
const embedUrl = computed(() => videoId.value
  ? `https://www.youtube-nocookie.com/embed/${videoId.value}`
  : '')
const watchUrl = computed(() => videoId.value
  ? `https://www.youtube.com/watch?v=${videoId.value}`
  : '')
</script>

<template>
  <figure v-if="videoId" class="external-embed youtube-embed">
    <div class="youtube-embed-frame">
      <iframe
        :src="embedUrl"
        title="YouTube動画"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      />
    </div>
    <figcaption>
      <a :href="watchUrl" target="_blank" rel="noopener noreferrer">YouTubeで見る</a>
    </figcaption>
  </figure>
</template>
