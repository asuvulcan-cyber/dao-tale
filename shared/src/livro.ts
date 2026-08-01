// Só tipos vindos de index.js: import de valor aqui fecharia um ciclo em runtime
// (index faz `export * from './livro.js'`), e a constante sairia undefined.
import type { Frase, StatusCapitulo } from './index.js';

// Regras do "livro" — a obra vista como texto pronto, não como bancada (doc 12).
// Ficam em shared porque os três alvos precisam das MESMAS regras: o EPUB e o
// Markdown no servidor, e o modo leitura na interface.

/** Capítulo pronto para ser lido/exportado como livro: a tradução terminou.
 *  Escopo padrão do EPUB/Markdown e conjunto legível do modo leitura. */
export const STATUS_LEGIVEIS: StatusCapitulo[] = ['traduzido', 'revisado', 'finalizado'];

export interface ParagrafoRemontado {
  /** Chinês do parágrafo: frases coladas, sem separador (a pontuação já separa). */
  zh: string;
  /** Português: frases separadas por espaço; vazio quando nada foi traduzido. */
  pt: string;
}

/** Agrupa as frases por `paragrafo`, preservando a ordem original do capítulo. */
export function remontarParagrafos(frases: Frase[]): ParagrafoRemontado[] {
  const porParagrafo = new Map<number, Frase[]>();
  for (const f of frases) {
    const lista = porParagrafo.get(f.paragrafo) ?? [];
    lista.push(f);
    porParagrafo.set(f.paragrafo, lista);
  }
  return [...porParagrafo.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, fs]) => ({
      zh: fs.map((f) => f.texto_zh).join(''),
      pt: fs
        .map((f) => f.texto_pt.trim())
        .filter(Boolean)
        .join(' '),
    }));
}

export interface CapituloComTitulo {
  numero: number;
  titulo: string | null;
  titulo_pt: string | null;
}

/** "Capítulo 118 — Título traduzido" (cai para o título zh, e daí só o número). */
export function cabecalhoPt(capitulo: CapituloComTitulo): string {
  const titulo = capitulo.titulo_pt || capitulo.titulo;
  return titulo ? `Capítulo ${capitulo.numero} — ${titulo}` : `Capítulo ${capitulo.numero}`;
}

/** Escopo da exportação: quais capítulos entram no livro (doc 12 §5). */
export interface EscopoExportacao {
  status: StatusCapitulo[];
  de?: number;
  ate?: number;
  /** Lista explícita; quando presente, vence `de`/`ate`. */
  numeros?: number[];
}

export const ESCOPO_PADRAO: EscopoExportacao = { status: STATUS_LEGIVEIS };

/** Aplica o escopo, sempre pela numeração REAL (118, 119…), nunca por id ou posição.
 *  Mesma função no servidor (rota de exportação) e na interface (contagem do
 *  diálogo e capítulos legíveis do modo leitura). */
export function filtrarPorEscopo<T extends { numero: number; status: StatusCapitulo }>(
  capitulos: T[],
  escopo: EscopoExportacao,
): T[] {
  const pedidos = escopo.numeros ? new Set(escopo.numeros) : null;
  return capitulos
    .filter((c) => {
      if (!escopo.status.includes(c.status)) return false;
      if (pedidos) return pedidos.has(c.numero);
      if (escopo.de !== undefined && c.numero < escopo.de) return false;
      if (escopo.ate !== undefined && c.numero > escopo.ate) return false;
      return true;
    })
    .sort((a, b) => a.numero - b.numero);
}
