import { describe, expect, it } from 'vitest';
import type { CasoTeste } from '@dao-tale/shared';
import { agruparEmFios } from './fios';

const caso = (id: number, pai: number | null, criado: string) =>
  ({ id, caso_pai_id: pai, criado_em: criado }) as CasoTeste;

describe('agruparEmFios', () => {
  it('monta cada fio da raiz até a folha', () => {
    const casos = [caso(3, 2, '2026-08-07T03:00Z'), caso(1, null, '2026-08-07T01:00Z'), caso(2, 1, '2026-08-07T02:00Z')];
    expect(agruparEmFios(casos)).toEqual([[casos[1], casos[2], casos[0]]]);
  });

  // A fixture PRECISA de um fio com mais de um turno, senão raiz e folha coincidem e
  // o teste passa igual ordenando pela raiz. O erro que isso deixaria passar é caro:
  // um fio antigo em que você acabou de replicar deixaria de ser o corrente, e o campo
  // de réplica e os botões grudariam no fio errado.
  it('ordena os fios pela FOLHA, não pela raiz', () => {
    const raizAntiga = caso(1, null, '2026-08-01T01:00Z');
    const folhaRecente = caso(2, 1, '2026-08-07T01:00Z');
    const fioDoMeio = caso(3, null, '2026-08-04T01:00Z');
    // Pela folha: 08-07 > 08-04. Pela raiz seria o contrário (08-04 > 08-01).
    expect(agruparEmFios([raizAntiga, folhaRecente, fioDoMeio])).toEqual([
      [raizAntiga, folhaRecente],
      [fioDoMeio],
    ]);
  });

  it('trata caso órfão como raiz — import parcial não pode sumir da tela', () => {
    const orfao = caso(5, 99, '2026-08-07T01:00Z');
    expect(agruparEmFios([orfao])).toEqual([[orfao]]);
  });
});
