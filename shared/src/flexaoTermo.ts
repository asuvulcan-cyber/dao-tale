// Regras de flexão de um termo do glossário, em UM lugar só.
//
// Havia dois casadores para a mesma pergunta: `contemTermoFlexionado` (varredura
// de consistência, no servidor) e o regex do grifo do editor (no web). Só o
// primeiro sabia flexão, então "Assassinos" não era grifado e "Dois Homens de
// Sabre" grifava só "Sabre" — apontando para OUTRA entrada do glossário, que é
// pior que não grifar. Duas cópias da mesma regra divergem em silêncio; esta é a
// fonte, e as duas pontas a consomem.
//
// Não vale implementar as regras de plural do português (-l → -is, -ão → -ões…):
// o radical resolve todas de uma vez, e isto é um detector de aviso, não um
// analisador morfológico.

const escapar = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Conectores não fazem parte da identidade do termo: "Fortaleza do Peng" e
 *  "Fortaleza de Peng" são o mesmo nome. */
const CONECTORES = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'as', 'os', 'ao', 'aos']);

/** O elo entre duas palavras do termo: espaço, podendo levar conectores. */
export const ELO_CONECTORES = '\\s+(?:(?:de|do|da|dos|das|e|ao|aos|[aeo]s?)\\s+)*';

/** Palavra curta exige forma quase exata (só plural simples); palavra longa
 *  aceita variação no fim, que é onde o português flexiona. "rei" casa com
 *  "reis"; "incomparavel" casa com "incomparaveis" pelo radical.
 *  A fronteira final é obrigatória: sem ela, "rei" casaria dentro de "reino". */
function padraoDaPalavra(palavra: string): string {
  const p = escapar(palavra);
  if (palavra.length <= 4) return `${p}(?:e?s)?\\b`;
  return `${escapar(palavra.slice(0, -1))}\\p{L}{0,3}\\b`;
}

/** O corpo do padrão que reconhece o termo flexionado, SEM âncoras e SEM flags —
 *  quem chama decide as duas coisas, porque a varredura testa uma frase por vez
 *  e o grifo precisa de alternância global com captura.
 *
 *  Espera o termo JÁ NORMALIZADO por quem chama (sem acento, minúsculo). `null`
 *  quando não sobra palavra nenhuma além de conectores. */
export function padraoDeTermo(termoPt: string): string | null {
  const alvo = termoPt
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
  if (!alvo) return null;
  const palavras = alvo.split(/\s+/).filter(Boolean).filter((p) => !CONECTORES.has(p));
  if (palavras.length === 0) return null;
  return palavras.map(padraoDaPalavra).join(ELO_CONECTORES);
}
