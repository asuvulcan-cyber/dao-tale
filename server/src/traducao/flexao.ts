// Comparação de termo do glossário tolerante a FLEXÃO.
//
// O núcleo diz que o glossário é lei "inclusive nas flexões" — o plural é uso
// CORRETO, não desvio. Comparando string exata, "Reis Incomparáveis" era acusado
// de não conter "Rei Incomparável", e a varredura do prólogo devolvia duas
// violações que não existiam. Falso positivo é pior que falso negativo aqui:
// ele treina o usuário a ignorar o indicador.
//
// Não vale a pena implementar as regras de plural do português (-l → -is,
// -m → -ns, -ão → -ões…): o radical resolve todas de uma vez, e este é um
// detector de aviso, não um analisador morfológico.

const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const escapar = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Conectores não fazem parte da identidade do termo: "Fortaleza do Peng" e
 *  "Fortaleza de Peng" são o mesmo nome. Saem da sequência exigida e passam a
 *  ser absorvidos pelo elo entre as palavras que importam. */
const CONECTORES = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'as', 'os', 'ao', 'aos']);

/** Palavra curta exige forma quase exata (só plural simples); palavra longa
 *  aceita variação no fim, que é onde o português flexiona. "rei" casa com
 *  "reis"; "incomparavel" casa com "incomparaveis" pelo radical.
 *  A fronteira final é obrigatória: sem ela, "rei" casaria dentro de "reino". */
function padraoDaPalavra(palavra: string): string {
  const p = escapar(palavra);
  if (palavra.length <= 4) return `${p}(?:e?s)?\\b`;
  return `${escapar(palavra.slice(0, -1))}\\p{L}{0,3}\\b`;
}

/** O termo aparece na tradução, aceitando plural e variação de conector? */
export function contemTermoFlexionado(textoPt: string, termoPt: string): boolean {
  const texto = normalizar(textoPt);
  const alvo = normalizar(termoPt);
  if (!alvo) return true;
  // Sem atalho por `includes`: ele ignora fronteira de palavra e casaria "rei"
  // dentro de "reino". O padrão abaixo já cobre a forma exata, com fronteira.
  const todas = alvo.split(/\s+/).filter(Boolean);
  const palavras = todas.filter((p) => !CONECTORES.has(p));
  // Termo feito só de conectores: cai na comparação literal, já testada acima.
  if (palavras.length === 0) return false;
  const elo = '\\s+(?:(?:de|do|da|dos|das|e|ao|aos|[aeo]s?)\\s+)*';
  const padrao = palavras.map(padraoDaPalavra).join(elo);
  return new RegExp(`\\b${padrao}`, 'u').test(texto);
}
