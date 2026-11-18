import { describe, it, expect } from 'vitest';
import { PERFIL_INGLES, PERFIL_MANDARIM, perfilDe, IDIOMA_ORIGEM_PADRAO } from '@dao-tale/shared';
import { PERFIL_SERVIDOR_INGLES, PERFIL_SERVIDOR_MANDARIM, perfilServidorDe } from './index.js';

describe('perfil mandarim — o comportamento que já existia, agora dito uma vez', () => {
  it('casa termo por substring e junta frases sem separador', () => {
    expect(PERFIL_MANDARIM.casaTermo('他走进金鹏堡。', '金鹏堡')).toBe(true);
    expect(PERFIL_MANDARIM.juntarFrases(['他说。', '她走了。'])).toBe('他说。她走了。');
  });

  it('descarta termo de um caractere, que aparece dentro de dezenas de palavras', () => {
    expect(PERFIL_MANDARIM.termoCurtoDemais('刀')).toBe(true);
    expect(PERFIL_MANDARIM.termoCurtoDemais('金鹏堡')).toBe(false);
  });

  it('reconhece a Extensão A do Han, que a faixa estreita da interface descartava', () => {
    // U+3400–U+4DBF são ideogramas raros mas legítimos. As quatro varreduras
    // antigas divergiam exatamente aqui: a interface e o mock usavam 一-鿿
    // (U+4E00) e classificavam a Extensão A como "não é chinês".
    expect(PERFIL_MANDARIM.ehDaOrigem('㐁')).toBe(true);
    expect(PERFIL_MANDARIM.ehDaOrigem('一')).toBe(true);
    expect(PERFIL_MANDARIM.ehDaOrigem('Nada de chinês aqui')).toBe(false);
  });
});

describe('perfil inglês', () => {
  it('casa termo por limite de palavra — é o conserto que o inglês exigia', () => {
    // Com a regra do mandarim (`includes`) cada um destes daria falso positivo,
    // e a varredura de consistência acusaria a obra inteira.
    expect(PERFIL_INGLES.casaTermo('He made a start.', 'art')).toBe(false);
    expect(PERFIL_INGLES.casaTermo('The food was good.', 'go')).toBe(false);
    expect(PERFIL_INGLES.casaTermo('He entered the Golden Peng Fortress.', 'Golden Peng')).toBe(true);
  });

  it('ignora a caixa, porque termo capitalizado em início de frase é o mesmo termo', () => {
    expect(PERFIL_INGLES.casaTermo('Qi flowed through him.', 'qi')).toBe(true);
  });

  it('não casa termo colado a outra palavra', () => {
    expect(PERFIL_INGLES.casaTermo('He was restarting.', 'start')).toBe(false);
    expect(PERFIL_INGLES.casaTermo('He will start now.', 'start')).toBe(true);
  });

  it('termo contém termo também respeita o limite de palavra', () => {
    expect(PERFIL_INGLES.termoContem('Dark Forest', 'Forest')).toBe(true);
    expect(PERFIL_INGLES.termoContem('Forestall', 'Forest')).toBe(false);
  });

  it('junta frases com espaço', () => {
    expect(PERFIL_INGLES.juntarFrases(['He spoke.', 'She left.'])).toBe('He spoke. She left.');
  });

  it('não tenta adivinhar se o texto já está em português', () => {
    // Inglês e português dividem o alfabeto latino: não há heurística honesta.
    expect(PERFIL_INGLES.ehDaOrigem('He walked away')).toBe(true);
    expect(PERFIL_INGLES.ehDaOrigem('   ')).toBe(false);
  });
});

describe('perfil de servidor', () => {
  it('cada perfil traz o próprio segmentador', () => {
    expect(PERFIL_SERVIDOR_MANDARIM.segmentar('他说。她走了。').frases).toHaveLength(2);
    expect(PERFIL_SERVIDOR_INGLES.segmentar('He spoke. She left.').frases).toHaveLength(2);
  });

  it('unidade da origem existe nos dois, com id de regra próprio', () => {
    // O id é metade da chave de dispensa gravada: o do mandarim não pode mudar.
    expect(PERFIL_SERVIDOR_MANDARIM.detectores.unidadesDaOrigem?.regra).toBe('unidade-chinesa');
    const unidadesEn = PERFIL_SERVIDOR_INGLES.detectores.unidadesDaOrigem!.padrao;
    expect(unidadesEn.test('Andou dez miles.')).toBe(true);
    // Sem numeral antes — o caso que a exigência do mandarim deixaria passar.
    expect(unidadesEn.test('Algumas miles adiante.')).toBe(true);
    expect(unidadesEn.test('Fazia 90 °F à sombra.')).toBe(true);
    expect(unidadesEn.test('Ele voltou para o Acre.')).toBe(false);
    expect(unidadesEn.test('Andou dez quilômetros.')).toBe(false);
  });

  it('catálogo e sinais bilíngues são ausência declarada no inglês, não zero resultados', () => {
    expect(PERFIL_SERVIDOR_MANDARIM.detectores.catalogo).toBe(true);
    expect(PERFIL_SERVIDOR_INGLES.detectores.catalogo).toBe(false);
    expect(PERFIL_SERVIDOR_INGLES.detectores.sinaisBilingues).toBe(false);
  });

  it('escrita vazada só existe quando as escritas diferem', () => {
    expect(PERFIL_SERVIDOR_MANDARIM.detectores.escritaVazada).not.toBeNull();
    expect(PERFIL_SERVIDOR_INGLES.detectores.escritaVazada).toBeNull();
  });

  it('o simulado recorta caractere no mandarim e palavra no inglês', () => {
    expect(PERFIL_SERVIDOR_MANDARIM.extrairTermoSimulado('他走进金鹏堡。', 2)).toEqual(['他', '走']);
    expect(PERFIL_SERVIDOR_INGLES.extrairTermoSimulado('He entered the fortress.', 2)).toEqual(['He', 'entered']);
  });
});

describe('resolução de perfil', () => {
  it('cai no mandarim para valor ausente ou desconhecido', () => {
    expect(IDIOMA_ORIGEM_PADRAO).toBe('zh');
    expect(perfilDe(null).id).toBe('zh');
    expect(perfilDe(undefined).id).toBe('zh');
    expect(perfilDe('klingon').id).toBe('zh');
    expect(perfilDe('en').id).toBe('en');
    expect(perfilServidorDe(null).id).toBe('zh');
    expect(perfilServidorDe('en').id).toBe('en');
  });
});
