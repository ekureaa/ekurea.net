import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useCloudflareRuntime = command === 'build' || mode === 'worker'

  if (command === 'build' && !env.VITE_MEDIA_BASE_URL) {
    throw new Error('VITE_MEDIA_BASE_URL is required for production builds.')
  }

  return {
    plugins: [
      vue(),
      tailwindcss(),
      ...(useCloudflareRuntime ? [cloudflare()] : []),
    ],
    server: {
      proxy: {
        '/photos/photos.json': {
          target: env.VITE_MEDIA_BASE_URL || 'https://media.ekurea.net',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }
})
