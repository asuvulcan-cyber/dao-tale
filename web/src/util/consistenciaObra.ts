// A trava da tela de consistência da obra, fora do desenho.
//
// Vive aqui pelo mesmo motivo de `passeEstilo.ts`: errar isto é SILENCIOSO. A
// tela continua bonita, o botão continua clicável, e o estrago só aparece depois
// — numa obra inteira reescrita a partir de uma contagem que era de outra
// palavra. Nada nesta regra precisa de navegador, então ela pode (e deve) ser
// coberta por teste.

/** O que a prévia devolveu, junto com o texto exato que a produziu.
 *
 *  Guardar o `de` ao lado da contagem é o desenho inteiro: uma prévia sem o
 *  texto que a gerou é um número sem referente, e um número sem referente
 *  autoriza qualquer coisa. */
export interface PreviaSubstituicao {
  /** O texto submetido à rota — já normalizado (`trim`), como ela recebeu. */
  de: string;
  /** Quantas frases seriam alteradas por essa substituição. */
  frases: number;
}

/**
 * A prévia que vale para o texto que está no campo AGORA — ou `null`.
 *
 * "Trocar" só existe atrás desta função: substituir às cegas na obra inteira é
 * o tipo de ação que se faz uma vez e se lamenta, e a única defesa honesta é
 * exigir que o revisor tenha visto a contagem DAQUELE texto.
 *
 * Por que comparar o texto e não guardar um booleano "já previu": o caso ruim
 * não é trocar sem nunca ter previsto — é prever "Abismo", corrigir o campo
 * para "abismos" e trocar em cima da contagem antiga. Um booleano não distingue
 * os dois; a comparação distingue.
 *
 * Devolve a prévia (e não `true`) porque quem chama precisa da contagem logo
 * em seguida: para escrever "N frases seriam alteradas" e para desabilitar o
 * botão quando N é zero. Duas fontes de verdade para "esta prévia vale" foi o
 * que se quis evitar.
 *
 * `textoAtual` chega cru do input; o `trim` é feito aqui, uma vez, porque é o
 * mesmo que a chamada da rota faz — se os dois divergirem, a comparação passa
 * a mentir.
 */
export function previaValida(
  previa: PreviaSubstituicao | null,
  textoAtual: string,
): PreviaSubstituicao | null {
  if (previa == null) return null;
  return previa.de === textoAtual.trim() ? previa : null;
}
