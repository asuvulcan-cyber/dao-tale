import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { separarPorChecagem } from './glossarioChecavel.js';

// `separarPorChecagem` é o portão entre o glossário cru e `varrerConsistencia`
// (função pura, intocável — doc da Task 7): ela pergunta "o chinês tem o termo,
// logo o português tem o canônico?", e para um termo `ambiguo` essa pergunta
// está errada na maioria das vezes (小心 é "cuidado" em 7 de 8 ocorrências da
// obra 1, e só 1 é a criada Xiao Xin). Separar aqui, no chamador, é o que evita
// misturar a regra de glossário dentro de uma função usada por cinco pontos.

const base: Omit<EntradaGlossario, 'id' | 'termo_zh' | 'termo_pt' | 'ambiguo'> = {
  obra_id: 1,
  categoria: 'personagem',
  nota: null,
  origem: 'manual',
  principal_id: null,
  especie: null,
  nota_uso: null,
  termo_pai_id: null,
  criado_em: '2026-01-01',
};

function entrada(over: Partial<EntradaGlossario> & { id: number; termo_zh: string; termo_pt: string }): EntradaGlossario {
  return { ...base, ambiguo: false, ...over };
}

describe('separarPorChecagem', () => {
  it('sem nenhum ambíguo, tudo vai para checaveis e ambiguos fica vazio — comportamento de hoje', () => {
    const glossario = [
      entrada({ id: 1, termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado' }),
      entrada({ id: 2, termo_zh: '刀', termo_pt: 'sabre' }),
    ];
    const { checaveis, ambiguos } = separarPorChecagem(glossario);
    expect(checaveis).toEqual(glossario);
    expect(ambiguos).toEqual([]);
  });

  it('um termo ambiguo sai de checaveis e entra em ambiguos', () => {
    const naoAmbiguo = entrada({ id: 1, termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado' });
    const ambiguo = entrada({ id: 2, termo_zh: '小心', termo_pt: 'Xiao Xin', ambiguo: true });
    const { checaveis, ambiguos } = separarPorChecagem([naoAmbiguo, ambiguo]);
    expect(checaveis).toEqual([naoAmbiguo]);
    expect(ambiguos).toEqual([ambiguo]);
  });

  it('preserva a ordem relativa nas duas listas — elas alimentam prompt e tela', () => {
    const a = entrada({ id: 1, termo_zh: 'A', termo_pt: 'a', ambiguo: true });
    const b = entrada({ id: 2, termo_zh: 'B', termo_pt: 'b' });
    const c = entrada({ id: 3, termo_zh: 'C', termo_pt: 'c', ambiguo: true });
    const d = entrada({ id: 4, termo_zh: 'D', termo_pt: 'd' });
    const { checaveis, ambiguos } = separarPorChecagem([a, b, c, d]);
    expect(checaveis.map((e) => e.id)).toEqual([2, 4]);
    expect(ambiguos.map((e) => e.id)).toEqual([1, 3]);
  });

  it('ambiguo não interfere em especie nem em principal_id — dá para ser ambíguo e lexical, ambíguo e variante', () => {
    const ambiguoLexical = entrada({
      id: 1,
      termo_zh: '小心',
      termo_pt: 'cuidado',
      ambiguo: true,
      especie: 'lexical',
    });
    const ambiguoVariante = entrada({
      id: 2,
      termo_zh: '芊芊',
      termo_pt: 'Qianqian',
      ambiguo: true,
      especie: 'identidade',
      principal_id: 99,
    });
    const { ambiguos } = separarPorChecagem([ambiguoLexical, ambiguoVariante]);
    expect(ambiguos).toEqual([ambiguoLexical, ambiguoVariante]);
    expect(ambiguos[0].especie).toBe('lexical');
    expect(ambiguos[1].principal_id).toBe(99);
  });
});
