/**
 * Vite plugin for the dev-only route editor (`?edit` on `npm run dev`).
 * `apply: 'serve'`: it exists only on the dev server, never in `vite build`
 * or `vite preview`, so nothing here can reach the deployed app. It serves the
 * API in api.ts under /__route-editor/api/, behind the guard in guard.ts, one
 * request at a time (builds and writes never overlap).
 */
import { spawn } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { handleApi, MAX_GPX_BYTES, type ApiContext, type BuildOptions, type BuildResult } from './api';
import { EDITOR_HEADER, refuseRequest } from './guard';

export const API_PREFIX = '/__route-editor/api';

function runBuildScript(root: string, { offline, resetTurns }: BuildOptions): Promise<BuildResult> {
  const args = ['scripts/build-routes.ts', ...(offline ? ['--offline'] : []), ...(resetTurns ? ['--reset-turns'] : [])];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root });
    let log = '';
    child.stdout.on('data', (d: Buffer) => (log += d.toString()));
    child.stderr.on('data', (d: Buffer) => (log += d.toString()));
    child.on('error', (err) => resolve({ ok: false, log: `${log}\n${err.message}` }));
    child.on('close', (code) => resolve({ ok: code === 0, log: log.trim() }));
  });
}

function gitStatus(root: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => resolve([]));
    child.on('close', () => resolve(out.split('\n').filter(Boolean)));
  });
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_GPX_BYTES + 64 * 1024) {
        reject(new Error('Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : undefined);
      } catch {
        reject(new Error('The request body is not JSON.'));
      }
    });
    req.on('error', reject);
  });
}

export function routeEditorPlugin(): Plugin {
  let busy = false;
  return {
    name: 'anyonecanpace-route-editor',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      const ctx: ApiContext = { root, build: (o) => runBuildScript(root, o), today, gitStatus: () => gitStatus(root) };
      server.middlewares.use(API_PREFIX, (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const header = req.headers[EDITOR_HEADER];
        const refused = refuseRequest({
          method: req.method ?? 'GET',
          remoteAddress: req.socket.remoteAddress,
          host: req.headers.host,
          origin: req.headers.origin,
          editorHeader: Array.isArray(header) ? header[0] : header,
        });
        if (refused) return send(403, { errors: [refused] });
        if (req.method !== 'GET' && busy) return send(409, { errors: ['Another save or build is still running.'] });
        if (req.method !== 'GET') busy = true;
        void (async () => {
          try {
            const body = req.method === 'GET' ? undefined : await readBody(req);
            const path = (req.url ?? '/').split('?')[0];
            const { status, body: out } = await handleApi(ctx, req.method ?? 'GET', path, body);
            send(status, out);
          } catch (err) {
            send(400, { errors: [err instanceof Error ? err.message : String(err)] });
          } finally {
            if (req.method !== 'GET') busy = false;
          }
        })();
      });
    },
  };
}
