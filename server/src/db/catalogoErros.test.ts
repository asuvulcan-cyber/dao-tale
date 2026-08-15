import { describe, expect, it } from 'vitest';
import {
  AMOSTRA_MINIMA,
  CATALOGO,
  PRECISAO_MINIMA,
  REPROVADAS,
  entradaAprovada,
  orientacaoDaRegra,
  precisaoAferida,
  type EntradaCatalogo,
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

  it('nenhum campo de texto vem vazio — os dois modos de degenerar', () => {
    // `gatilho_zh: ''` é o pior: `''.includes('')` é sempre true, então a
    // entrada vira uma regra MONOLÍNGUE que acusa toda frase com o reflexo — e
    // ser bilíngue é a única coisa que separa este detector de `analisarEstilo`.
    // `titulo: ''` é silencioso de outro jeito: o `?? regra` da tela é nullish,
    // então string vazia não cai para o id e a linha aparece sem nome nenhum.
    for (const e of [...CATALOGO, ...REPROVADAS]) {
      expect(e.gatilho_zh, `${e.id} sem gatilho_zh`).not.toBe('');
      expect(e.titulo.trim(), `${e.id} sem titulo`).not.toBe('');
      expect(e.certo.trim(), `${e.id} sem o que é certo`).not.toBe('');
    }
  });

  it('duas entradas não disputam o mesmo reflexo no português', () => {
    // Entradas com a mesma `evitar_pt` acusariam o MESMO trecho duas vezes, com
    // orientações concorrentes na mesma chamada paga — e o front casa a enésima
    // correção com a enésima violação, então o modelo receberia duas instruções
    // para o mesmo pedaço de texto. As reprovadas ficam de fora da checagem:
    // `zong` e `yizhi` compartilham /\bsempre\b/ de propósito (é o par que a
    // medição separou), e só uma das duas está no catálogo.
    const fontes = CATALOGO.map((e) => e.evitar_pt.source);
    expect(new Set(fontes).size, 'duas entradas do catálogo com a mesma evitar_pt').toBe(fontes.length);
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

  // Mesma razão dos pisos: com uma entrada só no CATALOGO real, "achou pelo id"
  // e "pegou a primeira" dão o mesmo resultado, e o passe de estilo mandaria a
  // orientação da regra ERRADA sem nenhum teste ficar vermelho. O erro custa
  // caro: a orientação vai dentro de uma chamada paga, mandando o modelo
  // consertar uma coisa com a explicação de outra.
  describe('orientacaoDaRegra — casada por id, com duas entradas sintéticas', () => {
    const aferido = { obra_id: 1, acusadas: 3, corrigidas: 2, em: '2026-08-10' };
    const primeira: EntradaCatalogo = {
      id: 'sintetica-primeira',
      titulo: 'primeira',
      gatilho_zh: '甲',
      evitar_pt: /\bum\b/i,
      certo: 'o certo da PRIMEIRA',
      aferido,
    };
    const segunda: EntradaCatalogo = { ...primeira, id: 'sintetica-segunda', certo: 'o certo da SEGUNDA' };
    const entradas = [primeira, segunda];

    it('cada id devolve o seu próprio `certo`', () => {
      expect(orientacaoDaRegra('sintetica-primeira', entradas)).toBe('o certo da PRIMEIRA');
      // A que pega quem devolve sempre a primeira entrada.
      expect(orientacaoDaRegra('sintetica-segunda', entradas)).toBe('o certo da SEGUNDA');
    });

    it('regra fora do catálogo devolve null — estilo puro não tem orientação', () => {
      expect(orientacaoDaRegra('aspas-nao-retas', entradas)).toBeNull();
      expect(orientacaoDaRegra('mais-que-perfeito')).toBeNull();
    });

    it('sem entradas explícitas, consulta o CATALOGO real', () => {
      for (const e of CATALOGO) expect(orientacaoDaRegra(e.id)).toBe(e.certo);
    });
  });
});
