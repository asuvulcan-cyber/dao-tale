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
 * Quando sobram várias candidatas e nem o trecho ancora, devolve `null` de
 * propósito: sem botão Dispensar o revisor perde uma conveniência; com um
 * palpite ele silencia a violação errada e nunca fica sabendo.
 */
export function violacaoDaCorrecao(
  violacoes: ViolacaoEstilo[],
  correcao: { ordem: number; regra: string; trecho_pt_errado: string | null },
): ViolacaoEstilo | null {
  const daFrase = violacoes.filter((v) => v.ordem === correcao.ordem);
  if (daFrase.length === 0) return null;

  const mesmaRegra = daFrase.filter((v) => v.regra === correcao.regra);
  const candidatas = mesmaRegra.length > 0 ? mesmaRegra : daFrase;
  if (candidatas.length === 1) return candidatas[0];

  const errado = correcao.trecho_pt_errado ?? '';
  return candidatas.find((v) => v.trecho !== '' && errado.includes(v.trecho)) ?? null;
}
