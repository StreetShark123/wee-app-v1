import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// For GitHub Pages set VITE_BASE_PATH="/REPO_NAME/". For Vercel leave unset.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // SW propio (injectManifest) para poder manejar `push`/`notificationclick`
      // (Web Push). El precache + runtimeCaching de imágenes se recrea en src/sw.ts.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff2}"]
      },
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
