<script setup lang="ts">
type DiarySummary = {
  path: string
  title: string
  description: string
  date: string
}

defineProps<{
  entries: DiarySummary[]
}>()

const formatDate = (date: string) => new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(date))
</script>

<template>
  <div v-if="entries.length" class="diary-list">
    <article v-for="entry in entries" :key="entry.path" class="diary-row">
      <NuxtLink :to="entry.path" class="diary-link">
        <time :datetime="entry.date">{{ formatDate(entry.date) }}</time>
        <h2>{{ entry.title }}</h2>
        <p v-if="entry.description">{{ entry.description }}</p>
      </NuxtLink>
    </article>
  </div>
  <p v-else class="empty-message">日記はまだありません。</p>
</template>
