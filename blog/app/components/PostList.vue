<script setup lang="ts">
type PostSummary = {
  path: string
  title: string
  date: string
  tags?: string[]
}

defineProps<{
  posts: PostSummary[]
}>()

const formatDate = (date: string) => new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(new Date(date))
</script>

<template>
  <div class="post-list">
    <article v-for="post in posts" :key="post.path" class="post-row">
      <NuxtLink
        :to="post.path"
        class="post-link"
      >
        <div class="post-summary">
          <h2>{{ post.title }}</h2>
          <div class="post-meta">
            <time :datetime="post.date">{{ formatDate(post.date) }}</time>
            <ul v-if="post.tags?.length" class="tag-list" aria-label="Tags">
              <li v-for="tag in post.tags" :key="tag">{{ tag }}</li>
            </ul>
          </div>
        </div>
      </NuxtLink>
    </article>
  </div>
</template>
