/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // Ask before swapping versions: an automatic reload could interrupt a
      // pacer mid-session. The app offers the update only when no session runs.
      registerType: 'prompt',
      manifest: {
        name: 'AnyoneCanPace',
        short_name: 'AnyoneCanPace',
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
