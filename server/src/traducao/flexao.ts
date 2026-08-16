// Comparação de termo do glossário tolerante a FLEXÃO.
//
// O núcleo diz que o glossário é lei "inclusive nas flexões" — o plural é uso
// CORRETO, não desvio. Comparando string exata, "Reis Incomparáveis" era acusado
// de não conter "Senhor das Dez Trilhas", e a varredura devolvia duas
// violações que não existiam. Falso positivo é pior que falso negativo aqui:
// ele treina o usuário a ignorar o indicador.

import { padraoDeTermo } from '@dao-tale/shared';

const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** O termo aparece na tradução, aceitando plural e variação de conector?
 *
 *  As REGRAS moram em `shared/src/flexaoTermo.ts` desde que o grifo do editor
 *  passou a precisar delas — aqui fica só a pergunta que a varredura faz. */
export function contemTermoFlexionado(textoPt: string, termoPt: string): boolean {
  const alvo = normalizar(termoPt);
  if (!alvo) return true;
  const padrao = padraoDeTermo(termoPt);
  if (!padrao) return false;
  return new RegExp(`\\b${padrao}`, 'u').test(normalizar(textoPt));
}
