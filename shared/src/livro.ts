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

/** O título traduzido já se anuncia sozinho ("Capítulo 3: …", "Prólogo — …")?
 *
 *  Acontece porque o original chinês carrega a designação no próprio título
 *  (第一章 = "capítulo um"), e traduzi-la é o certo. Só que o aplicativo prefixa
 *  a numeração dele por cima, e o resultado saía "Capítulo 1 — Capítulo 1:
 *  Deixando a Propriedade" na leitura, no sumário e no EPUB.
 *
 *  Deliberadamente restrito: "Capítulo" só conta com número/algarismo logo
 *  depois, para um título legítimo como "Capítulo do Sangue" não perder a
 *  numeração. As designações avulsas (prólogo, epílogo…) valem sozinhas. */
const RE_AUTODESIGNADO =
  /^\s*(?:cap[íi]tulo|cap\.)\s*[\dIVXLCivxlc]+\b|^\s*(?:pr[óo]logo|ep[íi]logo|interl[úu]dio|pref[áa]cio|introdu[çc][ãa]o|ap[êe]ndice|extra)\b/i;

export function tituloSeAnuncia(titulo: string): boolean {
  return RE_AUTODESIGNADO.test(titulo);
}

/** "Capítulo 118 — Título traduzido" (cai para o título zh, e daí só o número).
 *  Título que já se anuncia sozinho não é prefixado de novo. */
export function cabecalhoPt(capitulo: CapituloComTitulo): string {
  const titulo = capitulo.titulo_pt || capitulo.titulo;
  if (!titulo) return `Capítulo ${capitulo.numero}`;
  // Título que já traz a própria designação manda; prefixar de novo duplicaria.
  return tituloSeAnuncia(titulo) ? titulo : `Capítulo ${capitulo.numero} — ${titulo}`;
}

/** Escopo da exportação: quais capítulos entram no livro (doc 12 §5). */
export interface EscopoExportacao {
  status: StatusCapitulo[];
  de?: number;
  ate?: number;
  /** Lista explícita; quando presente, vence `de`/`ate`. */
  numeros?: number[];
  /** Apêndice de glossário no livro. Padrão true: num wuxia traduzido, o
   *  vocabulário de nomes, seitas e técnicas é parte do que o leitor precisa. */
  glossario?: boolean;
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
