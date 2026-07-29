import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Served from https://www.richardawilson.com/dxneoalumni/ via a GitHub Pages custom
// domain. `site` must be the domain visitors actually land on: rwilson504.github.io
// 301s here, so pointing canonical URLs and the sitemap at it would advertise a
// redirect as the canonical address.
export default defineConfig({
  site: 'https://www.richardawilson.com',
  base: '/dxneoalumni',
  trailingSlash: 'ignore',
  integrations: [react(), sitemap()],
});
