import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { definirSenha } from '../auth/senha.js';
import { DURACAO_MS, emitirToken, limparCacheSegredo, NOME_COOKIE, RENOVAR_ABAIXO_DE_MS, segredoSessao } from '../auth/sessao.js';
import { problemasDeHospedagem } from '../auth/boot.js';

// Doc 13 §3: a API inteira atrás de sessão em modo hospedado, e absolutamente
// nada mudando no modo local.

const SENHA = 'a-senha-longa-do-dono';
const BASE = 'https://tale.exemplo.com';

let dir: string;
let db: BancoDados;
let app: Hono;

function criar(): Hono {
  // Atraso progressivo zerado: aqui se testa a decisão, não a espera.
  return criarApp(db, { limiteLogin: { atrasoPorFalhaMs: 0 } });
}

const pedir = (metodo: string, rota: string, opcoes: RequestInit = {}) =>
  app.request(`${BASE}${rota}`, { method: metodo, ...opcoes });

async function entrar(senha = SENHA): Promise<string> {
  const r = await pedir('POST', '/api/sessao', {
    headers: { 'Content-Type': 'application/json', origin: BASE },
    body: JSON.stringify({ senha }),
  });
  const cookie = r.headers.get('set-cookie') ?? '';
  return cookie.split(';')[0];
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-sessao-'));
  process.env.DAO_TALE_DIR = dir;
  delete process.env.DAO_TALE_SESSAO_SEGREDO;
  limparCacheSegredo();
  db = abrirBanco(':memory:');
});

afterEach(() => {
  delete process.env.DAO_TALE_MODO;
  delete process.env.DAO_TALE_HOST_PUBLICO;
  delete process.env.DAO_TALE_DIR;
  limparCacheSegredo();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('modo local — nada de login (regressão)', () => {
  beforeEach(() => {
    app = criar();
  });

  it('a API responde sem cookie nenhum', async () => {
    const r = await app.request('http://localhost/api/obras');
    expect(r.status).toBe(200);
  });

  it('o status de sessão diz "autenticado" para a interface não pedir senha', async () => {
    const estado = await (await app.request('http://localhost/api/sessao')).json();
    expect(estado).toEqual({ modo: 'local', autenticado: true, senha_definida: false, pode_entrar: true });
  });

  it('login em modo local é recusado com explicação, não com senha errada', async () => {
    const r = await app.request('http://localhost/api/sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: SENHA }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).erro.codigo).toBe('sem-autenticacao');
  });
});

describe('modo hospedado — sessão obrigatória', () => {
  beforeEach(() => {
    process.env.DAO_TALE_MODO = 'hospedado';
    process.env.DAO_TALE_HOST_PUBLICO = 'tale.exemplo.com';
    definirSenha(SENHA);
    app = criar();
  });

  it('sem cookie, a API de dados devolve 401', async () => {
    const r = await pedir('GET', '/api/obras');
    expect(r.status).toBe(401);
    expect((await r.json()).erro.codigo).toBe('nao-autenticado');
  });

  it('/api/saude também exige sessão (expõe o caminho dos dados)', async () => {
    expect((await pedir('GET', '/api/saude')).status).toBe(401);
  });

  it('o status de sessão é público, mas só conta o essencial', async () => {
    const r = await pedir('GET', '/api/sessao');
    expect(r.status).toBe(200);
    const estado = await r.json();
    // `pode_entrar` é true porque a lista de IPs (doc 14 §7) vem desligada; o
    // que o status conta continua sendo só o que a interface precisa para se
    // desenhar, sem caminho de dados nem versão.
    expect(estado).toEqual({ modo: 'hospedado', autenticado: false, senha_definida: true, pode_entrar: true });
    expect(JSON.stringify(estado)).not.toContain(dir);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('senha errada: 401, sem cookie', async () => {
    const r = await pedir('POST', '/api/sessao', {
      headers: { 'Content-Type': 'application/json', origin: BASE },
      body: JSON.stringify({ senha: 'chute-do-atacante' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).erro.codigo).toBe('credenciais-invalidas');
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('senha certa: cookie HttpOnly + Secure + SameSite=Lax, e a API abre', async () => {
    const r = await pedir('POST', '/api/sessao', {
      headers: { 'Content-Type': 'application/json', origin: BASE },
      body: JSON.stringify({ senha: SENHA }),
    });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toContain(`${NOME_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');

    const comSessao = await pedir('GET', '/api/obras', { headers: { cookie: cookie.split(';')[0] } });
    expect(comSessao.status).toBe(200);
  });

  it('cookie adulterado não passa', async () => {
    const cookie = await entrar();
    const mexido = cookie.slice(0, -3) + 'aaa';
    expect((await pedir('GET', '/api/obras', { headers: { cookie: mexido } })).status).toBe(401);
  });

  it('trocar a senha derruba a sessão que estava aberta', async () => {
    const cookie = await entrar();
    expect((await pedir('GET', '/api/obras', { headers: { cookie } })).status).toBe(200);

    definirSenha('outra-frase-bem-comprida');
    expect((await pedir('GET', '/api/obras', { headers: { cookie } })).status).toBe(401);
  });

  it('logout limpa o cookie do navegador', async () => {
    const cookie = await entrar();
    const r = await pedir('DELETE', '/api/sessao', { headers: { cookie, origin: BASE } });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('sessão perto de vencer é renovada na resposta (não desloga o celular)', async () => {
    const token = emitirToken(1, segredoSessao(), Date.now() - DURACAO_MS + RENOVAR_ABAIXO_DE_MS - 60_000);
    const r = await pedir('GET', '/api/obras', { headers: { cookie: `${NOME_COOKIE}=${token}` } });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain(`${NOME_COOKIE}=`);
  });

  it('sessão recém-criada não fica reemitindo cookie a cada requisição', async () => {
    const cookie = await entrar();
    const r = await pedir('GET', '/api/obras', { headers: { cookie } });
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('tentativas repetidas levam a 429 com Retry-After', async () => {
    let ultima: Response | null = null;
    for (let i = 0; i < 6; i++) {
      ultima = await pedir('POST', '/api/sessao', {
        headers: { 'Content-Type': 'application/json', origin: BASE, 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ senha: `chute-${i}` }),
      });
    }
    expect(ultima!.status).toBe(429);
    expect((await ultima!.json()).erro.codigo).toBe('muitas-tentativas');
    expect(Number(ultima!.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('o bloqueio é por IP: outro endereço ainda consegue entrar', async () => {
    for (let i = 0; i < 6; i++) {
      await pedir('POST', '/api/sessao', {
        headers: { 'Content-Type': 'application/json', origin: BASE, 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ senha: 'chute' }),
      });
    }
    const r = await pedir('POST', '/api/sessao', {
      headers: { 'Content-Type': 'application/json', origin: BASE, 'x-forwarded-for': '198.51.100.4' },
      body: JSON.stringify({ senha: SENHA }),
    });
    expect(r.status).toBe(200);
  });

  it('nem senha, nem hash, nem token, nem segredo aparecem em log', async () => {
    const escrito: string[] = [];
    const espiao = (...args: unknown[]) => void escrito.push(args.map(String).join(' '));
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(espiao),
      vi.spyOn(console, 'error').mockImplementation(espiao),
      vi.spyOn(console, 'warn').mockImplementation(espiao),
    ];

    await pedir('POST', '/api/sessao', {
      headers: { 'Content-Type': 'application/json', origin: BASE },
      body: JSON.stringify({ senha: 'chute-errado-do-atacante' }),
    });
    const cookie = await entrar();
    await pedir('GET', '/api/obras', { headers: { cookie } });
    for (const s of spies) s.mockRestore();

    const saida = escrito.join('\n');
    const registro = JSON.parse(fs.readFileSync(path.join(dir, 'auth.json'), 'utf-8'));
    for (const segredo of [SENHA, 'chute-errado-do-atacante', registro.hash, registro.sal, cookie.split('=')[1], segredoSessao().toString('base64')]) {
      expect(saida).not.toContain(segredo);
    }
  });
});

describe('guarda de subida (fail-closed)', () => {
  it('modo local não exige nada', () => {
    expect(problemasDeHospedagem()).toEqual([]);
  });

  it('hospedado sem domínio e sem senha recusa subir, dizendo o que falta', () => {
    process.env.DAO_TALE_MODO = 'hospedado';
    const problemas = problemasDeHospedagem();
    expect(problemas).toHaveLength(2);
    expect(problemas.join(' ')).toContain('DAO_TALE_HOST_PUBLICO');
    expect(problemas.join(' ')).toContain('npm run senha');
  });

  it('com domínio e senha, libera', () => {
    process.env.DAO_TALE_MODO = 'hospedado';
    process.env.DAO_TALE_HOST_PUBLICO = 'tale.exemplo.com';
    definirSenha(SENHA);
    expect(problemasDeHospedagem()).toEqual([]);
  });
});
