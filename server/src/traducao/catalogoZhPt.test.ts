import { describe, expect, it } from 'vitest';
import { REPROVADAS, type EntradaCatalogo } from '@dao-tale/shared';
import { varrerCatalogo } from './catalogoZhPt.js';

const frase = (over: Partial<Parameters<typeof varrerCatalogo>[0][number]>) => ({
  id: 1,
  ordem: 0,
  texto_zh: '',
  texto_pt: '',
  status_traducao: 'traduzida',
  ...over,
});

describe('varrerCatalogo', () => {
  it('acusa quando o gatilho está no zh E o reflexo está no pt', () => {
    const r = varrerCatalogo([
      frase({ id: 7, ordem: 3, texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.' }),
    ]);
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0]).toMatchObject({ frase_id: 7, ordem: 3, entrada_id: 'particula-yizhi', gatilho_zh: '一直' });
    expect(r.violacoes[0].trecho_pt).toContain('sempre');
  });

  it('não acusa sem o gatilho no chinês — é o que a torna bilíngue', () => {
    const r = varrerCatalogo([frase({ texto_zh: '他总在等。', texto_pt: 'Ele sempre esteve esperando.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('não acusa quando o português já está certo', () => {
    const r = varrerCatalogo([frase({ texto_zh: '他一直在等。', texto_pt: 'Ele vinha esperando até então.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('só examina frase traduzida', () => {
    const r = varrerCatalogo([
      frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.', status_traducao: 'pendente' }),
    ]);
    expect(r.violacoes).toEqual([]);
    expect(r.frases_examinadas).toBe(0);
  });

  it('respeita a dispensa por trinca (frase, regra, trecho)', () => {
    const frases = [frase({ id: 7, texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.' })];
    const trecho = varrerCatalogo(frases).violacoes[0].trecho_pt;
    const r = varrerCatalogo(frases, new Set([`7|particula-yizhi|${trecho}`]));
    expect(r.violacoes).toEqual([]);
  });

  it('não usa as reprovadas', () => {
    // 都 → "todos" acusaria 31 vezes na obra real e nenhuma foi correção.
    const r = varrerCatalogo([frase({ texto_zh: '他们都来了。', texto_pt: 'Todos eles vieram.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('aceita entradas explícitas — é como a aferição mede as reprovadas', () => {
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const r = varrerCatalogo([frase({ texto_zh: '他们都来了。', texto_pt: 'Todos eles vieram.' })], new Set(), [dou]);
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0].entrada_id).toBe('particula-dou');
  });

  it('o trecho é estável entre duas varreduras do mesmo texto', () => {
    const frases = [frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando ali.' })];
    expect(varrerCatalogo(frases).violacoes[0].trecho_pt).toBe(varrerCatalogo(frases).violacoes[0].trecho_pt);
  });

  it('o trecho corta na quebra de linha quando ela está dentro da janela de contexto', () => {
    // A quebra vem logo depois do match — dentro da janela de 40 de contexto —
    // para o teste de fato exercitar o corte por `\n` e não passar por
    // construção (a janela do teste anterior deixava a quebra fora do alcance).
    const r = varrerCatalogo([frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre\nesteve esperando.' })]);
    expect(r.violacoes[0].trecho_pt).toBe('sempre');
  });

  it('o trecho respeita o teto de 60 caracteres mesmo com um match longo', () => {
    // Entrada sintética com `evitar_pt` que casa um trecho comprido — o piso de
    // 60 só decorre de CONTEXTO=40 mais um match curto; sem TRECHO_MAX explícito
    // esta entrada furaria o teto sem nada acusar.
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const matchLongo = { ...dou, id: 'sintetica-match-longo', gatilho_zh: '一直', evitar_pt: /sempre[^.]*/i };
    const pt = `Ele sempre ${'x'.repeat(100)}.`;
    const r = varrerCatalogo([frase({ texto_zh: '他一直在等。', texto_pt: pt })], new Set(), [matchLongo]);
    expect(r.violacoes[0].trecho_pt.length).toBe(60);
  });

  it('uma frase que dispara duas entradas gera duas violações', () => {
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const yizhi = { ...dou, id: 'particula-yizhi', gatilho_zh: '一直', evitar_pt: /\bsempre\b/i };
    const r = varrerCatalogo(
      [frase({ texto_zh: '他们一直都来。', texto_pt: 'Todos eles sempre vêm.' })],
      new Set(),
      [dou, yizhi],
    );
    expect(r.violacoes.map((v) => v.entrada_id).sort()).toEqual(['particula-dou', 'particula-yizhi']);
    // Uma frase, duas violações — mas `frases_examinadas` conta frases.
    expect(r.frases_examinadas).toBe(1);
  });
});
