import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite config. Tailwind v4 is wired in via its official Vite plugin (no
// PostCSS/tailwind.config needed — the theme lives in src/index.css).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // serve on localhost so getUserMedia has a secure context
    port: 5173,
  },
});
