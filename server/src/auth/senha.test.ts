import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { definirSenha, ErroSenhaFraca, geracaoAtual, lerRegistro, senhaDefinida, verificarSenha } from './senha.js';

// Doc 13 §3. Senha em repouso: scrypt + sal, arquivo 0600, texto nunca gravado.

let dir: string;
let arquivo: string;
const SENHA = 'travessia-do-rio-amarelo-7';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-senha-'));
  arquivo = path.join(dir, 'auth.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('senha do usuário único', () => {
  it('sem arquivo, não há senha definida e a geração é 0', () => {
    expect(senhaDefinida(arquivo)).toBe(false);
    expect(lerRegistro(arquivo)).toBeNull();
    expect(geracaoAtual(arquivo)).toBe(0);
  });

  it('define, aceita a senha certa e recusa a errada', () => {
    definirSenha(SENHA, arquivo);
    const registro = lerRegistro(arquivo)!;
    expect(verificarSenha(SENHA, registro)).toBe(true);
    expect(verificarSenha(SENHA + 'x', registro)).toBe(false);
    expect(verificarSenha('', registro)).toBe(false);
  });

  it('o arquivo não contém a senha em texto e fica com permissão 0600', () => {
    definirSenha(SENHA, arquivo);
    const cru = fs.readFileSync(arquivo, 'utf-8');
    expect(cru).not.toContain(SENHA);
    expect(fs.statSync(arquivo).mode & 0o777).toBe(0o600);
  });

  it('sal por instalação: a mesma senha gera hashes diferentes', () => {
    definirSenha(SENHA, arquivo);
    const primeiro = lerRegistro(arquivo)!;
    const outro = path.join(dir, 'outro.json');
    definirSenha(SENHA, outro);
    expect(lerRegistro(outro)!.hash).not.toBe(primeiro.hash);
  });

  it('trocar a senha incrementa a geração (revoga sessões) e mantém 0600', () => {
    definirSenha(SENHA, arquivo);
    expect(geracaoAtual(arquivo)).toBe(1);
    fs.chmodSync(arquivo, 0o644); // simula permissão frouxa herdada
    definirSenha('outra-frase-bem-comprida', arquivo);
    expect(geracaoAtual(arquivo)).toBe(2);
    expect(fs.statSync(arquivo).mode & 0o777).toBe(0o600);
  });

  it('recusa senha curta', () => {
    expect(() => definirSenha('curta1', arquivo)).toThrow(ErroSenhaFraca);
    expect(senhaDefinida(arquivo)).toBe(false);
  });

  it('arquivo corrompido é tratado como "sem senha", não como falha aberta', () => {
    fs.writeFileSync(arquivo, '{ isto não é json');
    expect(senhaDefinida(arquivo)).toBe(false);
    expect(geracaoAtual(arquivo)).toBe(0);
  });
});
