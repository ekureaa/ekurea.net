<script setup lang="ts">
const { data: posts } = await useAsyncData('all-posts', () => queryCollection('blog')
  .order('date', 'DESC')
  .select('path', 'title', 'description', 'date', 'tags', 'image')
  .all())

useSeoMeta({
  title: 'Blog | ekurea.net',
  description: 'ekurea.net のブログ。日々のことやWebについて書いています。',
  ogTitle: 'Blog | ekurea.net',
  ogDescription: 'ekurea.net のブログ。日々のことやWebについて書いています。',
  ogType: 'website',
  ogUrl: 'https://blog.ekurea.net',
  twitterCard: 'summary',
})

useHead({
  link: [{ rel: 'canonical', href: 'https://blog.ekurea.net' }],
})
</script>

<template>
  <section class="content-band page-top">
    <div class="page-container">
      <div class="section-heading">
        <div>
          <p class="eyebrow">ALL POSTS</p>
          <h1 class="post-index-title">記事一覧</h1>
        </div>
      </div>
      <PostList :posts="posts || []" />
    </div>
  </section>
</template>
