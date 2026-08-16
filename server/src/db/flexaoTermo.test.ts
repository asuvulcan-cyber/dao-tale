import { describe, expect, it } from 'vitest';
import { padraoDeTermo } from '@dao-tale/shared';

/** Ajuda: o padrão casa este texto? Mesma normalização das duas pontas. */
const casa = (texto: string, termo: string): boolean => {
  const p = padraoDeTermo(termo);
  if (!p) return false;
  const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return new RegExp(`\\b${p}`, 'u').test(normalizar(texto));
};

describe('padraoDeTermo', () => {
  it('casa o plural simples', () => {
    expect(casa('os assassinos atacaram', 'Assassino')).toBe(true);
    expect(casa('dois sabres', 'sabre')).toBe(true);
  });

  it('casa a variação de gênero pelo radical', () => {
    expect(casa('as senhoras chegaram', 'Senhor')).toBe(true);
    expect(casa('os senhores chegaram', 'Senhor')).toBe(true);
  });

  it('casa o termo composto com o plural na primeira palavra', () => {
    expect(casa('dois Homens de Sabre entraram', 'Homem de Sabre')).toBe(true);
  });

  it('aceita variação de conector dentro do termo', () => {
    expect(casa('a Fortaleza de Peng caiu', 'Fortaleza do Peng')).toBe(true);
  });

  it('palavra curta não invade palavra maior', () => {
    // A regra de duas faixas: com <= 4 letras só o plural simples é aceito,
    // senão "rei" grifaria dentro de "reino" e o revisor veria marca no lugar
    // errado — pior que marca nenhuma.
    expect(casa('o reino caiu', 'rei')).toBe(false);
    expect(casa('os reis caíram', 'rei')).toBe(true);
  });

  it('termo vazio ou só de conectores não vira padrão', () => {
    expect(padraoDeTermo('')).toBeNull();
    expect(padraoDeTermo('de do da')).toBeNull();
  });
});
