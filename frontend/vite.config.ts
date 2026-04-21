import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const phpServer = env.VITE_PHP_SERVER || 'http://localhost:8000'

  return {
    // Production: served from isosavi.com/test/TimeTrackingAppVue/
    base: mode === 'production' ? '/test/TimeTrackingAppVue/' : '/',

    plugins: [vue(), vueDevTools(), tailwindcss()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      proxy: {
        '/api': { target: phpServer, changeOrigin: true },
        '/validate_pin.php': { target: phpServer, changeOrigin: true },
        '/llm_proxy.php': { target: phpServer, changeOrigin: true },
      },
    },
  }
})
