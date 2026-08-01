import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cookieLimpo,
  cookieSessao,
  DURACAO_MS,
  emitirToken,
  lerCookie,
  limparCacheSegredo,
  NOME_COOKIE,
  segredoSessao,
  verificarToken,
} from './sessao.js';

// Doc 13 §3: token assinado, sem tabela. Revogação pela geração.

const SEGREDO = Buffer.from('segredo-de-teste-com-32-bytes---', 'utf-8');
const OUTRO = Buffer.from('outro-segredo-de-teste-32-bytes--', 'utf-8');

describe('token de sessão', () => {
  it('emite e valida na geração vigente', () => {
    const token = emitirToken(3, SEGREDO);
    const r = verificarToken(token, 3, SEGREDO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expira_em).toBeGreaterThan(Date.now());
  });

  it('rejeita token adulterado', () => {
    const token = emitirToken(1, SEGREDO);
    const [v, g, exp, sig] = token.split('.');
    // Estica a validade em 10 anos mantendo a assinatura antiga.
    const forjado = [v, g, String(Number(exp) + 10 * 365 * 24 * 3600e3), sig].join('.');
    expect(verificarToken(forjado, 1, SEGREDO)).toEqual({ ok: false, motivo: 'assinatura' });
  });

  it('rejeita token de outro segredo', () => {
    expect(verificarToken(emitirToken(1, OUTRO), 1, SEGREDO)).toEqual({ ok: false, motivo: 'assinatura' });
  });

  it('rejeita token expirado', () => {
    const emitido = emitirToken(1, SEGREDO, Date.now() - DURACAO_MS - 1000);
    expect(verificarToken(emitido, 1, SEGREDO)).toEqual({ ok: false, motivo: 'expirado' });
  });

  it('trocar a senha (geração nova) derruba os tokens antigos', () => {
    const token = emitirToken(1, SEGREDO);
    expect(verificarToken(token, 2, SEGREDO)).toEqual({ ok: false, motivo: 'revogado' });
  });

  it('sem senha definida (geração 0) nenhum token vale', () => {
    expect(verificarToken(emitirToken(0, SEGREDO), 0, SEGREDO)).toEqual({ ok: false, motivo: 'revogado' });
  });

  it('rejeita lixo sem estourar', () => {
    for (const lixo of ['', 'abc', 'v1.1.2', 'v2.1.9999999999999.xxx', '....']) {
      expect(verificarToken(lixo, 1, SEGREDO).ok).toBe(false);
    }
  });
});

describe('cookie', () => {
  it('é HttpOnly, Secure e SameSite=Lax', () => {
    const c = cookieSessao('t');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toMatch(/Max-Age=\d+/);
  });

  it('o cookie de logout expira na hora e mantém os mesmos atributos', () => {
    expect(cookieLimpo()).toContain('Max-Age=0');
    expect(cookieLimpo()).toContain('HttpOnly');
  });

  it('lê o valor entre outros cookies', () => {
    expect(lerCookie(`tema=escuro; ${NOME_COOKIE}=abc123; outro=1`)).toBe('abc123');
    expect(lerCookie('tema=escuro')).toBeNull();
    expect(lerCookie(undefined)).toBeNull();
  });
});

describe('segredo em arquivo', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-segredo-'));
    delete process.env.DAO_TALE_SESSAO_SEGREDO;
    limparCacheSegredo();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    limparCacheSegredo();
  });

  it('gera 32 bytes com permissão 0600 e reusa nas chamadas seguintes', () => {
    const primeiro = segredoSessao(dir);
    expect(primeiro.length).toBe(32);
    const arquivo = path.join(dir, 'sessao.chave');
    expect(fs.statSync(arquivo).mode & 0o777).toBe(0o600);

    limparCacheSegredo();
    expect(segredoSessao(dir).equals(primeiro)).toBe(true);
  });

  it('a variável de ambiente tem precedência sobre o arquivo', () => {
    process.env.DAO_TALE_SESSAO_SEGREDO = 'do-ambiente';
    expect(segredoSessao(dir).toString('utf-8')).toBe('do-ambiente');
    expect(fs.existsSync(path.join(dir, 'sessao.chave'))).toBe(false);
    delete process.env.DAO_TALE_SESSAO_SEGREDO;
  });
});
