import { describe, expect, it } from 'vitest';
import { trechoQueMudou } from '@dao-tale/shared';

describe('trechoQueMudou', () => {
  it('isola a palavra que mudou no meio da frase', () => {
    expect(trechoQueMudou('ele já é um morto agora', 'ele já é um cadáver agora')).toEqual({
      de: 'morto',
      para: 'cadáver',
    });
  });

  it('pega inserção pura', () => {
    expect(trechoQueMudou('o mestre era rico', 'o mestre era muito rico')).toEqual({
      de: 'rico',
      para: 'muito rico',
    });
  });

  it('pega remoção pura', () => {
    expect(trechoQueMudou('deu um sinal', 'deu sinal')).toEqual({ de: 'um sinal', para: 'sinal' });
  });

  it('textos iguais devolvem par vazio', () => {
    expect(trechoQueMudou('igual', 'igual')).toEqual({ de: '', para: '' });
  });

  it('mudança no começo não come o resto', () => {
    expect(trechoQueMudou('Matar é limpo', 'O ato de matar é limpo')).toEqual({
      de: 'Matar',
      para: 'O ato de matar',
    });
  });

  it('prefixo e sufixo comuns não se sobrepõem', () => {
    // "aa" -> "aaa": o sufixo comum não pode consumir letras que o prefixo já contou,
    // senão o trecho sai negativo e a função devolve lixo.
    expect(trechoQueMudou('aa', 'aaa')).toEqual({ de: 'aa', para: 'aaa' });
  });

  it('não parte a palavra no meio — é o caso que motiva a expansão', () => {
    // Sem expansão isto devolveria { de: 'ara', para: 'ou' }, ilegível no relatório.
    expect(trechoQueMudou('concluindo que ele errara.', 'concluindo que ele errou.')).toEqual({
      de: 'errara.',
      para: 'errou.',
    });
  });
});
