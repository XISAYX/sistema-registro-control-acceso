import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const pwa = VitePWA({
  registerType: "autoUpdate",
  includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"],
  manifest: {
    name: "Registro Actopan",
    short_name: "Actopan",
    description: "Registro y validación QR de un solo uso para el evento en Actopan, Hidalgo.",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3efe4",
    theme_color: "#0e6a4a",
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
    globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), pwa, mode === "https" ? basicSsl() : null].filter(Boolean),
  resolve: {
    alias: {
      "@shared": path.resolve(root, "../shared"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  preview: { host: true, port: 4173 },
}));
