import type { EntradaGlossario, Frase } from '@dao-tale/shared';
import { contemTermoFlexionado } from './flexao.js';
import { PERFIL_SERVIDOR_MANDARIM, type PerfilServidor } from '../idiomas/index.js';

// Varredura reversa de consistência do glossário (doc 05 §4.2, D5): para cada
// termo do glossário presente no chinês de uma frase traduzida, a tradução PT
// deve conter o termo canônico. Função pura, sem IA — usada pela rota manual e
// pela varredura automática ao concluir o capítulo (doc 09 §3).

export interface ViolacaoConsistencia {
  frase_id: number;
  ordem: number;
  termo_zh: string;
  termo_pt: string;
  texto_zh: string;
  texto_pt: string;
}

export interface ResultadoConsistencia {
  ocorrencias: number;
  violacoes: ViolacaoConsistencia[];
  termos_curtos_ignorados: number;
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** Pares (frase, termo) que o revisor já conferiu e dispensou. */
export type ChaveIgnorada = `${number}|${string}`;
export const chaveIgnorada = (fraseId: number, termoZh: string): ChaveIgnorada => `${fraseId}|${termoZh}`;

export function varrerConsistencia(
  frases: Frase[],
  glossario: EntradaGlossario[],
  ignoradas: ReadonlySet<string> = new Set(),
  perfil: PerfilServidor = PERFIL_SERVIDOR_MANDARIM,
): ResultadoConsistencia {
  // Dois filtros contra falso positivo: termo curto demais para ser procurado e
  // termo que é parte de outro termo mais longo também presente na frase
  // (coberto pelo mais longo). O que conta como "curto" e o que conta como
  // "presente" são do perfil: no mandarim é substring e contagem de caractere;
  // no inglês tem de ser limite de palavra, ou "art" casa dentro de "start".
  const curtos = new Set(glossario.filter((g) => perfil.termoCurtoDemais(g.termo_zh)).map((g) => g.termo_zh));
  const utilizaveis = glossario.filter((g) => !curtos.has(g.termo_zh));

  const violacoes: ViolacaoConsistencia[] = [];
  let ocorrencias = 0;

  for (const f of frases) {
    if (f.status_traducao !== 'traduzida') continue;
    const presentes = utilizaveis.filter((g) => perfil.casaTermo(f.texto_zh, g.termo_zh));
    for (const g of presentes) {
      if (presentes.some((outro) => outro.termo_zh !== g.termo_zh && perfil.termoContem(outro.termo_zh, g.termo_zh))) continue;
      ocorrencias++;
      // Dispensada pelo revisor: nem toda ausência é erro. Quando o referente
      // já está estabelecido, o português omite em vez de repetir.
      if (ignoradas.has(chaveIgnorada(f.id, g.termo_zh))) continue;
      if (!contemTermoFlexionado(f.texto_pt, g.termo_pt)) {
        violacoes.push({
          frase_id: f.id,
          ordem: f.ordem,
          termo_zh: g.termo_zh,
          termo_pt: g.termo_pt,
          texto_zh: f.texto_zh,
          texto_pt: f.texto_pt,
        });
      }
    }
  }

  return { ocorrencias, violacoes, termos_curtos_ignorados: curtos.size };
}
