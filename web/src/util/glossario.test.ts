import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { contarNaoClassificados } from './glossario';

const entrada = (over: Partial<EntradaGlossario> = {}): EntradaGlossario => ({
  id: 1,
  obra_id: 1,
  termo_zh: '甲',
  termo_pt: 'a',
  categoria: 'outro',
  nota: null,
  origem: 'manual',
  principal_id: null,
  especie: null,
  nota_uso: null,
  ambiguo: false,
  termo_pai_id: null,
  criado_em: '',
  ...over,
});

describe('contarNaoClassificados', () => {
  it('conta termos com especie: null — o estado dos 116 termos da obra real', () => {
    const entradas = [entrada({ id: 1 }), entrada({ id: 2 })];
    expect(contarNaoClassificados(entradas)).toBe(2);
  });

  it('não conta identidade nem lexical — são respostas, não ausência de resposta', () => {
    const entradas = [entrada({ id: 1, especie: 'identidade' }), entrada({ id: 2, especie: 'lexical' })];
    expect(contarNaoClassificados(entradas)).toBe(0);
  });

  it('mistura: só os null contam', () => {
    const entradas = [
      entrada({ id: 1, especie: null }),
      entrada({ id: 2, especie: 'identidade' }),
      entrada({ id: 3, especie: 'lexical' }),
      entrada({ id: 4, especie: null }),
    ];
    expect(contarNaoClassificados(entradas)).toBe(2);
  });

  it('lista vazia dá zero', () => {
    expect(contarNaoClassificados([])).toBe(0);
  });
});
