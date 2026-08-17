import { Fragment, type ReactNode } from 'react';
import { padraoDeTermo, partirInline, type EntradaGlossario } from '@dao-tale/shared';

// ── Marcação de termos do glossário no texto (item 13 do backlog) ───────────

/** Uma ocorrência de termo no texto, já recortada do ORIGINAL. */
export interface OcorrenciaTermo {
  inicio: number;
  fim: number;
  /** O trecho como aparece na tela — com acento e caixa preservados. */
  trecho: string;
  glosa: string;
}

export interface MarcadorGlossario {
  acharZh: (texto: string) => OcorrenciaTermo[];
  acharPt: (texto: string) => OcorrenciaTermo[];
}

/**
 * Texto normalizado para casar, com o mapa de volta ao original.
 *
 * O padrão de `padraoDeTermo` é normalizado (sem acento, minúsculo) e o texto
 * exibido não é: casar um contra o outro faz "planici…" não bater em
 * "Planícies", e 30 dos 116 termos da obra real têm acento — "Águia Voadora",
 * "Máscara Negra", "Pátio Oeste". Marcar o texto normalizado também não serve,
 * porque a tela mostraria "planicies". Daí o mapa: casa-se no normalizado,
 * recorta-se no original.
 *
 * Caractere a caractere porque a normalização não preserva comprimento EM GERAL.
 * Medido: para todo caractere que este app vê — acento do português, CJK, e até
 * os candidatos exóticos (ligaduras, İ, ẞ) — ela preserva, e por isso `mapa[i]`
 * é sempre `i` aqui. Ou seja: NENHUM teste deste repositório mata esta linha, e
 * trocá-la por índices diretos passaria verde. Fica assim mesmo, porque a
 * garantia é sobre a operação e não sobre o corpus, e o custo são seis linhas —
 * mas quem ler não deve concluir que os testes a protegem.
 */
function normalizarComMapa(texto: string): { norm: string; mapa: number[] } {
  let norm = '';
  const mapa: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
    for (const ch of c) {
      norm += ch;
      mapa.push(i);
    }
  }
  return { norm, mapa };
}

/** Acha as ocorrências no texto original usando um regex sobre o normalizado. */
function acharComMapa(texto: string, regex: RegExp | null, glosaDe: (t: string) => string): OcorrenciaTermo[] {
  if (!regex || !texto) return [];
  const { norm, mapa } = normalizarComMapa(texto);
  const achados: OcorrenciaTermo[] = [];
  for (const m of norm.matchAll(regex)) {
    const i = m.index;
    if (i == null || !m[1]) continue;
    const inicio = mapa[i];
    const fim = mapa[i + m[1].length - 1] + 1;
    achados.push({ inicio, fim, trecho: texto.slice(inicio, fim), glosa: glosaDe(m[1]) });
  }
  return achados;
}

export function montarMarcadorGlossario(entradas: EntradaGlossario[] | undefined): MarcadorGlossario | null {
  if (!entradas || entradas.length === 0) return null;
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Termos maiores primeiro, para o composto vencer o termo contido — 刀手 antes
  // de 刀, "Homem de Sabre" antes de "sabre". A alternância do regex resolve na
  // ORDEM, e é esta ordenação que impede o grifo de apontar para a entrada errada
  // dentro de um termo composto.
  const zh = entradas
    .filter((e) => e.termo_zh.trim().length >= 2) // 1 caractere é ambíguo demais (mesma regra da consistência)
    .sort((a, b) => b.termo_zh.length - a.termo_zh.length);
  const pt = entradas
    .filter((e) => e.termo_pt.trim().length >= 3)
    .sort((a, b) => b.termo_pt.length - a.termo_pt.length);

  // Um padrão flexionado por termo, na mesma ordem. `padraoDeTermo` é a fonte
  // única compartilhada com a varredura de consistência (shared/flexaoTermo.ts).
  const padroes = pt
    .map((e) => ({ entrada: e, padrao: padraoDeTermo(e.termo_pt) }))
    .filter((x): x is { entrada: EntradaGlossario; padrao: string } => x.padrao !== null);

  const glosaDaEntrada = (e: EntradaGlossario) => `${e.termo_zh} → ${e.termo_pt}`;

  // Sem a flag `i`: o texto já chega minúsculo de `normalizarComMapa`, e sem a
  // fronteira à direita, que era o que barrava "Assassinos" — cada palavra do
  // padrão já termina em `\b`, então a fronteira continua garantida, só passou a
  // vir DEPOIS da flexão.
  const regexPt = padroes.length
    ? new RegExp(`(?<![\\p{L}\\p{M}])(${padroes.map((x) => x.padrao).join('|')})`, 'gu')
    : null;
  const regexZh = zh.length ? new RegExp(`(${zh.map((e) => escapar(e.termo_zh)).join('|')})`, 'gu') : null;

  const glosaPt = (trecho: string): string => {
    const achado = padroes.find((x) => new RegExp(`^${x.padrao}$`, 'u').test(trecho));
    return achado ? glosaDaEntrada(achado.entrada) : '';
  };
  const porZh = new Map(zh.map((e) => [e.termo_zh, glosaDaEntrada(e)]));

  return {
    // O chinês não tem acento nem caixa, mas passa pelo mesmo caminho: uma via só
    // para recortar do original é uma via só para errar o recorte.
    acharZh: (texto) => acharComMapa(texto, regexZh, (t) => porZh.get(t) ?? ''),
    acharPt: (texto) => acharComMapa(texto, regexPt, glosaPt),
  };
}

/** Envolve com a marca os trechos que o marcador achou, preservando o resto. */
function marcarTermos(texto: string, ocorrencias: OcorrenciaTermo[]): ReactNode {
  if (ocorrencias.length === 0) return texto;
  const partes: ReactNode[] = [];
  let cursor = 0;
  ocorrencias.forEach((o, i) => {
    if (o.inicio > cursor) partes.push(texto.slice(cursor, o.inicio));
    partes.push(
      <span key={i} className="termo-gloss" title={o.glosa}>
        {o.trecho}
      </span>,
    );
    cursor = o.fim;
  });
  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return partes;
}

export function TextoMarcadoZh({ texto, marcador }: { texto: string; marcador: MarcadorGlossario | null }) {
  if (!marcador) return <>{texto}</>;
  return <>{marcarTermos(texto, marcador.acharZh(texto))}</>;
}

// ── Markdown inline (itálico/negrito) na tradução ───────────────────────────
// A IA usa *itálico* e **negrito** (que o download .md preserva); aqui eles
// ficam visíveis no editor. Só formatação inline — parágrafos são as frases.
// A gramática vem de shared/src/inline.ts: o mesmo conversor que gera o XHTML do
// EPUB e alimenta o modo leitura (doc 12 §3).

export function TextoTraduzido({
  texto,
  marcador,
}: {
  texto: string;
  marcador: MarcadorGlossario | null;
}) {
  const decorar = (t: string): ReactNode =>
    marcador ? marcarTermos(t, marcador.acharPt(t)) : t;
  if (!texto) return null;
  return (
    <>
      {partirInline(texto).map((segmento, i) => {
        if (segmento.tipo === 'negrito') return <strong key={i}>{decorar(segmento.texto)}</strong>;
        if (segmento.tipo === 'italico') return <em key={i}>{decorar(segmento.texto)}</em>;
        return <Fragment key={i}>{decorar(segmento.texto)}</Fragment>;
      })}
    </>
  );
}
