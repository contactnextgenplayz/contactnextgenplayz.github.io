// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// This project deploys to the ROOT of contactnextgenplayz.github.io
// (a GitHub "user/org page" repo, so no `base` path is needed).
// If you later connect a custom domain (e.g. nextgenplayz.com), just
// update `site` below (and `url` in src/lib/site.ts) and add a
// `public/CNAME` file with the domain.
export default defineConfig({
  site: 'https://contactnextgenplayz.github.io',
  integrations: [
    react(),
    // /latest-videos.json and the security.txt files are data, not pages.
    sitemap({ filter: (page) => !/\.(?:json|txt)$/i.test(page) }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // Dev server only: pre-bundle these React-island dependencies at startup.
    // Otherwise Vite discovers them on the first page load, re-bundles and
    // force-reloads the page ("504 Outdated Optimize Dep" in the console).
    optimizeDeps: {
      include: ['lucide-react', 'motion/react'],
    },
    build: {
      // Keep font files as real files. Vite would otherwise inline the small
      // (<4 KB) subsets as base64 `data:` URIs, which the CSP (`font-src
      // 'self'`) blocks — an error in every visitor's console — and which
      // bloat the render-blocking stylesheet with glyphs most pages never use.
      assetsInlineLimit: (filePath) => (/\.(?:woff2?|ttf|otf|eot)(?:[?#].*)?$/i.test(filePath) ? false : undefined),
    },
  },
});
