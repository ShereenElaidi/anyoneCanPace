/**
 * Who may use the route editor's file-writing API: only a browser on this
 * computer, on the dev server's own page. `npm run dev:https` listens on the
 * network (--host) and tunnels (Cloudflare, ngrok) forward to localhost, so
 * the remote address alone isn't enough: the Host header must be a loopback
 * name too (a tunnel or a LAN request carries another host), writes must come
 * from a page on that same host (Origin), and every request must carry the
 * editor's own header, which a page on another site can't send without a
 * CORS preflight that this API never answers.
 * Pure: takes the request facts, returns why it's refused or null.
 */

export const EDITOR_HEADER = 'x-route-editor';

export interface RequestFacts {
  method: string;
  remoteAddress: string | undefined;
  host: string | undefined;
  origin: string | undefined;
  editorHeader: string | undefined;
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export function refuseRequest(r: RequestFacts): string | null {
  if (!r.remoteAddress || !LOOPBACK_ADDRESSES.has(r.remoteAddress)) return 'The route editor only answers this computer.';
  if (!r.host || !LOOPBACK_HOST.test(r.host)) return 'The route editor only answers on localhost (not over the network or a tunnel).';
  if (r.editorHeader !== '1') return 'Missing the route editor header.';
  if (r.method !== 'GET') {
    if (!r.origin) return 'Writes need an Origin header.';
    let originHost: string;
    try {
      originHost = new URL(r.origin).host;
    } catch {
      return 'Bad Origin header.';
    }
    if (originHost !== r.host) return 'Writes must come from the route editor page itself.';
  }
  return null;
}
