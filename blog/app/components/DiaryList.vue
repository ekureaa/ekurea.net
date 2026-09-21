<script setup lang="ts">
type DiarySummary = {
  path: string
  title: string
  date: string
}

defineProps<{
  entries: DiarySummary[]
}>()

const formatDate = (date: string) => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(new Date(date))
</script>

<template>
  <div v-if="entries.length" class="post-list">
    <article v-for="entry in entries" :key="entry.path" class="post-row">
      <NuxtLink :to="entry.path" class="post-link">
        <div class="post-summary">
          <h2>{{ entry.title }}</h2>
          <div class="post-meta">
            <time :datetime="entry.date">{{ formatDate(entry.date) }}</time>
          </div>
        </div>
      </NuxtLink>
    </article>
  </div>
  <p v-else class="empty-message">日記はまだありません。</p>
</template>
