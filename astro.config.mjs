import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// The apex chapter domain is canonical. GitHub Pages redirects the www host to it.
export default defineConfig({
  site: 'https://neodeltachi.com',
  trailingSlash: 'ignore',
  integrations: [react(), sitemap()],
});
