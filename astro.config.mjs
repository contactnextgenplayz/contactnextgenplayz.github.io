// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// This project deploys to the ROOT of contactnextgenplayz.github.io
// (a GitHub "user/org page" repo, so no `base` path is needed).
// If you later connect a custom domain (e.g. nextgenplayz.com), just
// update `site` below and add a `public/CNAME` file with the domain.
export default defineConfig({
  site: 'https://contactnextgenplayz.github.io',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
