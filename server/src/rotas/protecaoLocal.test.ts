import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { protecaoLocal } from './protecaoLocal.js';

// A2: middleware sozinho, sem banco — foca na decisão de Host/Origin.

let app: Hono;

beforeEach(() => {
  app = new Hono();
  app.use('/api/*', protecaoLocal());
  app.get('/api/x', (c) => c.json({ ok: true }));
  app.post('/api/x', (c) => c.json({ ok: true }));
});

describe('proteção da API local (A2)', () => {
  it('GET local sem Origin passa', async () => {
    const r = await app.request('http://localhost/api/x');
    expect(r.status).toBe(200);
  });

  it('POST local sem Origin passa (curl/script)', async () => {
    const r = await app.request('http://127.0.0.1:8317/api/x', { method: 'POST' });
    expect(r.status).toBe(200);
  });

  it('POST com Origin do próprio app (loopback) passa', async () => {
    const r = await app.request('http://127.0.0.1:8317/api/x', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:8317' },
    });
    expect(r.status).toBe(200);
  });

  it('POST com Origin do proxy do Vite (localhost:5173) passa', async () => {
    const r = await app.request('http://localhost:8317/api/x', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(r.status).toBe(200);
  });

  it('POST com Origin de site externo é bloqueado (CSRF)', async () => {
    const r = await app.request('http://127.0.0.1:8317/api/x', {
      method: 'POST',
      headers: { origin: 'https://site-malicioso.example' },
    });
    expect(r.status).toBe(403);
    expect((await r.json()).erro.codigo).toBe('origem-bloqueada');
  });

  it('Origin opaco ("null") é bloqueado em método mutante', async () => {
    const r = await app.request('http://127.0.0.1:8317/api/x', {
      method: 'POST',
      headers: { origin: 'null' },
    });
    expect(r.status).toBe(403);
  });

  it('Host não-loopback é bloqueado mesmo em GET (DNS rebinding)', async () => {
    const r = await app.request('http://site-malicioso.example/api/x');
    expect(r.status).toBe(403);
  });

  it('IPv6 loopback ([::1]) é aceito', async () => {
    const r = await app.request('http://[::1]:8317/api/x', {
      method: 'POST',
      headers: { origin: 'http://[::1]:8317' },
    });
    expect(r.status).toBe(200);
  });
});
