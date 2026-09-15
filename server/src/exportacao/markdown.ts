import { cabecalhoPt, type EntradaGlossario } from '@dao-tale/shared';
import type { CapituloEpub, ObraEpub } from './epub.js';
import { glossarioMarkdown } from './glossarioLivro.js';

// Markdown da obra inteira — o companheiro simples do EPUB (doc 12 §5). O
// download por capítulo já existe; aqui é a obra concatenada, em PT ou bilíngue.

export type FormatoMarkdown = 'pt' | 'bilingue';

function retirarNotasDaProsa(texto: string, notas: string[]): string {
  return texto.replace(/\(\(([\s\S]*?)\)\)/g, (_trecho, nota: string) => {
    notas.push(nota.trim());
    return `[^${notas.length}]`;
  });
}

export function montarMarkdown(
  obra: ObraEpub,
  capitulos: CapituloEpub[],
  formato: FormatoMarkdown = 'pt',
  glossario: EntradaGlossario[] = [],
): string {
  const partes: string[] = [`# ${obra.titulo}`];
  if (obra.titulo_original) partes.push(`*${obra.titulo_original}*`);
  if (obra.autor) partes.push(`**Autor:** ${obra.autor}`);
  if (obra.tags.length > 0) partes.push(`**Tags:** ${obra.tags.join(', ')}`);
  if (obra.sinopse) {
    partes.push(
      obra.sinopse
        .split(/\n{2,}|\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `> ${p}`)
        .join('\n>\n'),
    );
  }
  partes.push('---');

  for (const cap of [...capitulos].sort((a, b) => a.numero - b.numero)) {
    const notas: string[] = [];
    partes.push(`## ${cabecalhoPt(cap)}`);
    if (formato === 'bilingue') {
      if (cap.titulo) partes.push(`*${cap.titulo}*`);
      for (const p of cap.paragrafos) {
        partes.push(`${p.zh}\n\n${p.pt ? retirarNotasDaProsa(p.pt, notas) : '*(pendente de tradução)*'}`);
      }
    } else {
      for (const p of cap.paragrafos) if (p.pt) partes.push(retirarNotasDaProsa(p.pt, notas));
    }
    if (notas.length) partes.push(notas.map((nota, i) => `[^${i + 1}]: ${nota}`).join('\n'));
  }

  const apendice = glossarioMarkdown(glossario);
  if (apendice) {
    partes.push('---');
    partes.push(apendice);
  }

  return `${partes.join('\n\n')}\n`;
}
