// Formatação inline que a IA produz na tradução: *itálico* e **negrito**.
// Um conversor só, consumido por três alvos: o editor (TextoRico.tsx), o modo
// leitura e o XHTML do EPUB (doc 12 §3). Parágrafos NÃO entram aqui — eles são
// as próprias frases agrupadas por `frases.paragrafo`.

const RE_MD_INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export interface SegmentoInline {
  tipo: 'texto' | 'italico' | 'negrito';
  /** Texto já sem os asteriscos. */
  texto: string;
}

/** Quebra o texto em segmentos, resolvendo os marcadores inline. */
export function partirInline(texto: string): SegmentoInline[] {
  if (!texto) return [];
  const partes = texto.split(RE_MD_INLINE);
  const segmentos: SegmentoInline[] = [];
  for (const parte of partes) {
    if (parte === '') continue; // split deixa vazios entre marcadores adjacentes
    if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
      segmentos.push({ tipo: 'negrito', texto: parte.slice(2, -2) });
    } else if (parte.startsWith('*') && parte.endsWith('*') && parte.length > 2) {
      segmentos.push({ tipo: 'italico', texto: parte.slice(1, -1) });
    } else {
      segmentos.push({ tipo: 'texto', texto: parte });
    }
  }
  return segmentos;
}
