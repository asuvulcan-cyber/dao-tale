import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { definirSenha } from '../auth/senha.js';
import { limparCacheSegredo } from '../auth/sessao.js';
import { gravarIps } from '../auth/ips.js';

// Trava de IP (doc 14 §7) com o app de verdade. O IP de quem chama vem do
// X-Forwarded-For em modo hospedado — no ar quem escreve esse cabeçalho é o
// proxy, e foi medido que ele descarta o que o cliente manda.

const SENHA = 'a-senha-longa-do-dono';
const BASE = 'https://tale.exemplo.com';
const DE_CASA = '189.5.4.3';
const DE_FORA = '203.0.113.9';

let dir: string;
let db: BancoDados;
let app: Hono;

const pedir = (metodo: string, rota: string, ip: string, corpo?: unknown) =>
  app.request(`${BASE}${rota}`, {
    method: metodo,
    headers: {
      'x-forwarded-for': ip,
      origin: BASE,
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });

async function entrarDe(ip: string): Promise<string> {
  const r = await pedir('POST', '/api/sessao', ip, { senha: SENHA });
  return (r.headers.get('set-cookie') ?? '').split(';')[0];
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-trava-'));
  process.env.DAO_TALE_DIR = dir;
  process.env.DAO_TALE_MODO = 'hospedado';
  process.env.DAO_TALE_HOST_PUBLICO = 'tale.exemplo.com';
  limparCacheSegredo();
  definirSenha(SENHA);
  db = abrirBanco(':memory:');
  app = criarApp(db, { limiteLogin: { atrasoPorFalhaMs: 0 } });

  // Uma obra publicada, para conferir que a vitrine NÃO é afetada pela trava.
  const obraId = Number(
    db.prepare("INSERT INTO obras (titulo, tags, publica) VALUES ('A Torre de Bronze', '[]', 1)").run().lastInsertRowid,
  );
  const cap = Number(
    db.prepare("INSERT INTO capitulos (obra_id, numero, titulo_pt, status, texto_origem) VALUES (?,1,'A porta','finalizado','铁门。')")
      .run(obraId).lastInsertRowid,
  );
  db.prepare("INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt) VALUES (?,1,1,'铁门。','O portão.')").run(cap);
});

afterEach(() => {
  delete process.env.DAO_TALE_MODO;
  delete process.env.DAO_TALE_HOST_PUBLICO;
  delete process.env.DAO_TALE_DIR;
  limparCacheSegredo();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('trava desligada (padrão) — nada muda', () => {
  it('qualquer endereço ainda entra com a senha certa', async () => {
    const r = await pedir('POST', '/api/sessao', DE_FORA, { senha: SENHA });
    expect(r.status).toBe(200);
  });

  it('o status de sessão diz que dá para tentar', async () => {
    const estado = await (await pedir('GET', '/api/sessao', DE_FORA)).json();
    expect(estado.pode_entrar).toBe(true);
  });
});

describe('trava ligada', () => {
  beforeEach(() => {
    gravarIps([DE_CASA]);
  });

  it('o IP permitido entra normalmente', async () => {
    const r = await pedir('POST', '/api/sessao', DE_CASA, { senha: SENHA });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('dao_tale_sessao=');
  });

  it('o IP de fora recebe 404 SEM MENSAGEM, mesmo com a senha certa', async () => {
    const r = await pedir('POST', '/api/sessao', DE_FORA, { senha: SENHA });
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('');
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('o IP de fora não gasta tentativa do freio — nem chega nele', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await pedir('POST', '/api/sessao', DE_FORA, { senha: 'errada' });
      expect(r.status).toBe(404); // nunca 429: a trava responde antes
    }
    // E o dono continua podendo entrar, sem ter sido atingido pelo teto global.
    expect((await pedir('POST', '/api/sessao', DE_CASA, { senha: SENHA })).status).toBe(200);
  });

  it('a bancada some para quem está de fora: 404, não 401', async () => {
    for (const rota of ['/api/obras', '/api/configuracoes', '/api/provedores']) {
      const r = await pedir('GET', rota, DE_FORA);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe('');
    }
  });

  it('cookie VÁLIDO usado de um IP de fora não vale nada', async () => {
    const cookie = await entrarDe(DE_CASA);
    expect(cookie).toContain('dao_tale_sessao=');

    const r = await app.request(`${BASE}/api/obras`, {
      headers: { 'x-forwarded-for': DE_FORA, cookie },
    });
    expect(r.status).toBe(404);
  });

  it('a interface fica sabendo que não adianta oferecer o login', async () => {
    const deFora = await (await pedir('GET', '/api/sessao', DE_FORA)).json();
    expect(deFora.pode_entrar).toBe(false);
    expect(deFora.autenticado).toBe(false);

    const deCasa = await (await pedir('GET', '/api/sessao', DE_CASA)).json();
    expect(deCasa.pode_entrar).toBe(true);
  });

  it('a VITRINE continua aberta a todo mundo — a trava é só da bancada', async () => {
    const lista = await pedir('GET', '/api/publico/obras', DE_FORA);
    expect(lista.status).toBe(200);
    expect((await lista.json()) as any[]).toHaveLength(1);

    const obraId = (db.prepare('SELECT id FROM obras').get() as { id: number }).id;
    const cap = await pedir('GET', `/api/publico/obras/${obraId}/capitulos/1`, DE_FORA);
    expect(cap.status).toBe(200);
    expect((await cap.json()).paragrafos).toEqual(['O portão.']);
  });

  it('faixa funciona: o vizinho de IP na mesma faixa entra', async () => {
    gravarIps(['189.5.4.0/24']);
    expect((await pedir('POST', '/api/sessao', '189.5.4.77', { senha: SENHA })).status).toBe(200);
    expect((await pedir('POST', '/api/sessao', '189.5.5.77', { senha: SENHA })).status).toBe(404);
  });

  it('acrescentar um IP vale na hora, sem reiniciar', async () => {
    expect((await pedir('POST', '/api/sessao', DE_FORA, { senha: SENHA })).status).toBe(404);
    gravarIps([DE_CASA, DE_FORA]);
    expect((await pedir('POST', '/api/sessao', DE_FORA, { senha: SENHA })).status).toBe(200);
  });

  it('esvaziar a lista destranca — a saída de emergência do CLI', async () => {
    expect((await pedir('POST', '/api/sessao', DE_FORA, { senha: SENHA })).status).toBe(404);
    gravarIps([]);
    expect((await pedir('POST', '/api/sessao', DE_FORA, { senha: SENHA })).status).toBe(200);
  });
});
