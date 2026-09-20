<script setup lang="ts">
const props = defineProps<{
  url: string
}>()

type XWidgetsWindow = Window & {
  twttr?: {
    widgets?: {
      load: (element?: HTMLElement) => Promise<unknown> | void
    }
  }
}

function getPost(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|mobile\.)/, '')

    if (!['x.com', 'twitter.com'].includes(hostname) || url.protocol !== 'https:') {
      return undefined
    }

    const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/)

    if (!match) {
      return undefined
    }

    return {
      account: match[1],
      url: `https://x.com/${match[1]}/status/${match[2]}`,
    }
  } catch {
    return undefined
  }
}

const post = computed(() => getPost(props.url))
const embedRoot = useTemplateRef<HTMLElement>('embed-root')

function renderPost() {
  const widgets = (window as XWidgetsWindow).twttr?.widgets

  if (widgets && embedRoot.value) {
    void widgets.load(embedRoot.value)
  }
}

onMounted(() => {
  const existingScript = document.querySelector<HTMLScriptElement>('script[data-x-widgets]')

  if ((window as XWidgetsWindow).twttr?.widgets) {
    renderPost()
    return
  }

  if (existingScript) {
    existingScript.addEventListener('load', renderPost, { once: true })
    return
  }

  const script = document.createElement('script')
  script.src = 'https://platform.x.com/widgets.js'
  script.async = true
  script.charset = 'utf-8'
  script.dataset.xWidgets = 'true'
  script.addEventListener('load', renderPost, { once: true })
  document.head.append(script)
})
</script>

<template>
  <div v-if="post" ref="embed-root" class="external-embed x-post-embed">
    <blockquote
      class="twitter-tweet"
      data-dnt="true"
      data-theme="light"
      data-lang="ja"
    >
      <a :href="post.url" target="_blank" rel="noopener noreferrer">@{{ post.account }} の投稿をXで見る</a>
    </blockquote>
  </div>
</template>
