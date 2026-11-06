import { describe, expect, it } from 'vitest';
import { refuseRequest, type RequestFacts } from './guard';

const local: RequestFacts = {
  method: 'PUT',
  remoteAddress: '127.0.0.1',
  host: 'localhost:5173',
  origin: 'http://localhost:5173',
  editorHeader: '1',
};

describe('refuseRequest', () => {
  it('lets the editor page on this computer read and write', () => {
    expect(refuseRequest(local)).toBeNull();
    expect(refuseRequest({ ...local, remoteAddress: '::1', host: '[::1]:5443', origin: 'https://[::1]:5443' })).toBeNull();
    expect(refuseRequest({ ...local, method: 'GET', origin: undefined })).toBeNull();
  });

  it('refuses other computers on the network (dev:https listens with --host)', () => {
    expect(refuseRequest({ ...local, remoteAddress: '192.168.1.20', host: '192.168.1.5:5443' })).toMatch(/only answers this computer/);
  });

  it('refuses tunnels, which reach the server from localhost but carry their own host name', () => {
    expect(refuseRequest({ ...local, host: 'quiet-duck.trycloudflare.com', origin: 'https://quiet-duck.trycloudflare.com' })).toMatch(
      /localhost/,
    );
    expect(refuseRequest({ ...local, host: 'abc.ngrok-free.app' })).toMatch(/localhost/);
  });

  it('refuses requests without the editor header (another site can\'t add it without a preflight)', () => {
    expect(refuseRequest({ ...local, editorHeader: undefined })).toMatch(/header/);
    expect(refuseRequest({ ...local, method: 'GET', editorHeader: undefined })).toMatch(/header/);
  });

  it('refuses writes from another page, or without an Origin', () => {
    expect(refuseRequest({ ...local, origin: 'http://localhost:3000' })).toMatch(/editor page itself/);
    expect(refuseRequest({ ...local, origin: 'https://evil.example' })).toMatch(/editor page itself/);
    expect(refuseRequest({ ...local, origin: undefined })).toMatch(/Origin/);
    expect(refuseRequest({ ...local, origin: 'null' })).toMatch(/Origin/);
  });
});
