import { describe, expect, it } from 'vitest';
import { classificarEdicoes } from './edicoesManuais.js';

const base = { id: 1, ordem: 0, capitulo_numero: 1, texto_zh: '甲', editado_manualmente: true, origem_edicao: null };
const glossario = [
  { id: 1, obra_id: 1, termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar', nota: null, principal_id: null, criado_em: '' },
] as never[];

const uma = (ia: string, voce: string, extra: Record<string, unknown> = {}) =>
  classificarEdicoes([{ ...base, texto_pt_original_ia: ia, texto_pt: voce, ...extra }], glossario);

describe('classificarEdicoes', () => {
  it('aspas curvas viram tipografia', () => {
    expect(uma('ele disse ‘vá’ agora', "ele disse 'vá' agora")[0].rota).toBe('tipografia');
  });

  it('termo do glossário fora da forma canônica vai para glossário', () => {
    const r = uma('a Fortaleza Jinpeng caiu', 'a Fortaleza do Peng Dourado caiu');
    expect(r[0].rota).toBe('glossario');
    expect(r[0].detalhe).toBe('Fortaleza do Peng Dourado');
  });

  it('mais-que-perfeito desfeito vai para chave de estilo', () => {
    const r = uma('concluindo que ele errara', 'concluindo que ele errou');
    expect(r[0].rota).toBe('chave-estilo');
  });

  it('decalque desfeito vai para núcleo', () => {
    const r = uma('a outra parte recuou', 'o inimigo recuou');
    expect(r[0].rota).toBe('nucleo');
  });

  it('troca vocabular sem tema vira candidato a diretriz', () => {
    const r = uma('ele já é um morto', 'ele já é um cadáver');
    expect(r[0].rota).toBe('diretriz');
    expect(r[0]).toMatchObject({ de: 'morto', para: 'cadáver' });
  });

  it('glossário vence tema quando os dois casariam', () => {
    // "Fortaleza Jinpeng -> Fortaleza do Peng Dourado" casaria o tema `glossario`
    // por conter a palavra; o que interessa é QUAL termo, não que é glossário.
    expect(uma('a Fortaleza Jinpeng caiu', 'a Fortaleza do Peng Dourado caiu')[0].detalhe).not.toBeNull();
  });

  it('edição vinda de botão não entra', () => {
    expect(uma('ele errara', 'ele errou', { origem_edicao: 'revisao' })).toHaveLength(0);
    expect(uma('ele errara', 'ele errou', { origem_edicao: 'passe-estilo' })).toHaveLength(0);
  });

  it('frase sem edição ou sem original não entra', () => {
    expect(uma('igual', 'igual')).toHaveLength(0);
    expect(classificarEdicoes([{ ...base, texto_pt_original_ia: null, texto_pt: 'x' }], glossario)).toHaveLength(0);
  });
});
