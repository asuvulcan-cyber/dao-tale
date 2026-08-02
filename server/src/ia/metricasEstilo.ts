import type { EntradaGlossario } from '@dao-tale/shared';

// Métricas objetivas do portão A/B do núcleo (doc 08 §12). Duas versões do núcleo
// produzem duas traduções do MESMO trecho; ler as duas lado a lado responde "qual
// eu gostei mais", que é insuficiente para virar uma chave que rege a obra inteira.
// Estas contagens respondem "a mudança fez o que prometia": o núcleo enxuto troca
// uma árvore de 6 passos por um teste de deleção — se o texto novo não tiver menos
// demonstrativos, a troca não funcionou, por mais bonita que a prosa esteja.
//
// São indicadores, não notas: menos "aquele" com o sentido perdido é uma piora que
// nenhum contador pega. A leitura humana continua sendo o juiz — isto só impede que
// ela seja feita no escuro.

/** Fronteira de palavra que enxerga acento (o \b de JS é ASCII: em " àquele" ele
    não acha fronteira nenhuma antes do "à"). */
const ANTES = '(?<![\\p{L}\\p{N}])';
const DEPOIS = '(?![\\p{L}\\p{N}])';

const grupo = (formas: string[]) => new RegExp(`${ANTES}(?:${formas.join('|')})${DEPOIS}`, 'giu');

// "aquele" e suas contrações — o alvo da linha dura da Seção 3.
const RE_AQUELE = grupo([
  '[aà]quele[s]?',
  '[aà]quela[s]?',
  '[nd]aquele[s]?',
  '[nd]aquela[s]?',
  '[aà]quilo',
  '[nd]aquilo',
]);

// "este/esse" e contrações — o resto do apontamento, que o teste da deleção ataca.
const RE_ESTE_ESSE = grupo([
  '[e]?st[ae][s]?',
  '[nd]est[ae][s]?',
  'ess[ae][s]?',
  '[nd]ess[ae][s]?',
]);

// Os dois decalques nomeados no núcleo, na forma que ele proíbe.
const RE_DECALQUE = /a outra parte|abri[au]m? a boca/giu;

// Advérbio em "-mente" (≥2 letras antes evita casar o substantivo "mente").
const RE_MENTE = new RegExp(`${ANTES}\\p{L}{2,}mente${DEPOIS}`, 'giu');

const RE_PALAVRA = /[\p{L}\p{N}]+/gu;

export interface MetricasEstilo {
  palavras: number;
  /** Ocorrências de "aquele/aquela/aquilo" e contrações. */
  aquele: number;
  /** Todos os demonstrativos de apontamento (inclui o "aquele" acima). */
  demonstrativos: number;
  /** Decalques nomeados no núcleo ("a outra parte", "abriu a boca"). */
  decalques: number;
  /** Advérbios em "-mente". */
  mente: number;
  /** Termos do glossário que o trecho chinês pedia. */
  glossario_esperados: number;
  /** Quantos desses apareceram na tradução. */
  glossario_aplicados: number;
}

export function metricasEstilo(
  textoPt: string,
  opcoes: { glossario?: EntradaGlossario[]; textoZh?: string } = {},
): MetricasEstilo {
  const conta = (re: RegExp) => textoPt.match(re)?.length ?? 0;
  const aquele = conta(RE_AQUELE);

  // Só entram os termos que o original realmente continha: cobrar um termo que
  // não estava no trecho mediria o glossário, não a tradução.
  const esperados = (opcoes.glossario ?? []).filter((e) => (opcoes.textoZh ?? '').includes(e.termo_zh));
  const alvo = textoPt.toLowerCase();
  const aplicados = esperados.filter((e) => alvo.includes(e.termo_pt.toLowerCase())).length;

  return {
    palavras: textoPt.match(RE_PALAVRA)?.length ?? 0,
    aquele,
    demonstrativos: aquele + conta(RE_ESTE_ESSE),
    decalques: conta(RE_DECALQUE),
    mente: conta(RE_MENTE),
    glossario_esperados: esperados.length,
    glossario_aplicados: aplicados,
  };
}
