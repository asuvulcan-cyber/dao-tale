// A seleção de texto no editor vira um termo em potencial — mas só quando é
// PLAUSÍVEL como termo. Sem o teto, um clique-e-arrasta desatento (a frase
// inteira, ~200 caracteres) chega ao painel pronto pra virar entrada do
// glossário, e uma entrada dessas suja o glossário e o prompt de um jeito
// difícil de desfazer (não tem "desfazer 200 caracteres" — é editar à mão).

/** O que a seleção do revisor produz, antes de virar termo. */
export interface Captura {
  lado: 'zh' | 'pt';
  trecho: string;
}

/** A seleção vira captura, ou `null` quando não serve.
 *
 *  Rejeita seleção vazia ou só de espaço, e trecho longo demais para ser termo
 *  (o revisor selecionou a frase inteira sem querer) — criar entrada de 200
 *  caracteres suja o glossário e o prompt de um jeito difícil de desfazer. */
export function capturaDaSelecao(lado: 'zh' | 'pt', bruto: string): Captura | null {
  const trecho = bruto.trim();
  if (!trecho) return null;
  if (trecho.length > 60) return null;
  return { lado, trecho };
}
