import { describe, expect, it } from 'vitest';
import { contemTermoFlexionado } from './flexao.js';

// Os falsos positivos abaixo apareceram na varredura real da 死人经 e fizeram o
// indicador "2 glossário" acusar erro onde não havia — o pior tipo de defeito
// num aviso, porque ensina o usuário a ignorá-lo.

describe('contemTermoFlexionado', () => {
  it('aceita o plural, que o núcleo trata como uso correto', () => {
    expect(contemTermoFlexionado('Os Senhores das Dez Trilhas das gerações passadas', 'Senhor das Dez Trilhas')).toBe(true);
    expect(contemTermoFlexionado('Sete gerações de Senhores das Dez Trilhas', 'Senhor das Dez Trilhas')).toBe(true);
  });

  it('aceita a forma exata, e caso ou acento diferentes', () => {
    expect(contemTermoFlexionado('o Senhor das Dez Trilhas entrou', 'Senhor das Dez Trilhas')).toBe(true);
    expect(contemTermoFlexionado('o senhor das dez trilhas entrou', 'Senhor das Dez Trilhas')).toBe(true);
  });

  it('aceita variação de artigo entre as palavras do termo', () => {
    expect(contemTermoFlexionado('o Templo de Shaolin', 'Templo do Shaolin')).toBe(true);
    expect(contemTermoFlexionado('os Templos do Shaolin', 'Templo do Shaolin')).toBe(true);
  });

  it('continua acusando quando o termo REALMENTE não está', () => {
    expect(contemTermoFlexionado('o Rei Supremo entrou', 'Senhor das Dez Trilhas')).toBe(false);
    expect(contemTermoFlexionado('o homem de preto disse', 'Tie Xin')).toBe(false);
    expect(contemTermoFlexionado('a espada curta caiu', 'sabre')).toBe(false);
  });

  it('palavra curta não vira coringa', () => {
    // "rei" não pode casar com "reino": é o risco de afrouxar demais.
    expect(contemTermoFlexionado('o reino caiu', 'rei')).toBe(false);
    expect(contemTermoFlexionado('os reis caíram', 'rei')).toBe(true);
  });
});
