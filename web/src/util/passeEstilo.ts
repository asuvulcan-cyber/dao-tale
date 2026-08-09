// As peças do passe de estilo que NÃO são desenho: as formas que as duas rotas
// devolvem e o de-para entre a correção proposta e a violação que a originou.
// Fora da tela porque errar esse casamento é silencioso — o botão Dispensar
// grava uma trinca que não existe, o alerta continua na varredura e o revisor
// conclui que o botão não funciona.

import type { ResultadoCorrecao } from '@dao-tale/shared';

/** Uma violação como `GET /capitulos/:id/estilo` devolve. */
export interface ViolacaoEstilo {
  frase_id: number | null;
  ordem: number;
  regra: string;
  trecho: string;
}

/** Uma correção proposta por `POST /capitulos/:id/estilo/passe`.
 *
 *  `previa` é o resultado de `aplicarCorrecao` sobre o texto que a frase tinha
 *  no momento do passe; é `null` quando `descartar` é true (não há o que
 *  aplicar). */
export interface CorrecaoPasse {
  frase_id: number | null;
  ordem: number;
  regra: string;
  trecho_pt_errado: string | null;
  trecho_pt_corrigido: string | null;
  descartar: boolean;
  previa: ResultadoCorrecao | null;
}

/**
 * A violação da varredura que originou esta correção.
 *
 * Dispensar é por TRINCA (frase, regra, trecho) e a chave é o `trecho` do
 * SCANNER — enquanto a correção traz o `trecho_pt_errado` que a IA escolheu,
 * que quase nunca é o mesmo texto (o contrato manda ela ampliar o trecho até
 * ele ser único na frase). Sem este de-para, dispensar não dispensa nada.
 *
 * A `regra` vem ECOADA pelo modelo — o schema aceita string vazia — então ela
 * é preferência, não requisito: com uma violação só na frase, é ela.
 *
 * `ocorrencia` é a posição desta correção entre as que citam a mesma
 * (ordem, regra), e existe porque no DESCARTE não há mais nada com que
 * desempatar: `respostaPasseEstiloSchema` obriga `trecho_pt_errado: null`
 * quando `descartar` é true, então o desempate por texto é estruturalmente
 * indisponível justamente no grupo cuja única razão de existir é dispensar.
 * Duas violações de mais-que-perfeito na mesma frase é o caso comum, não o
 * exótico. O modelo recebe as violações de uma frase em lista e devolve uma
 * correção por violação, na mesma ordem — a enésima correção fala da enésima
 * violação, e é esse o desempate.
 *
 * Uma versão anterior devolvia `null` no empate, para não silenciar a violação
 * errada. Estava errado por dois motivos: no descarte o empate é a REGRA e não
 * a exceção, e a linha ficava sem botão nenhum; e "não escolher" não é mais
 * seguro que escolher por posição — só é mais opaco. A escolha agora é
 * determinística e vai no title do botão, para o revisor ver qual alerta some.
 */
export function violacaoDaCorrecao(
  violacoes: ViolacaoEstilo[],
  correcao: { ordem: number; regra: string; trecho_pt_errado: string | null },
  ocorrencia = 0,
): ViolacaoEstilo | null {
  const daFrase = violacoes.filter((v) => v.ordem === correcao.ordem);
  if (daFrase.length === 0) return null;

  const mesmaRegra = daFrase.filter((v) => v.regra === correcao.regra);
  const candidatas = mesmaRegra.length > 0 ? mesmaRegra : daFrase;
  if (candidatas.length === 1) return candidatas[0];

  // O trecho continua sendo o sinal mais forte quando existe: ele veio do texto
  // real, e a posição é só uma suposição sobre a ordem da resposta.
  const errado = correcao.trecho_pt_errado ?? '';
  const porTrecho = candidatas.find((v) => v.trecho !== '' && errado.includes(v.trecho));
  if (porTrecho) return porTrecho;

  // Grampeado ao fim da lista: dispensar as anteriores encolhe `candidatas`
  // entre um clique e o outro, e um índice fora da faixa não pode virar
  // `undefined` num tipo que promete `ViolacaoEstilo | null`.
  return candidatas[Math.min(ocorrencia, candidatas.length - 1)];
}
