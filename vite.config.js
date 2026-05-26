import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
  },
  // Preview / dev hosts are checked against this list. We tunnel the
  // preview through cloudflared (random *.trycloudflare.com domain) for
  // device testing. The Meta Display browser hits the public URL, not
  // localhost. Vercel preview deploys land under *.vercel.app.
  preview: {
    allowedHosts: ['.trycloudflare.com', '.vercel.app', 'localhost'],
  },
  server: {
    allowedHosts: ['.trycloudflare.com', '.vercel.app', 'localhost'],
  },
});
