import { Fragment, type ReactNode } from 'react';
import { partirInline, type EntradaGlossario } from '@dao-tale/shared';

// ── Marcação de termos do glossário no texto (item 13 do backlog) ───────────

export interface MarcadorGlossario {
  regexZh: RegExp | null;
  regexPt: RegExp | null;
  glosaZh: Map<string, string>;
  glosaPt: Map<string, string>;
}

export function montarMarcadorGlossario(entradas: EntradaGlossario[] | undefined): MarcadorGlossario | null {
  if (!entradas || entradas.length === 0) return null;
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Termos maiores primeiro, para o composto vencer o termo contido (人级 antes de 人).
  const zh = entradas
    .filter((e) => e.termo_zh.trim().length >= 2) // 1 caractere é ambíguo demais (mesma regra da consistência)
    .sort((a, b) => b.termo_zh.length - a.termo_zh.length);
  const pt = entradas
    .filter((e) => e.termo_pt.trim().length >= 3)
    .sort((a, b) => b.termo_pt.length - a.termo_pt.length);
  return {
    regexZh: zh.length ? new RegExp(`(${zh.map((e) => escapar(e.termo_zh)).join('|')})`, 'gu') : null,
    regexPt: pt.length
      ? new RegExp(`(?<![\\p{L}\\p{M}])(${pt.map((e) => escapar(e.termo_pt)).join('|')})(?![\\p{L}\\p{M}])`, 'giu')
      : null,
    glosaZh: new Map(zh.map((e) => [e.termo_zh, `${e.termo_zh} → ${e.termo_pt}`])),
    glosaPt: new Map(pt.map((e) => [e.termo_pt.toLowerCase(), `${e.termo_zh} → ${e.termo_pt}`])),
  };
}

// Divide o texto pelo regex (grupo de captura) e envolve os termos com a marca.
function marcarTermos(texto: string, regex: RegExp | null, glosa: (t: string) => string | undefined): ReactNode {
  if (!regex || !texto) return texto;
  const partes = texto.split(regex);
  if (partes.length === 1) return texto;
  return partes.map((parte, i) =>
    i % 2 === 1 ? (
      <span key={i} className="termo-gloss" title={glosa(parte)}>
        {parte}
      </span>
    ) : (
      parte
    ),
  );
}

export function TextoMarcadoZh({ texto, marcador }: { texto: string; marcador: MarcadorGlossario | null }) {
  if (!marcador) return <>{texto}</>;
  return <>{marcarTermos(texto, marcador.regexZh, (t) => marcador.glosaZh.get(t))}</>;
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
    marcador ? marcarTermos(t, marcador.regexPt, (x) => marcador.glosaPt.get(x.toLowerCase())) : t;
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
