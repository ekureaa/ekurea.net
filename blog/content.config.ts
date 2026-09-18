import { defineCollection, defineContentConfig } from '@nuxt/content'
import { z } from 'zod'

const imageSchema = z.object({
  src: z.string(),
  alt: z.string(),
})

const postSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.string(),
  updated: z.string().optional(),
  tags: z.array(z.string()).optional(),
  image: imageSchema.optional(),
})

export default defineContentConfig({
  collections: {
    blog: defineCollection({
      type: 'page',
      source: 'blog/*.md',
      schema: postSchema,
    }),
    diary: defineCollection({
      type: 'page',
      source: 'diary/*.md',
      schema: postSchema,
    }),
  },
})
