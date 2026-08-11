// O de-para entre o id da regra e o que o revisor lê. As cinco regras de
// estilo puro (varredura determinística, sem catálogo) ficam fixas aqui; as
// do catálogo (Task 1, shared/src/catalogoErros.ts) entram por spread a
// partir de CATALOGO — uma entrada nova já nasce nomeada na tela, e a
// alternativa (copiar título para uma segunda lista) falha em silêncio: a
// regra aparece como `particula-yizhi` cru e parece defeito.
//
// orientacaoDaRegra já mora em shared e já é testada lá (casamento por id,
// null fora do catálogo, os pisos) — reexportada aqui só para os dois
// importadores desta tela (rótulo e orientação) virem do mesmo lugar.
import { CATALOGO, type EntradaCatalogo } from '@dao-tale/shared';

export { orientacaoDaRegra } from '@dao-tale/shared';

const DE_ESTILO: Record<string, string> = {
  'mais-que-perfeito': 'Mais-que-perfeito simples',
  'aspas-nao-retas': 'Aspas não retas',
  'virgula-dentro-da-aspa': 'Vírgula dentro das aspas',
  'dialogo-aspas': 'Travessão numa obra de aspas',
  'dialogo-travessao': 'Aspas numa obra de travessão',
};

/** Compõe o de-para. Função, e não só o spread na constante, porque a
 *  PRECEDÊNCIA precisa de teste e com os ids reais não há colisão para
 *  exercitá-la: hoje as regras de estilo e as do catálogo não se cruzam, e a
 *  inversão passa verde. O catálogo tem de vencer, porque a orientação exibida
 *  logo abaixo do rótulo casa por id direto no catálogo — rótulo de um lado e
 *  orientação de outro é justamente a divergência silenciosa que este módulo
 *  existe para impedir. */
export function comporRotulos(
  deEstilo: Record<string, string>,
  entradas: readonly EntradaCatalogo[],
): Record<string, string> {
  return { ...deEstilo, ...Object.fromEntries(entradas.map((e) => [e.id, e.titulo])) };
}

export const REGRA_ESTILO_ROTULO: Record<string, string> = comporRotulos(DE_ESTILO, CATALOGO);
