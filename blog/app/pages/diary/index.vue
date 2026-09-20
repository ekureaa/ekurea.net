<script setup lang="ts">
const config = useRuntimeConfig()
const socialImageUrl = `${config.public.siteUrl}/diary-card.png`

const { data: entries } = await useAsyncData('all-diary-entries', () => queryCollection('diary')
  .order('date', 'DESC')
  .select('path', 'title', 'date')
  .all())

useSeoMeta({
  title: '日記 | ekurea.net',
  description: 'ekurea.net の日記。',
  ogTitle: '日記 | ekurea.net',
  ogDescription: 'ekurea.net の日記。',
  ogType: 'website',
  ogUrl: 'https://blog.ekurea.net/diary',
  ogImage: socialImageUrl,
  ogImageWidth: 600,
  ogImageHeight: 600,
  ogImageAlt: 'ekurea.net',
  twitterCard: 'summary',
  twitterImage: socialImageUrl,
  twitterImageAlt: 'ekurea.net',
})

useHead({
  link: [{ rel: 'canonical', href: 'https://blog.ekurea.net/diary' }],
})
</script>

<template>
  <section class="content-band page-top">
    <div class="page-container">
      <div class="section-heading">
        <div>
          <p class="eyebrow">DIARY</p>
          <h1 class="post-index-title">日記</h1>
        </div>
      </div>
      <DiaryList :entries="entries || []" />
    </div>
  </section>
</template>
