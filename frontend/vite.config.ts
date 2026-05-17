import { fileURLToPath, URL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { API_VERSION } from './src/config'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiServer = env.VITE_API_SERVER || 'http://localhost:8000'
  const appBase = mode === 'production' ? (env.VITE_APP_BASE || '/test/TimeTrackingAppVue/') : '/'

  function htaccessPlugin() {
    return {
      name: 'generate-htaccess',
      closeBundle() {
        const content = `Options -MultiViews

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase ${appBase}

  # Don't rewrite existing files or directories
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d

  # Route all other requests to Vue's index.html
  RewriteRule ^ ${appBase}index.html [L]
</IfModule>
`
        writeFileSync(resolve(__dirname, 'dist/.htaccess'), content)
      },
    }
  }

  return {
    base: appBase,

    plugins: [vue(), vueDevTools(), tailwindcss(), htaccessPlugin()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      proxy: {
        [API_VERSION]: { target: apiServer, changeOrigin: true },
      },
    },
  }
})
