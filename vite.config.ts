import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (command === 'build' && !env.VITE_MEDIA_BASE_URL) {
    throw new Error('VITE_MEDIA_BASE_URL is required for production builds.')
  }

  return {
    plugins: [vue(), tailwindcss(), cloudflare()],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }
})
