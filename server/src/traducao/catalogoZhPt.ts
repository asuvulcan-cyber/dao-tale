import { CATALOGO, type EntradaCatalogo } from '@dao-tale/shared';

// Detector do catálogo de erros zh→pt-BR (spec 2026-08-10). Bilíngue de
// propósito, e é isso que o distingue de `analisarEstilo`: aquele recebe só
// `texto_pt` e não teria como expressar "一直 virou sempre". O molde é
// `varrerConsistencia` — função pura sobre uma lista de frases, com um Set de
// dispensas — e não `analisarEstilo`, pela mesma razão.

export interface ViolacaoCatalogo {
  frase_id: number;
  ordem: number;
  /** É o `regra` da violação quando ela entra na lista de estilo. */
  entrada_id: string;
  gatilho_zh: string;
  /** O trecho do PT que disparou, com o que vem depois — é o que a tela destaca
   *  e o que compõe a trinca de dispensa. */
  trecho_pt: string;
}

/** Contexto à direita do trecho. Mesmo formato do scanner de estilo (que usa
 *  `[^\n]{0,40}`): o trecho tem de ser reconhecível na tela e estável entre duas
 *  varreduras, porque é chave de dispensa gravada no banco. */
const CONTEXTO = 40;

function trechoComContexto(texto: string, inicio: number, comprimento: number): string {
  const bruto = texto.slice(inicio, inicio + comprimento + CONTEXTO);
  const quebra = bruto.indexOf('\n');
  return quebra === -1 ? bruto : bruto.slice(0, quebra);
}

export function varrerCatalogo(
  frases: { id: number; ordem: number; texto_zh: string; texto_pt: string; status_traducao: string }[],
  ignoradas: ReadonlySet<string> = new Set(),
  entradas: readonly EntradaCatalogo[] = CATALOGO,
): { violacoes: ViolacaoCatalogo[]; frases_examinadas: number } {
  const violacoes: ViolacaoCatalogo[] = [];
  let frases_examinadas = 0;

  for (const f of frases) {
    if (f.status_traducao !== 'traduzida') continue;
    const pt = f.texto_pt ?? '';
    if (!pt) continue;
    frases_examinadas++;

    for (const e of entradas) {
      if (!f.texto_zh.includes(e.gatilho_zh)) continue;
      const m = pt.match(e.evitar_pt);
      if (!m || m.index == null) continue;
      // Uma violação por (frase, entrada), como o scanner de aspas: se a mesma
      // frase repetir o reflexo, a segunda aparece na varredura seguinte, depois
      // que a primeira for consertada ou dispensada.
      const trecho_pt = trechoComContexto(pt, m.index, m[0].length);
      if (ignoradas.has(`${f.id}|${e.id}|${trecho_pt}`)) continue;
      violacoes.push({ frase_id: f.id, ordem: f.ordem, entrada_id: e.id, gatilho_zh: e.gatilho_zh, trecho_pt });
    }
  }

  return { violacoes, frases_examinadas };
}
