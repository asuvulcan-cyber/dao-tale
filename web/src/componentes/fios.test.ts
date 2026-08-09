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

  it('ordena os fios do mais recente para o mais antigo pela folha', () => {
    const antigo = caso(1, null, '2026-08-06T01:00Z');
    const novo = caso(2, null, '2026-08-07T01:00Z');
    expect(agruparEmFios([antigo, novo])[0][0].id).toBe(2);
  });

  it('trata caso órfão como raiz — import parcial não pode sumir da tela', () => {
    const orfao = caso(5, 99, '2026-08-07T01:00Z');
    expect(agruparEmFios([orfao])).toEqual([[orfao]]);
  });
});
