<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const resolveImageUrl = useBlogImageUrl()
const path = `/blog/${route.params.slug}`

const { data: post } = await useAsyncData(path, () => queryCollection('blog').path(path).first())

if (!post.value) {
  throw createError({ statusCode: 404, statusMessage: 'Article not found' })
}

const canonicalUrl = `${config.public.siteUrl}${path}`
const imageUrl = computed(() => resolveImageUrl(post.value?.image?.src))
const blogPostingJsonLd = computed(() => {
  const article = post.value

  if (!article) {
    return '{}'
  }

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.updated || article.date,
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
    ...(article.tags?.length ? { keywords: article.tags } : {}),
    ...(imageUrl.value ? { image: [imageUrl.value] } : {}),
  }).replaceAll('<', '\\u003c')
})

useSeoMeta({
  title: () => `${post.value?.title} | ekurea.net`,
  description: () => post.value?.description,
  ogTitle: () => post.value?.title,
  ogDescription: () => post.value?.description,
  ogType: 'article',
  ogUrl: canonicalUrl,
  ogImage: imageUrl,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: () => post.value?.image?.alt,
  articlePublishedTime: () => post.value?.date,
  articleModifiedTime: () => post.value?.updated || post.value?.date,
  twitterCard: () => imageUrl.value ? 'summary_large_image' : 'summary',
  twitterTitle: () => post.value?.title,
  twitterDescription: () => post.value?.description,
  twitterImage: imageUrl,
  twitterImageAlt: () => post.value?.image?.alt,
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl }],
  script: [{
    key: 'blog-posting-json-ld',
    type: 'application/ld+json',
    innerHTML: blogPostingJsonLd.value,
  }],
}))

const formattedDate = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(new Date(post.value.date))

const formattedUpdatedDate = computed(() => post.value?.updated
  ? new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(post.value.updated))
  : undefined)
</script>

<template>
  <article v-if="post" class="article-page">
    <header class="article-header">
      <div class="article-container">
        <NuxtLink to="/" class="text-link"><span aria-hidden="true">←</span> 記事一覧へ</NuxtLink>
        <div class="article-heading">
          <h1>{{ post.title }}</h1>
          <div class="article-meta">
            <div class="article-dates">
              <time :datetime="post.date">{{ formattedDate }}</time>
              <time v-if="post.updated" :datetime="post.updated">更新 {{ formattedUpdatedDate }}</time>
            </div>
            <ul v-if="post.tags?.length" class="tag-list" aria-label="Tags">
              <li v-for="tag in post.tags" :key="tag">{{ tag }}</li>
            </ul>
          </div>
        </div>
      </div>
    </header>

    <div class="article-container article-body">
      <img
        v-if="post.image"
        :src="imageUrl"
        :alt="post.image.alt"
        class="article-thumbnail"
        width="1200"
        height="630"
      >
      <ContentRenderer :value="post" />
    </div>
  </article>
</template>
