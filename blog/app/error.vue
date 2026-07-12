<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const isNotFound = computed(() => props.error.statusCode === 404)

useSeoMeta({
  title: () => isNotFound.value ? '404 | ekurea.net' : 'Error | ekurea.net',
  robots: 'noindex, nofollow',
})

function returnToIndex() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <NuxtLayout>
    <section class="error-page">
      <div class="error-content">
        <img src="/favicon.png" alt="" class="error-icon">
        <p class="error-code">{{ error.statusCode }}</p>
        <h1>{{ isNotFound ? 'ページが見つかりません' : 'エラーが発生しました' }}</h1>
        <p class="error-message">
          {{ isNotFound
            ? 'URLが間違っているか、ページが移動した可能性があります。'
            : '時間をおいて、もう一度お試しください。' }}
        </p>
        <button type="button" class="error-back" @click="returnToIndex">
          <span aria-hidden="true">←</span>
          記事一覧へ戻る
        </button>
      </div>
    </section>
  </NuxtLayout>
</template>
