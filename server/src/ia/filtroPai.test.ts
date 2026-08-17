import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { filtrarGlossarioRelevante } from './prompts.js';

// Fixture local (mesmo padrão de glossarioNoPrompt.test.ts): valores-padrão de "nunca
// classificado", com override para o que cada caso precisa — aqui, sobretudo id e
// termo_pai_id, que a suíte principal de prompts.test.ts não exercita.
const entrada = (termo_zh: string, termo_pt: string, over: Partial<EntradaGlossario> = {}): EntradaGlossario => ({
  id: 0,
  obra_id: 1,
  termo_zh,
  termo_pt,
  categoria: 'termo',
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

// termo_pai_id é PERTENCIMENTO (西堡 fica dentro de 金鹏堡) — distinto de principal_id,
// que é variante do mesmo referente e já é coberto por incluirPrincipais. Estes testes
// cobrem só o vizinho novo: o pai entrando no filtro por bloco (spec 2026-08-16, Task 4).
describe('filtrarGlossarioRelevante — termo_pai_id (pertencimento, não variante)', () => {
  it('trecho com o filho traz o pai junto, mesmo sem o chinês do pai no texto', () => {
    const pai = entrada('金鹏堡', 'Fortaleza do Peng Dourado', { id: 1 });
    const filho = entrada('西堡', 'Forte Oeste', { id: 2, termo_pai_id: 1 });
    const filtrado = filtrarGlossarioRelevante([pai, filho], ['诸位请随我前往西堡']);
    // 金鹏堡 não aparece no texto — só entra porque é pai do termo presente. É a
    // ÚNICA exceção à regra "só o que está no texto", e a razão de a coluna existir.
    expect(filtrado.map((e) => e.termo_zh)).toEqual(['西堡', '金鹏堡']);
  });

  it('sobe UM nível só: numa cadeia neto → filho → avô, o avô não entra', () => {
    const avo = entrada('金鹏堡', 'Fortaleza do Peng Dourado', { id: 1 });
    const filho = entrada('西堡', 'Forte Oeste', { id: 2, termo_pai_id: 1 });
    const neto = entrada('演武场', 'Campo de Treino', { id: 3, termo_pai_id: 2 });
    const filtrado = filtrarGlossarioRelevante([avo, filho, neto], ['前往演武场比试']);
    // Dois níveis entregariam a obra inteira num trecho com topônimo aninhado — o
    // filtro existe para ENCOLHER o prompt, não para percorrer a árvore toda.
    expect(filtrado.map((e) => e.termo_zh)).toEqual(['演武场', '西堡']);
  });

  it('dois filhos do mesmo pai trazem o pai uma única vez', () => {
    const pai = entrada('金鹏堡', 'Fortaleza do Peng Dourado', { id: 1 });
    const filho1 = entrada('西堡', 'Forte Oeste', { id: 2, termo_pai_id: 1 });
    const filho2 = entrada('东堡', 'Forte Leste', { id: 3, termo_pai_id: 1 });
    const filtrado = filtrarGlossarioRelevante([pai, filho1, filho2], ['西堡与东堡两地相邻']);
    expect(filtrado.map((e) => e.termo_zh)).toEqual(['西堡', '东堡', '金鹏堡']);
  });

  it('o pai já presente no texto não entra de novo', () => {
    const pai = entrada('金鹏堡', 'Fortaleza do Peng Dourado', { id: 1 });
    const filho = entrada('西堡', 'Forte Oeste', { id: 2, termo_pai_id: 1 });
    const filtrado = filtrarGlossarioRelevante([pai, filho], ['金鹏堡辖下的西堡']);
    expect(filtrado.map((e) => e.termo_zh)).toEqual(['金鹏堡', '西堡']);
    expect(filtrado).toHaveLength(2);
  });

  it('termo_pai_id nulo ou apontando para id inexistente não quebra nem inventa entrada', () => {
    const semPai = entrada('齐夏', 'Qi Xia', { id: 1, termo_pai_id: null });
    const paiFantasma = entrada('影卫', 'Guarda Sombra', { id: 2, termo_pai_id: 999 });
    const filtrado = filtrarGlossarioRelevante([semPai, paiFantasma], ['齐夏与影卫同行']);
    expect(filtrado.map((e) => e.termo_zh)).toEqual(['齐夏', '影卫']);
  });

  it('ciclo entre dois termos (A pai de B, B pai de A) não trava nem duplica', () => {
    const a = entrada('甲', 'Jia', { id: 1, termo_pai_id: 2 });
    const b = entrada('乙', 'Yi', { id: 2, termo_pai_id: 1 });
    // Só 甲 está no texto: puxa 乙 como pai (um nível). Nada impede esse par no banco
    // — o filtro não pode travar nem duplicar, mesmo sem checagem explícita de ciclo.
    const filtrado = filtrarGlossarioRelevante([a, b], ['甲地']);
    expect(filtrado.map((e) => e.termo_zh)).toEqual(['甲', '乙']);
    expect(filtrado).toHaveLength(2);
  });

  it('preserva a ordem: termos presentes primeiro na ordem original, pais ao final', () => {
    const pai = entrada('金鹏堡', 'Fortaleza do Peng Dourado', { id: 1 });
    const filho = entrada('西堡', 'Forte Oeste', { id: 2, termo_pai_id: 1 });
    const solto = entrada('齐夏', 'Qi Xia', { id: 3 });
    // O pai vem PRIMEIRO no glossário mas está AUSENTE do texto — não deve furar a
    // fila dos presentes. A saída alimenta um prompt cacheado por prefixo: ordem
    // instável quebra o cache e custa dinheiro real.
    const filtrado = filtrarGlossarioRelevante([pai, filho, solto], ['西堡的齐夏']);
    expect(filtrado.map((e) => e.termo_zh)).toEqual(['西堡', '齐夏', '金鹏堡']);
  });
});
