import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { construirFlorestaGlossario } from './MapaGlossario';

const entrada = (id: number, termo_pt: string, termo_pai_id: number | null = null, principal_id: number | null = null): EntradaGlossario => ({
  id, obra_id: 1, termo_zh: `中${id}`, termo_pt, categoria: 'local', nota: null,
  origem: 'manual', principal_id, especie: 'identidade', nota_uso: 'uso', ambiguo: false,
  termo_pai_id, criado_em: '',
});

describe('construirFlorestaGlossario', () => {
  it('monta pertencimento em profundidade e não duplica variantes como nós', () => {
    const r = construirFlorestaGlossario([
      entrada(1, 'Fortaleza'), entrada(2, 'Forte Leste', 1), entrada(3, 'Pátio', 2),
      entrada(4, 'nome alternativo', null, 1),
    ]);
    expect(r.raizes.map((n) => n.entrada.id)).toEqual([1]);
    expect(r.raizes[0].filhos[0].entrada.id).toBe(2);
    expect(r.raizes[0].filhos[0].filhos[0].entrada.id).toBe(3);
    expect(r.ciclos).toEqual([]);
  });

  it('isola órfãos e detecta ciclos sem recursão infinita', () => {
    const r = construirFlorestaGlossario([entrada(1, 'A', 2), entrada(2, 'B', 1), entrada(3, 'Órfão', 999)]);
    expect(r.ciclos.map((e) => e.id).sort()).toEqual([1, 2]);
    expect(r.orfaos.map((e) => e.id)).toEqual([3]);
  });
});
