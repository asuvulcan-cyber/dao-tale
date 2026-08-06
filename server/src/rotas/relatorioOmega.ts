// Relatório sobre o Ômega (doc 15 §7): o único lugar onde as três camadas se encontram.
//
// As checagens de salvar olham uma camada por vez, e por isso não veem sobreposição —
// um Delta pode estar impecável sozinho e ainda assim repetir o que Beta já decide. Aqui
// o composto é fatiado de volta nas três camadas e cada tema é atribuído a quem o
// mencionou.

import { TEMAS, temasNoTexto, type Camada } from '@dao-tale/shared';
import { TITULO_SECAO_PREFERENCIAS } from '@dao-tale/shared';

export interface TemaNoOmega {
  tema: string;
  titulo: string;
  dono: Camada;
  ocorrencias: number;
}

export interface SobreposicaoOmega {
  tema: string;
  titulo: string;
  dono: Camada;
  camadas: Camada[];
  trechos: string[];
}

export interface RelatorioOmega {
  temas: TemaNoOmega[];
  sobreposicoes: SobreposicaoOmega[];
}

const TITULO_SECAO_DELTA = '## 6. DIRETRIZES';

/**
 * Corta o Ômega de volta nas três camadas, pelos títulos que a composição garante.
 *
 * Quando um título falta — Alfa legado sem marcador, que anexa o delta no fim — a fatia
 * correspondente fica vazia e o resto conta como Alfa. É o comportamento certo: num
 * núcleo desses as chaves realmente não valeram, e atribuir aquele texto a Beta mentiria
 * sobre o que foi enviado à IA.
 */
export function fatiarOmega(omega: string): Record<Camada, string> {
  const iBeta = omega.indexOf(TITULO_SECAO_PREFERENCIAS);
  const iDelta = omega.indexOf(TITULO_SECAO_DELTA);
  if (iBeta === -1 && iDelta === -1) return { alfa: omega, beta: '', delta: '' };
  if (iBeta === -1) return { alfa: omega.slice(0, iDelta), beta: '', delta: omega.slice(iDelta) };
  if (iDelta === -1) return { alfa: omega.slice(0, iBeta), beta: omega.slice(iBeta), delta: '' };
  return { alfa: omega.slice(0, iBeta), beta: omega.slice(iBeta, iDelta), delta: omega.slice(iDelta) };
}

export function relatorioOmega(omega: string): RelatorioOmega {
  const fatias = fatiarOmega(omega);
  const porTema = new Map<string, { camadas: Set<Camada>; trechos: string[]; ocorrencias: number }>();
  for (const camada of ['alfa', 'beta', 'delta'] as const) {
    for (const o of temasNoTexto(fatias[camada])) {
      const e = porTema.get(o.tema.id) ?? { camadas: new Set<Camada>(), trechos: [], ocorrencias: 0 };
      e.camadas.add(camada);
      e.ocorrencias += 1;
      // Só o que está FORA da camada dona vira prova: o trecho existe para mostrar
      // onde o tema vazou, não para reproduzir a regra legítima.
      if (camada !== o.tema.dono) e.trechos.push(o.trecho);
      porTema.set(o.tema.id, e);
    }
  }
  const meta = (id: string) => TEMAS.find((t) => t.id === id)!;
  return {
    temas: [...porTema].map(([id, e]) => ({
      tema: id,
      titulo: meta(id).titulo,
      dono: meta(id).dono,
      ocorrencias: e.ocorrencias,
    })),
    // Sobreposição = o tema aparece em camada que não é a dona. Aparecer só na dona é a
    // partição funcionando, não defeito — e é o caso da maioria.
    sobreposicoes: [...porTema]
      .filter(([id, e]) => [...e.camadas].some((c) => c !== meta(id).dono))
      .map(([id, e]) => ({
        tema: id,
        titulo: meta(id).titulo,
        dono: meta(id).dono,
        camadas: [...e.camadas].sort(),
        trechos: e.trechos,
      })),
  };
}
