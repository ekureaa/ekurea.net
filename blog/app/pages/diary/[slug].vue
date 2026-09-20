<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const path = `/diary/${route.params.slug}`

const { data: entry } = await useAsyncData(path, () => queryCollection('diary').path(path).first())

if (!entry.value) {
  throw createError({ statusCode: 404, statusMessage: 'Diary entry not found' })
}

const canonicalUrl = `${config.public.siteUrl}${path}`
const socialImageUrl = `${config.public.siteUrl}/diary-card.png`
const blogPostingJsonLd = computed(() => {
  const diary = entry.value

  if (!diary) {
    return '{}'
  }

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: diary.title,
    description: diary.description,
    datePublished: diary.date,
    dateModified: diary.updated || diary.date,
    url: canonicalUrl,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    author: {
      '@type': 'Person',
      name: 'ekurea',
      url: 'https://ekurea.net/about',
    },
    inLanguage: 'ja-JP',
    image: [socialImageUrl],
  }).replaceAll('<', '\\u003c')
})

useSeoMeta({
  title: () => `${entry.value?.title} | ekurea.net`,
  description: () => entry.value?.description,
  ogTitle: () => entry.value?.title,
  ogDescription: () => entry.value?.description,
  ogType: 'article',
  ogUrl: canonicalUrl,
  ogImage: socialImageUrl,
  ogImageWidth: 600,
  ogImageHeight: 600,
  ogImageAlt: 'ekurea.net',
  articlePublishedTime: () => entry.value?.date,
  articleModifiedTime: () => entry.value?.updated || entry.value?.date,
  twitterCard: 'summary',
  twitterTitle: () => entry.value?.title,
  twitterDescription: () => entry.value?.description,
  twitterImage: socialImageUrl,
  twitterImageAlt: 'ekurea.net',
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl }],
  script: [{
    key: 'diary-posting-json-ld',
    type: 'application/ld+json',
    innerHTML: blogPostingJsonLd.value,
  }],
}))

const formattedDate = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(entry.value.date))

const formattedUpdatedDate = computed(() => entry.value?.updated
  ? new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(entry.value.updated))
  : undefined)
</script>

<template>
  <article v-if="entry" class="article-page diary-article">
    <header class="article-header">
      <div class="article-container">
        <NuxtLink to="/diary" class="text-link"><span aria-hidden="true">←</span> 日記一覧へ</NuxtLink>
        <div class="article-heading">
          <h1>{{ entry.title }}</h1>
          <div class="article-meta">
            <div class="article-dates">
              <time :datetime="entry.date">{{ formattedDate }}</time>
              <time v-if="entry.updated" :datetime="entry.updated">更新 {{ formattedUpdatedDate }}</time>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="article-container article-body">
      <ContentRenderer :value="entry" />
    </div>
  </article>
</template>
