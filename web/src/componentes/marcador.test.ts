import { describe, expect, it } from 'vitest';
import { montarMarcadorGlossario } from './TextoRico';

const entrada = (id: number, termo_zh: string, termo_pt: string) =>
  ({ id, obra_id: 1, termo_zh, termo_pt, categoria: 'outro', nota: null,
     origem: 'manual', principal_id: null, criado_em: '' }) as never;

const GLOSSARIO = [
  entrada(1, '杀手', 'Assassino'),
  entrada(2, '刀手', 'Homem de Sabre'),
  entrada(3, '刀', 'sabre'),
  entrada(4, '主子', 'senhor'),
];

/** Os trechos que o grifo marcaria no texto. */
function grifados(texto: string): string[] {
  const m = montarMarcadorGlossario(GLOSSARIO)!;
  return [...texto.matchAll(m.regexPt!)].map((x) => x[1]);
}

describe('grifo do glossário', () => {
  it('grifa o plural — era o buraco do relato', () => {
    expect(grifados('Os Assassinos atacaram.')).toEqual(['Assassinos']);
    expect(grifados('dois sabres')).toEqual(['sabres']);
  });

  it('grifa a variação de gênero', () => {
    expect(grifados('as Senhoras chegaram.')).toEqual(['Senhoras']);
  });

  it('a caixa continua indiferente', () => {
    expect(grifados('O assassino sorriu.')).toEqual(['assassino']);
  });

  it('o termo composto vence o termo contido nele', () => {
    // Hoje "Dois Homens de Sabre" grifa só "Sabre" e a glosa aponta para 刀 —
    // a entrada ERRADA. Este é o caso que prova que afrouxar a fronteira não
    // basta: o composto precisa ganhar do contido.
    expect(grifados('Dois Homens de Sabre entraram.')).toEqual(['Homens de Sabre']);
  });

  it('palavra curta não invade palavra maior', () => {
    const m = montarMarcadorGlossario([entrada(5, '王', 'rei')])!;
    expect([...'o reino caiu'.matchAll(m.regexPt!)]).toHaveLength(0);
    expect([...'os reis caíram'.matchAll(m.regexPt!)].map((x) => x[1])).toEqual(['reis']);
  });

  it('a glosa do trecho flexionado ainda encontra a entrada', () => {
    // A glosa é indexada pelo termo canônico; com o trecho flexionado o
    // `Map.get` direto falha, e o revisor vê grifo sem explicação no title.
    const m = montarMarcadorGlossario(GLOSSARIO)!;
    expect(m.glosaDoTrecho('Assassinos')).toContain('杀手');
  });
});
