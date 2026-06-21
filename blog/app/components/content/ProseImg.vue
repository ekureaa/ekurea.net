<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
}>(), {
  src: '',
  alt: '',
})

const resolveImageUrl = useBlogImageUrl()
const imageUrl = computed(() => resolveImageUrl(props.src))
</script>

<template>
  <figure class="prose-image">
    <img
      v-bind="$attrs"
      :src="imageUrl"
      :alt="props.alt"
      :width="props.width"
      :height="props.height"
      loading="lazy"
      decoding="async"
    >
    <figcaption v-if="props.alt">{{ props.alt }}</figcaption>
  </figure>
</template>
