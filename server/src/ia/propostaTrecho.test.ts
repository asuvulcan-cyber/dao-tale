import { describe, expect, it } from 'vitest';
import { propostaPareceTrecho } from '@dao-tale/shared';

// O contrato manda a IA devolver "a frase COMPLETA corrigida" — mas ela nem
// sempre obedece, e aplicar a proposta SUBSTITUI a frase inteira. O caso abaixo
// aconteceu de verdade na 死人经 e apagou duas orações sem nenhum aviso.

describe('propostaPareceTrecho', () => {
  const completa =
    'Na mente do velho mestre havia apenas uma lembrança vaga. O forasteiro certamente morreria sob as lanças ' +
    'da Torre de Bronze. Se conseguira fazer o Senhor das Dez Trilhas dobrar o joelho uma vez, sua morte já ' +
    'podia ser considerada valiosa.';

  it('acusa o caso real: a IA devolveu só a oração que consertou', () => {
    const soUmTrecho =
      'Se tinha conseguido fazer o Senhor das Dez Trilhas dobrar o joelho uma vez, sua morte já podia ser ' +
      'considerada valiosa.';
    expect(propostaPareceTrecho(completa, soUmTrecho)).toBe(true);
  });

  it('não acusa a mesma frase reescrita por inteiro', () => {
    const inteiraCorrigida =
      'Na mente do velho mestre havia apenas uma lembrança vaga. O forasteiro certamente morreria sob as lanças ' +
      'da Torre de Bronze. Se tinha conseguido fazer o Senhor das Dez Trilhas dobrar o joelho uma vez, sua ' +
      'morte já podia ser considerada valiosa.';
    expect(propostaPareceTrecho(completa, inteiraCorrigida)).toBe(false);
  });

  it('não acusa aperto de estilo, que é encurtar legítimo', () => {
    expect(propostaPareceTrecho('Ele disse que não iria de jeito nenhum.', 'Ele disse que não iria.')).toBe(false);
  });

  it('não acusa frase curta, onde qualquer corte percentual é ruído', () => {
    expect(propostaPareceTrecho('Ele sorriu.', 'Sorriu.')).toBe(false);
  });

  it('não quebra com texto vazio', () => {
    expect(propostaPareceTrecho('', 'qualquer coisa')).toBe(false);
  });
});
