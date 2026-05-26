import { defineConfig } from 'vite';

// On GitHub Pages we serve at https://<user>.github.io/metadis/, so all
// absolute asset paths must be prefixed with /metadis/. Other deploy
// targets (Vercel, Cloudflare Pages, custom domain, cloudflared tunnel)
// serve at root, so default to '/'.
const base = process.env.GITHUB_PAGES === '1' ? '/metadis/' : '/';

export default defineConfig({
  base,
  build: {
    target: 'es2020',
  },
  preview: {
    allowedHosts: ['.trycloudflare.com', '.vercel.app', '.github.io', 'localhost'],
  },
  server: {
    allowedHosts: ['.trycloudflare.com', '.vercel.app', '.github.io', 'localhost'],
  },
});
