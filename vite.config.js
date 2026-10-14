import { defineConfig } from 'vite';

// Время сборки: показывается внизу экрана, а version.json позволяет понять, что на сервере уже новее
const BUILD = new Date().toISOString();
const versionJson = () => ({ name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }); } });
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  define: { __BUILD__: JSON.stringify(BUILD) },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
  plugins: [
    versionJson(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.png', 'icons/apple-touch-icon.png'],
      workbox: { importScripts: ['push-sw.js'], globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff,woff2}'], navigateFallback: 'index.html' },
      manifest: {
        name: '«Митти юрак»: Навбат',
        short_name: 'Навбат',
        description: '«Митти юрак»: онлайн-запись на УЗИ',
        lang: 'ru', start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
        background_color: '#12050a', theme_color: '#12050a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
