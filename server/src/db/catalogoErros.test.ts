import { describe, expect, it } from 'vitest';
import {
  AMOSTRA_MINIMA,
  CATALOGO,
  PRECISAO_MINIMA,
  REPROVADAS,
  entradaAprovada,
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
      expect(entradaAprovada(e.aferido), `${e.id}: não passa no portão`).toBe(true);
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
      expect(entradaAprovada(r.aferido), `${r.id} está em REPROVADAS mas passaria no portão`).toBe(false);
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

  // O teste acima ("toda entrada carrega aferição acima do piso") compara o
  // catálogo real contra as constantes correntes — é auto-referente e não
  // percebe se um piso for baixado por engano (AMOSTRA_MINIMA a 0 continuaria
  // "passando" porque tudo no catálogo já tem amostra grande). Dados
  // sintéticos com os números fixados no literal são o que de fato testa os
  // pisos, e não o catálogo.
  describe('entradaAprovada — pisos fixados em números literais', () => {
    const base = { obra_id: 1, em: '2026-08-10' };

    it('uma única ocorrência corrigida (100% de precisão) não basta — é o caso que o piso de amostra existe para barrar', () => {
      expect(entradaAprovada({ ...base, acusadas: 1, corrigidas: 1 })).toBe(false);
    });

    it('duas ocorrências, ambas corrigidas, ainda abaixo da amostra mínima', () => {
      expect(entradaAprovada({ ...base, acusadas: 2, corrigidas: 2 })).toBe(false);
    });

    it('três ocorrências (amostra mínima exata) com precisão suficiente passa', () => {
      expect(entradaAprovada({ ...base, acusadas: 3, corrigidas: 2 })).toBe(true);
    });

    it('precisão exatamente 0.5 passa — o corte é "maior ou igual"', () => {
      expect(entradaAprovada({ ...base, acusadas: 4, corrigidas: 2 })).toBe(true);
    });

    it('amostra grande mas precisão abaixo do piso não passa', () => {
      expect(entradaAprovada({ ...base, acusadas: 10, corrigidas: 4 })).toBe(false);
    });

    it('nenhuma ocorrência acusada não passa', () => {
      expect(entradaAprovada({ ...base, acusadas: 0, corrigidas: 0 })).toBe(false);
    });
  });
});
