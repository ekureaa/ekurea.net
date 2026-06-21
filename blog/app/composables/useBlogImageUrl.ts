export function useBlogImageUrl() {
  const config = useRuntimeConfig()

  return (src?: string) => {
    if (!src) {
      return undefined
    }

    if (/^https?:\/\//i.test(src)) {
      return src
    }

    const imagePath = src.replace(/^\/+/, '')

    if (import.meta.dev) {
      return `/__blog-images/${imagePath}`
    }

    const productionImagePath = imagePath.replace(/\.(?:jpe?g|png|webp)$/i, '.webp')
    const mediaBaseUrl = config.public.mediaBaseUrl.replace(/\/+$/, '')

    if (!mediaBaseUrl) {
      throw new Error('VITE_MEDIA_BASE_URL is required to build blog image URLs.')
    }

    return `${mediaBaseUrl}/blog/${productionImagePath}`
  }
}
