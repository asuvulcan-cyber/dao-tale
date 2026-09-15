import { describe, expect, it } from 'vitest';
import type { RelacaoTermo } from '@dao-tale/shared';
import { calcularGeracoes } from './RelacoesNarrativas';

const relacao = (id: number, origem: number, destino: number, tipo: RelacaoTermo['tipo']): RelacaoTermo => ({
  id, obra_id: 1, origem_termo_id: origem, destino_termo_id: destino, tipo,
  nota: null, capitulo_inicio: null, capitulo_fim: null, confirmado_por: 'humano', criado_em: '',
});

describe('calcularGeracoes', () => {
  it('coloca filhos abaixo dos pais e cônjuges/irmãos na mesma geração', () => {
    const g = calcularGeracoes([
      relacao(1, 1, 3, 'pai-filha'), relacao(2, 2, 3, 'mae-filha'),
      relacao(3, 1, 2, 'conjuges'), relacao(4, 4, 3, 'irmao-irma'),
    ]);
    expect(g.get(1)).toBe(g.get(2));
    expect(g.get(3)).toBe((g.get(1) ?? 0) + 1);
    expect(g.get(4)).toBe(g.get(3));
  });
});
