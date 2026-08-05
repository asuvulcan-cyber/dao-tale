import { describe, expect, it } from 'vitest';
import { contemTermoFlexionado } from './flexao.js';

// Os falsos positivos abaixo apareceram na varredura real da 死人经 e fizeram o
// indicador "2 glossário" acusar erro onde não havia — o pior tipo de defeito
// num aviso, porque ensina o usuário a ignorá-lo.

describe('contemTermoFlexionado', () => {
  it('aceita o plural, que o núcleo trata como uso correto', () => {
    expect(contemTermoFlexionado('Os Reis Incomparáveis das gerações passadas', 'Rei Incomparável')).toBe(true);
    expect(contemTermoFlexionado('Sete gerações de Reis Incomparáveis', 'Rei Incomparável')).toBe(true);
  });

  it('aceita a forma exata, e caso ou acento diferentes', () => {
    expect(contemTermoFlexionado('o Rei Incomparável entrou', 'Rei Incomparável')).toBe(true);
    expect(contemTermoFlexionado('o rei incomparavel entrou', 'Rei Incomparável')).toBe(true);
  });

  it('aceita variação de artigo entre as palavras do termo', () => {
    expect(contemTermoFlexionado('a Fortaleza de Peng Dourado', 'Fortaleza do Peng Dourado')).toBe(true);
    expect(contemTermoFlexionado('as Fortalezas do Peng Dourado', 'Fortaleza do Peng Dourado')).toBe(true);
  });

  it('continua acusando quando o termo REALMENTE não está', () => {
    expect(contemTermoFlexionado('o Rei Supremo entrou', 'Rei Incomparável')).toBe(false);
    expect(contemTermoFlexionado('o homem de preto disse', 'Gu Shenwei')).toBe(false);
    expect(contemTermoFlexionado('a espada curta caiu', 'sabre')).toBe(false);
  });

  it('palavra curta não vira coringa', () => {
    // "rei" não pode casar com "reino": é o risco de afrouxar demais.
    expect(contemTermoFlexionado('o reino caiu', 'rei')).toBe(false);
    expect(contemTermoFlexionado('os reis caíram', 'rei')).toBe(true);
  });
});
