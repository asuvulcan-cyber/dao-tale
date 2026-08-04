import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { analisarEstilo } from './estiloViolacoes.js';

const frases = (textos: string[]) => textos.map((texto_pt, ordem) => ({ ordem, texto_pt }));

describe('analisarEstilo', () => {
  it('acusa mais-que-perfeito simples quando a obra pediu para evitar', () => {
    const r = analisarEstilo(frases(['Ele cumprira a promessa.', 'Ele tinha cumprido a promessa.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'evitar',
    });
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0]).toMatchObject({ ordem: 0, regra: 'mais-que-perfeito', trecho: 'cumprira' });
  });

  it('não acusa nada quando a obra permite a forma simples', () => {
    const r = analisarEstilo(frases(['Ele cumprira a promessa.']), {
      ...PREFERENCIAS_PADRAO,
      mais_que_perfeito: 'permitir',
    });
    expect(r.violacoes).toHaveLength(0);
  });

  it('não confunde substantivo terminado em -eira/-ora com verbo', () => {
    const r = analisarEstilo(
      frases(['Que besteira, disse a senhora na cadeira de madeira, agora mesmo, com a bandeira inteira.']),
      { ...PREFERENCIAS_PADRAO, mais_que_perfeito: 'evitar' },
    );
    expect(r.violacoes).toHaveLength(0);
  });

  it('acusa travessão numa obra configurada com aspas', () => {
    const r = analisarEstilo(frases(['— Matem todos!']), { ...PREFERENCIAS_PADRAO, dialogo: 'aspas' });
    expect(r.violacoes.map((v) => v.regra)).toContain('dialogo-aspas');
  });

  it('acusa aspas asiáticas não convertidas', () => {
    const r = analisarEstilo(frases(['「不可能」, disse ele.']), PREFERENCIAS_PADRAO);
    expect(r.violacoes.map((v) => v.regra)).toContain('aspas-asiaticas');
  });

  it('mostra a concentração por terço — o que separa regra ruim de bloco grande', () => {
    // O padrão real do prólogo da 死人经: limpo no começo, sujo no fim. Regra mal
    // escrita erraria espalhado; isto é decaimento ao longo da mesma resposta.
    const textos = Array.from({ length: 30 }, (_, i) => (i >= 20 ? 'Ele escapara dali.' : 'Ele tinha escapado dali.'));
    const r = analisarEstilo(frases(textos), { ...PREFERENCIAS_PADRAO, mais_que_perfeito: 'evitar' });
    expect(r.por_terco[0]).toBe(0);
    expect(r.por_terco[1]).toBe(0);
    expect(r.por_terco[2]).toBe(10);
  });
});
