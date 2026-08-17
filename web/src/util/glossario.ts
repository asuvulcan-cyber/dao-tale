// A trava da tela de glossário, fora do desenho — mesmo motivo de
// `consistenciaObra.ts` e `passeEstilo.ts`: errar isto é SILENCIOSO. A tela
// continua bonita e o contador continua ali, só que mentindo, e é exatamente o
// número que decide se o revisor classifica os 116 termos ou ignora o campo
// (spec §7, "a classificação pode nunca acontecer").

import type { EntradaGlossario } from '@dao-tale/shared';

/**
 * Quantos termos ainda não têm `especie` definida.
 *
 * `especie: null` é "nunca classificado" — o estado herdado dos 116 termos da
 * obra real, que hoje se comportam como `identidade` mas não foram uma escolha
 * de ninguém. `'identidade'` e `'lexical'` são respostas; só a ausência conta.
 */
export function contarNaoClassificados(entradas: EntradaGlossario[]): number {
  return entradas.filter((e) => e.especie == null).length;
}
