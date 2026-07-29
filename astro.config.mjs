import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Deployed to https://rwilson504.github.io/dxneoalumni.
// When a custom domain is added, set site to it and drop `base`.
export default defineConfig({
  site: 'https://rwilson504.github.io',
  base: '/dxneoalumni',
  trailingSlash: 'ignore',
  integrations: [react(), sitemap()],
});
