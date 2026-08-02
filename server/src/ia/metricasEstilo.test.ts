import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { metricasEstilo } from './metricasEstilo.js';

const entrada = (termo_zh: string, termo_pt: string): EntradaGlossario =>
  ({ id: 1, obra_id: 1, termo_zh, termo_pt, categoria: 'personagem', nota: null, principal_id: null }) as EntradaGlossario;

describe('metricasEstilo', () => {
  it('conta "aquele" e contrações, com acento e tudo', () => {
    const m = metricasEstilo('Aquele homem olhou para aquela espada, naquele instante, e lembrou daquilo. Àquela hora.');
    expect(m.aquele).toBe(5);
  });

  it('o exemplo contrastivo do núcleo mede o que promete', () => {
    const calcado = metricasEstilo('Aquele homem olhou para aquela espada e sentiu aquele frio subir pelas costas.');
    const natural = metricasEstilo('O homem olhou para a espada e sentiu o frio subir pelas costas.');
    expect(calcado.demonstrativos).toBe(3);
    expect(natural.demonstrativos).toBe(0);
  });

  it('demonstrativos incluem este/esse e contrações, mas não verbos parecidos', () => {
    const m = metricasEstilo('Esta espada. Neste lugar. Desse jeito. Ele está aqui e vai estar amanhã.');
    expect(m.demonstrativos).toBe(3);
  });

  it('pega os decalques nomeados no núcleo', () => {
    expect(metricasEstilo('A outra parte abriu a boca para falar.').decalques).toBe(2);
    expect(metricasEstilo('Ele disse.').decalques).toBe(0);
  });

  it('conta advérbios em -mente sem confundir com o substantivo "mente"', () => {
    const m = metricasEstilo('Ele cruzou rapidamente e nervosamente, com a mente vazia.');
    expect(m.mente).toBe(2);
  });

  it('cobra do glossário só os termos que o chinês trazia', () => {
    const glossario = [entrada('林风', 'Lin Feng'), entrada('女娲', 'Nüwa')];
    const m = metricasEstilo('lin feng ergueu a espada.', { glossario, textoZh: '林风举起剑。' });
    expect(m.glossario_esperados).toBe(1);
    expect(m.glossario_aplicados).toBe(1);

    const errado = metricasEstilo('O rapaz ergueu a espada.', { glossario, textoZh: '林风举起剑。' });
    expect(errado.glossario_aplicados).toBe(0);
  });

  it('texto vazio não quebra', () => {
    expect(metricasEstilo('')).toMatchObject({ palavras: 0, aquele: 0, demonstrativos: 0 });
  });
});
