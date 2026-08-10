import { describe, expect, it } from 'vitest';
import {
  AMOSTRA_MINIMA,
  CATALOGO,
  PRECISAO_MINIMA,
  REPROVADAS,
  precisaoAferida,
} from '@dao-tale/shared';

// Este arquivo é a razão de o catálogo existir como dado e não como texto de
// prompt: ele impede a lista de crescer por intuição. A tabela das nove
// partículas do prompt completo nunca passou por aqui, e a medição mostrou que
// 80 dos 85 alarmes dela eram falsos.
describe('catálogo de erros zh→pt-BR', () => {
  it('toda entrada carrega aferição acima do piso', () => {
    for (const e of CATALOGO) {
      expect(e.aferido, `${e.id} sem aferição`).toBeTruthy();
      expect(e.aferido.acusadas, `${e.id}: amostra pequena demais`).toBeGreaterThanOrEqual(AMOSTRA_MINIMA);
      expect(precisaoAferida(e.aferido), `${e.id}: precisão abaixo do piso`).toBeGreaterThanOrEqual(PRECISAO_MINIMA);
    }
  });

  it('nenhuma entrada reprovada aparece no catálogo', () => {
    const ids = new Set(CATALOGO.map((e) => e.id));
    for (const r of REPROVADAS) expect(ids.has(r.id), `${r.id} reprovada mas listada`).toBe(false);
  });

  it('as reprovadas guardam a medição que as reprovou', () => {
    expect(REPROVADAS.length).toBeGreaterThan(0);
    for (const r of REPROVADAS) {
      expect(r.motivo, `${r.id} sem motivo`).toBeTruthy();
      const abaixo =
        precisaoAferida(r.aferido) < PRECISAO_MINIMA || r.aferido.acusadas < AMOSTRA_MINIMA;
      expect(abaixo, `${r.id} está em REPROVADAS mas passaria no piso`).toBe(true);
    }
  });

  it('ids são únicos e em kebab-case', () => {
    const todos = [...CATALOGO, ...REPROVADAS].map((e) => e.id);
    expect(new Set(todos).size).toBe(todos.length);
    for (const id of todos) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('evitar_pt nunca é global — lastIndex sobreviveria entre frases', () => {
    for (const e of [...CATALOGO, ...REPROVADAS]) {
      expect(e.evitar_pt.global, `${e.id} usa a flag g`).toBe(false);
    }
  });
});
