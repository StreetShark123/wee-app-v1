import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// For GitHub Pages set VITE_BASE_PATH="/REPO_NAME/". For Vercel leave unset.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-temp.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Wee — club de lectura",
        short_name: "Wee",
        description: "Vuestro club de lectura: proponéis libros, votáis, leéis por capítulos y debatís sin spoilers.",
        lang: "es",
        dir: "ltr",
        theme_color: "#efe6d2",
        background_color: "#efe6d2",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["books", "education", "social"],
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Portadas de libros (Google Books / OpenLibrary / URLs pegadas): se
            // descargan UNA vez y se sirven de caché en adelante. Antes solo
            // dependían de la caché HTTP del navegador (se re-descargaban).
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "wee-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    rollupOptions: {
      output: {
        // Vendor estable en su propio chunk: el cambio de código de app no invalida su caché.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          // Iconografía (Phosphor) aparte: pesa (~26 kB gzip, 6 pesos por glifo)
          // y casi nunca cambia → cache-hit persistente entre deploys.
          icons: ["@phosphor-icons/react"]
        }
      }
    }
  }
});
