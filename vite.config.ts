/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { routeEditorPlugin } from './src/dev/routeEditor/server/plugin';

/**
 * GitHub Pages serves a project site at https://<owner>.github.io/<repo>/,
 * so every asset URL needs the "/<repo>/" prefix. The repo name comes from
 * GITHUB_REPOSITORY in Actions, or from the local git remote. A
 * "<owner>.github.io" repository is served from the domain root instead.
 */
function pagesBase(): string {
  if (process.env.BASE_PATH) return process.env.BASE_PATH;
  let repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo) {
    try {
      const url = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      repo = url.trim().match(/[/:]([^/]+?)(?:\.git)?$/)?.[1];
    } catch {
      // No git remote: serve from the root.
    }
  }
  if (!repo || repo.toLowerCase().endsWith('.github.io')) return '/';
  return `/${repo}/`;
}

const base = pagesBase();

/**
 * Beta channel: the same code deployed from a separate "…-beta" repository
 * (its own path, so its service worker never touches the live app). It is
 * labelled "Beta" in the app, the home-screen name and the tab title.
 */
const isBeta = /beta/i.test(base);
const appName = isBeta ? 'AnyoneCanPace Beta' : 'AnyoneCanPace';

/**
 * Phone testing: GPS needs a secure page. `npm run dev:https` makes a
 * self-signed certificate (scripts/dev-cert.ts) and sets HTTPS_DEV. A tunnel
 * (Cloudflare Tunnel / ngrok) also works; its hosts are allowed below.
 */
const https =
  process.env.HTTPS_DEV && existsSync('.cache/dev-cert/cert.pem')
    ? { key: readFileSync('.cache/dev-cert/key.pem'), cert: readFileSync('.cache/dev-cert/cert.pem') }
    : undefined;
const allowedHosts = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'];

export default defineConfig({
  base,
  define: { __BETA__: JSON.stringify(isBeta) },
  plugins: [
    react(),
    // Dev only (`apply: 'serve'`): the route editor's file API for `?edit`. Never in a build.
    routeEditorPlugin(),
    {
      name: 'beta-title',
      transformIndexHtml: (html) => (isBeta ? html.replaceAll('>AnyoneCanPace<', `>${appName}<`).replace('content="AnyoneCanPace"', `content="${appName}"`) : html),
    },
    VitePWA({
      // Ask before swapping versions: an automatic reload could interrupt a
      // pacer mid-session. The app offers the update only when no session runs.
      registerType: 'prompt',
      // Icons are already precached by globPatterns below.
      includeManifestIcons: false,
      manifest: {
        name: appName,
        short_name: isBeta ? 'ACP Beta' : 'AnyoneCanPace',
        description: 'Run together. Walk together. A simple RUN/WALK interval timer for volunteer pacers.',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5F0E8',
        theme_color: '#1B3F72',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // .mjs: the MapLibre worker; .pbf: map label glyphs. The big street-map
        // file (.pmtiles) is not precached: the 6K mode saves it on demand.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,woff2,pbf}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { https, allowedHosts },
  preview: { https, allowedHosts },
  build: {
    // MapLibre is ~1 MB minified; it lives in its own lazy chunk (see scripts/check-bundle.ts).
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Keep the map libraries in a separate vendor chunk so its file name (and the
        // service worker's cached copy) survives app updates that don't touch them.
        codeSplitting: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/](maplibre-gl|pmtiles)[\\/]/ }],
        },
      },
    },
  },
  test: {
    // The on-disk transform cache doesn't notice new files matched by
    // import.meta.glob (e.g. a newly added route), so tests could silently skip it.
    // The suite is fast without it.
    fsModuleCache: false,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
