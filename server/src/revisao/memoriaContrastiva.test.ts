import { describe, expect, it } from 'vitest';
import { selecionarMemoriaContrastiva } from './memoriaContrastiva.js';

const alvo = (texto_pt: string, texto_zh = '甲') => ({
  ordem: 1, paragrafo: 1, inicio_paragrafo: true, apos_fala_em_outro_paragrafo: false,
  texto_zh, texto_pt, texto_pt_original_ia: texto_pt,
});

describe('memória contrastiva', () => {
  it('prioriza categoria e Gama compartilhado sem depender da referência de teste', () => {
    const memoria = [
      { capitulo: 1, ordem: 1, texto_zh: '内功甲', texto_rejeitado: 'Ele permaneceu.', texto_aprovado: 'Ele ficou.', justificativa: null, categorias: ['naturalidade', 'lexico'] },
      { capitulo: 2, ordem: 2, texto_zh: '乙', texto_rejeitado: 'Número incorreto.', texto_aprovado: 'Número correto.', justificativa: null, categorias: ['fidelidade'] },
    ];
    const [primeiro] = selecionarMemoriaContrastiva(
      [alvo('Ele permaneceu nutrindo esperança.', '内功')],
      memoria,
      [{ termo_zh: '内功', termo_pt: 'arte de energia interna', categoria: 'conceito' } as any],
      1,
    );
    expect(primeiro.capitulo).toBe(1);
  });

  it('é determinística e respeita o limite', () => {
    const memoria = Array.from({ length: 8 }, (_, i) => ({
      capitulo: 1, ordem: i, texto_zh: '甲', texto_rejeitado: `Texto ${i}.`, texto_aprovado: `Versão ${i}.`, justificativa: null, categorias: ['naturalidade'],
    }));
    expect(selecionarMemoriaContrastiva([alvo('Texto.')], memoria, [], 3).map((x) => x.ordem)).toEqual([0, 1, 2]);
  });
});
