import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { protecaoOrigem } from './protecaoOrigem.js';

// A2: middleware sozinho, sem banco — foca na decisão de Host/Origin.

let app: Hono;

beforeEach(() => {
  app = new Hono();
  app.use('/api/*', protecaoOrigem());
  app.get('/api/x', (c) => c.json({ ok: true }));
  app.post('/api/x', (c) => c.json({ ok: true }));
});

describe('modo local — proteção da API local (A2, regressão do Passo 4)', () => {
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

// Doc 13 §1: hospedado, a confiança sai do endereço e vai para a sessão — mas o
// Host/Origin continuam sendo a allowlist que impede DNS rebinding e CSRF.

describe('modo hospedado — allowlist do domínio (doc 13 §1)', () => {
  beforeEach(() => {
    process.env.DAO_TALE_MODO = 'hospedado';
    process.env.DAO_TALE_HOST_PUBLICO = 'tale.exemplo.com, https://outro.exemplo.com/';
  });

  afterEach(() => {
    delete process.env.DAO_TALE_MODO;
    delete process.env.DAO_TALE_HOST_PUBLICO;
  });

  it('GET no domínio configurado passa (era 403 no Passo 4)', async () => {
    const r = await app.request('https://tale.exemplo.com/api/x');
    expect(r.status).toBe(200);
  });

  it('aceita domínio colado como URL na variável de ambiente', async () => {
    const r = await app.request('https://outro.exemplo.com/api/x');
    expect(r.status).toBe(200);
  });

  it('Host fora da allowlist continua bloqueado', async () => {
    const r = await app.request('https://tale.exemplo.com.atacante.net/api/x');
    expect(r.status).toBe(403);
    expect((await r.json()).erro.codigo).toBe('origem-bloqueada');
  });

  it('POST do próprio domínio passa', async () => {
    const r = await app.request('https://tale.exemplo.com/api/x', {
      method: 'POST',
      headers: { origin: 'https://tale.exemplo.com' },
    });
    expect(r.status).toBe(200);
  });

  it('POST com Origin de site externo é bloqueado (CSRF)', async () => {
    const r = await app.request('https://tale.exemplo.com/api/x', {
      method: 'POST',
      headers: { origin: 'https://site-malicioso.example' },
    });
    expect(r.status).toBe(403);
  });

  it('POST SEM Origin é bloqueado (na internet não há curl confiável)', async () => {
    const r = await app.request('https://tale.exemplo.com/api/x', { method: 'POST' });
    expect(r.status).toBe(403);
  });

  it('loopback segue permitido (health check e CLI na própria máquina)', async () => {
    const r = await app.request('http://127.0.0.1:8317/api/x');
    expect(r.status).toBe(200);
  });
});
