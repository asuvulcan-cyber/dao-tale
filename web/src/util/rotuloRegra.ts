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
import { CATALOGO } from '@dao-tale/shared';

export { orientacaoDaRegra } from '@dao-tale/shared';

const DE_ESTILO: Record<string, string> = {
  'mais-que-perfeito': 'Mais-que-perfeito simples',
  'aspas-nao-retas': 'Aspas não retas',
  'virgula-dentro-da-aspa': 'Vírgula dentro das aspas',
  'dialogo-aspas': 'Travessão numa obra de aspas',
  'dialogo-travessao': 'Aspas numa obra de travessão',
};

export const REGRA_ESTILO_ROTULO: Record<string, string> = {
  ...DE_ESTILO,
  ...Object.fromEntries(CATALOGO.map((e) => [e.id, e.titulo])),
};
