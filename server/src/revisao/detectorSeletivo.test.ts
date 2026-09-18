import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { detectarRevisaoSeletiva } from './detectorSeletivo.js';

const frase = (ordem: number, texto_pt: string, texto_zh = '甲') => ({ id: ordem + 1, ordem, texto_zh, texto_pt });

describe('detector seletivo', () => {
  it('roteia regra objetiva e Gama para revisão prioritária sem alterar texto', () => {
    const entrada = frase(0, 'Ele fez um kowtow e permaneceu imóvel.', '内功');
    const [d] = detectarRevisaoSeletiva([entrada], PREFERENCIAS_PADRAO, [{
      termo_zh: '内功', termo_pt: 'arte de energia interna', categoria: 'conceito', especie: 'identidade',
    } as any]);
    expect(entrada.texto_pt).toBe('Ele fez um kowtow e permaneceu imóvel.');
    expect(d).toMatchObject({ prioridade: 'alta', foco: 'fidelidade' });
    expect(d.fenomenos).toEqual(expect.arrayContaining(['gama', 'literalidade', 'registro']));
  });

  it('não acusa frase corrente curta sem sinal conhecido', () => {
    expect(detectarRevisaoSeletiva([frase(0, 'Ele ficou imóvel.')], PREFERENCIAS_PADRAO, [])).toEqual([]);
  });

  it('não envia anterioridade composta isolada para revisão paga', () => {
    expect(detectarRevisaoSeletiva([frase(0, 'Não tinha maltratado nem traído ninguém.')], PREFERENCIAS_PADRAO, [])).toEqual([]);
  });

  it('não roteia comprimento isolado como se fosse defeito literário', () => {
    const longa = 'Ele atravessou o pátio enquanto os outros garotos observavam em silêncio, sem saber se deveriam acompanhá-lo ou permanecer junto ao portão até que alguém lhes dissesse o que fazer, porque aquela manhã começou de modo diferente das anteriores e ninguém entendia ainda a razão.';
    expect(detectarRevisaoSeletiva([frase(0, longa)], PREFERENCIAS_PADRAO, [])).toEqual([]);
  });

  it('não paga revisão só por capitalização, mas mantém o contexto em outro diagnóstico', () => {
    expect(detectarRevisaoSeletiva([frase(0, 'Todos queriam virar Assassinos.')], PREFERENCIAS_PADRAO, [])).toEqual([]);
    const [d] = detectarRevisaoSeletiva([frase(0, 'Os Assassinos permaneceram ali com altivez.')], PREFERENCIAS_PADRAO, []);
    expect(d.fenomenos).toContain('capitalizacao-contextual');
    expect(d.razoes.some(r => r.includes('Confirmar'))).toBe(true);
  });

  it('separa aspas de conteúdo sem ocultar outros sinais na mesma frase', () => {
    expect(detectarRevisaoSeletiva([frase(0, 'Ele disse “não”.')], PREFERENCIAS_PADRAO, [])).toEqual([]);
    const [d] = detectarRevisaoSeletiva([frase(0, 'Ele disse “não” com altivez.')], PREFERENCIAS_PADRAO, []);
    expect(d.fenomenos).toContain('registro');
    expect(d.razoes.some(r => r.includes('aspas-nao-retas'))).toBe(false);
  });

  it('não transforma substantivos nem repetições idiomáticas em diagnóstico', () => {
    expect(detectarRevisaoSeletiva([frase(0, 'Na terceira câmara, a operação era assustadora; avançou de passo em passo.')], PREFERENCIAS_PADRAO, [])).toEqual([]);
  });

  it('detecta redundância comprovada sem acusar a expressão carne viva', () => {
    expect(detectarRevisaoSeletiva([frase(0, 'A carne em carne viva.')], PREFERENCIAS_PADRAO, [])[0].fenomenos).toContain('literalidade');
    expect(detectarRevisaoSeletiva([frase(0, 'Estava em carne viva.')], PREFERENCIAS_PADRAO, [])).toEqual([]);
  });

  it('roteia formalismo e decalque confirmados no capítulo 19 sem corrigi-los mecanicamente', () => {
    const ds = detectarRevisaoSeletiva([
      frase(0, 'Dele emanavam rudeza e altivez nas paragens prósperas.'),
      frase(1, 'Qi Nu tomou a iniciativa de se aproximar; seu tom era afirmativo.'),
    ], PREFERENCIAS_PADRAO, []);
    expect(ds).toHaveLength(2);
    expect(ds[0].fenomenos).toContain('registro');
    expect(ds[1].fenomenos).toContain('literalidade');
  });
});
