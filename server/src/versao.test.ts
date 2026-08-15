import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lerVersao } from './versao.js';

const temporarios: string[] = [];

function comArquivo(conteudo: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-versao-'));
  temporarios.push(dir);
  if (conteudo !== null) fs.writeFileSync(path.join(dir, 'VERSAO.json'), conteudo);
  return dir;
}

afterEach(() => {
  for (const d of temporarios.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('lerVersao', () => {
  it('lê o carimbo que o subir.mjs grava', () => {
    const dir = comArquivo(
      JSON.stringify({ commit: 'a1b2c3d', publicado_em: '2026-08-15T17:20:04.000Z', assunto: 'Coisa nova' }),
    );
    expect(lerVersao(dir)).toEqual({
      commit: 'a1b2c3d',
      publicado_em: '2026-08-15T17:20:04.000Z',
      assunto: 'Coisa nova',
    });
  });

  it('sem arquivo devolve tudo null — é o caso normal em desenvolvimento', () => {
    expect(lerVersao(comArquivo(null))).toEqual({ commit: null, publicado_em: null, assunto: null });
  });

  it('JSON corrompido não derruba a rota de saúde', () => {
    // Justamente a rota que serve para conferir se o app está de pé não pode
    // cair por causa de um arquivo de carimbo malformado.
    expect(lerVersao(comArquivo('{ isto não é json'))).toEqual({
      commit: null,
      publicado_em: null,
      assunto: null,
    });
  });

  it('campo vazio ou de tipo errado vira null, não string vazia', () => {
    // String vazia passaria pelo `??` da tela e apareceria como um carimbo em
    // branco, que se lê como "publicado, mas sem identificação".
    const dir = comArquivo(JSON.stringify({ commit: '', publicado_em: 42, assunto: '   ' }));
    expect(lerVersao(dir)).toEqual({ commit: null, publicado_em: null, assunto: null });
  });
});
