import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  ehHanzi,
  leituraConfere,
  pinyinComTons,
  type DivergenciaLeitura,
  type EntradaGlossario,
  type EstadoDicionario,
  type FonteDicionario,
  type FonteInstalada,
  type PalavraDicionario,
  type SegmentoTutor,
  type Verbete,
} from '@dao-tale/shared';
import { diretorioDados } from '../config.js';

// Dicionários locais (doc 30). Ficam num arquivo próprio, `dicionarios.db`, e
// não no banco do usuário: são ~30 MB de dados públicos que se regeneram com
// `npm run dicionarios` — dentro do dao-tale.db, entrariam em todo snapshot de
// migração e em todo backup, e a licença NC-SA do DCP se misturaria aos dados
// do usuário na exportação.

export const INFO_FONTES: Record<FonteDicionario, Pick<FonteInstalada, 'nome' | 'licenca' | 'url'>> = {
  dcp: {
    nome: 'Dicionário Chinês-Português (DCP), de lercordeiro',
    licenca: 'CC BY-NC-SA 4.0',
    url: 'https://github.com/lercordeiro/dicionario_chines_portugues',
  },
  cedict: {
    nome: 'CC-CEDICT (MDBG)',
    licenca: 'CC BY-SA 4.0',
    url: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
  },
};

const ORDEM_FONTE: Record<FonteDicionario, number> = { dcp: 0, cedict: 1 };

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fontes (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  licenca      TEXT NOT NULL,
  url          TEXT NOT NULL,
  versao       TEXT,
  importado_em TEXT NOT NULL,
  total        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verbetes (
  id           INTEGER PRIMARY KEY,
  fonte        TEXT NOT NULL,
  simplificado TEXT NOT NULL,
  tradicional  TEXT,
  pinyin       TEXT NOT NULL,
  dados        TEXT NOT NULL  -- JSON: leitura, acepções, classificadores, exemplos, hsk, nota
);
CREATE INDEX IF NOT EXISTS idx_verbetes_simp ON verbetes(simplificado);
CREATE INDEX IF NOT EXISTS idx_verbetes_trad ON verbetes(tradicional) WHERE tradicional IS NOT NULL;
`;

/** Abre (ou cria) um banco de dicionário gravável — usado pela importação e pelos testes. */
export function criarBancoDicionario(caminho: string): Database.Database {
  const db = new Database(caminho);
  db.pragma('journal_mode = OFF');
  db.exec(ESQUEMA);
  return db;
}

/** Substitui todos os verbetes de uma fonte. */
export function gravarFonte(
  db: Database.Database,
  fonte: FonteDicionario,
  verbetes: Verbete[],
  versao: string | null,
): void {
  const inserir = db.prepare(
    'INSERT INTO verbetes (fonte, simplificado, tradicional, pinyin, dados) VALUES (?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    db.prepare('DELETE FROM verbetes WHERE fonte = ?').run(fonte);
    for (const v of verbetes) {
      const { fonte: _f, simplificado, tradicional, pinyin, ...dados } = v;
      inserir.run(fonte, simplificado, tradicional, pinyin, JSON.stringify(dados));
    }
    const info = INFO_FONTES[fonte];
    db.prepare(
      `INSERT OR REPLACE INTO fontes (id, nome, licenca, url, versao, importado_em, total)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?)`,
    ).run(fonte, info.nome, info.licenca, info.url, versao, verbetes.length);
    const maior = db
      .prepare('SELECT MAX(MAX(length(simplificado)), COALESCE(MAX(length(tradicional)), 0)) AS n FROM verbetes')
      .get() as { n: number | null };
    db.prepare("INSERT OR REPLACE INTO meta (chave, valor) VALUES ('maior_chave', ?)").run(String(maior.n ?? 1));
  })();
}

interface LinhaVerbete {
  id: number;
  fonte: FonteDicionario;
  simplificado: string;
  tradicional: string | null;
  pinyin: string;
  dados: string;
}

/** Teto de palavras procuradas por vez: chengyu tem 4 caracteres, os mais longos
 *  do CC-CEDICT passam de 20 — procurar até lá em toda posição é desperdício. */
const TETO_PALAVRA = 12;

/** Teto de combinações de leitura ao conferir um segmento que não é verbete
 *  inteiro (走了 = 走 × 了): cada caractere polifônico multiplica as leituras. */
const TETO_COMBINACOES = 64;

export class Dicionario {
  private readonly stBuscar;
  private readonly stExiste;
  private readonly maiorChave: number;
  private readonly cacheExiste = new Map<string, boolean>();

  constructor(private readonly db: Database.Database) {
    this.stBuscar = db.prepare(
      `SELECT * FROM verbetes WHERE simplificado = ?
       UNION ALL
       SELECT * FROM verbetes WHERE tradicional = ? AND simplificado <> ?`,
    );
    this.stExiste = db.prepare('SELECT 1 FROM verbetes WHERE simplificado = ? OR tradicional = ? LIMIT 1');
    const meta = db.prepare("SELECT valor FROM meta WHERE chave = 'maior_chave'").get() as
      { valor: string } | undefined;
    this.maiorChave = Math.min(TETO_PALAVRA, Number(meta?.valor ?? TETO_PALAVRA));
  }

  fechar(): void {
    this.db.close();
  }

  estado(): EstadoDicionario {
    const fontes = (this.db.prepare('SELECT * FROM fontes').all() as FonteInstalada[]).sort(
      (a, b) => ORDEM_FONTE[a.id] - ORDEM_FONTE[b.id],
    );
    return { instalado: fontes.length > 0, fontes };
  }

  /** Verbetes de uma palavra exata (simplificada ou tradicional), DCP primeiro. */
  buscar(termo: string): Verbete[] {
    const linhas = this.stBuscar.all(termo, termo, termo) as LinhaVerbete[];
    return linhas
      .sort((a, b) => ORDEM_FONTE[a.fonte] - ORDEM_FONTE[b.fonte] || a.id - b.id)
      .map((l) => ({
        fonte: l.fonte,
        simplificado: l.simplificado,
        tradicional: l.tradicional,
        pinyin: l.pinyin,
        ...(JSON.parse(l.dados) as Omit<Verbete, 'fonte' | 'simplificado' | 'tradicional' | 'pinyin'>),
      }));
  }

  existe(termo: string): boolean {
    let r = this.cacheExiste.get(termo);
    if (r === undefined) {
      r = !!this.stExiste.get(termo, termo);
      if (this.cacheExiste.size > 50_000) this.cacheExiste.clear();
      this.cacheExiste.set(termo, r);
    }
    return r;
  }

  /**
   * Divide um trecho só de hanzi em palavras pelo casamento máximo nos dois
   * sentidos e fica com a divisão de menos palavras (desempate: menos
   * caracteres soltos; depois a de trás para frente, que erra menos em
   * mandarim). Caractere que não está em dicionário nenhum fica sozinho.
   */
  private dividir(trecho: string[]): string[] {
    const n = trecho.length;
    const max = this.maiorChave;
    const frente: string[] = [];
    for (let i = 0; i < n;) {
      let tam = Math.min(max, n - i);
      while (tam > 1 && !this.existe(trecho.slice(i, i + tam).join(''))) tam--;
      frente.push(trecho.slice(i, i + tam).join(''));
      i += tam;
    }
    const tras: string[] = [];
    for (let f = n; f > 0;) {
      let tam = Math.min(max, f);
      while (tam > 1 && !this.existe(trecho.slice(f - tam, f).join(''))) tam--;
      tras.unshift(trecho.slice(f - tam, f).join(''));
      f -= tam;
    }
    const soltos = (l: string[]) => l.filter((p) => [...p].length === 1).length;
    if (frente.length !== tras.length) return frente.length < tras.length ? frente : tras;
    return soltos(frente) < soltos(tras) ? frente : tras;
  }

  /**
   * As palavras de uma frase, em ordem. Termos do glossário entram inteiros e
   * antes de tudo: o nome 林动 dividido pelo dicionário viraria "floresta" +
   * "mover". Termo marcado como ambíguo (小心 = "cuidado" e também a criada) não
   * se impõe — o dicionário divide, e a palavra ainda sai marcada.
   */
  palavrasDaFrase(texto: string, glossario: EntradaGlossario[] = []): PalavraDicionario[] {
    const termos = glossario
      .filter((g) => !g.ambiguo && g.termo_zh.trim())
      .sort((a, b) => [...b.termo_zh].length - [...a.termo_zh].length);
    const porTermo = new Map(glossario.map((g) => [g.termo_zh, g]));
    const chars = [...texto];
    const pecas: { texto: string; inicio: number }[] = [];
    let trecho: string[] = [];
    let inicioTrecho = 0;
    const fecharTrecho = () => {
      let pos = inicioTrecho;
      for (const p of this.dividir(trecho)) {
        pecas.push({ texto: p, inicio: pos });
        pos += [...p].length;
      }
      trecho = [];
    };
    for (let i = 0; i < chars.length;) {
      const resto = chars.slice(i).join('');
      const termo = termos.find((g) => resto.startsWith(g.termo_zh));
      if (termo) {
        if (trecho.length) fecharTrecho();
        pecas.push({ texto: termo.termo_zh, inicio: i });
        i += [...termo.termo_zh].length;
        continue;
      }
      if (ehHanzi(chars[i])) {
        if (!trecho.length) inicioTrecho = i;
        trecho.push(chars[i]);
      } else if (trecho.length) {
        fecharTrecho();
      }
      i++;
    }
    if (trecho.length) fecharTrecho();

    const vistas = new Set<string>();
    const palavras: PalavraDicionario[] = [];
    for (const p of pecas) {
      if (vistas.has(p.texto)) continue;
      vistas.add(p.texto);
      const g = porTermo.get(p.texto);
      palavras.push({
        texto: p.texto,
        inicio: p.inicio,
        verbetes: this.buscar(p.texto),
        glossario: g ? { termo_pt: g.termo_pt, categoria: g.categoria } : null,
      });
    }
    return palavras;
  }

  /** Leituras numéricas possíveis de um trecho de hanzi: as do verbete inteiro,
   *  ou as combinações das palavras em que ele se divide. Vazio = não dá para
   *  conferir (algum pedaço não está no dicionário). */
  leiturasDe(hanzi: string): string[] {
    const inteiro = this.buscar(hanzi);
    if (inteiro.length > 0) return unicas(inteiro.map((v) => v.pinyin));
    let combinacoes = [''];
    for (const p of this.dividir([...hanzi])) {
      const leituras = unicas(this.buscar(p).map((v) => v.pinyin));
      if (leituras.length === 0) return [];
      combinacoes = combinacoes.flatMap((c) => leituras.map((l) => (c ? `${c} ${l}` : l)));
      if (combinacoes.length > TETO_COMBINACOES) return [];
    }
    return combinacoes;
  }

  /** Segmentos do tutor cujo pinyin não bate com nenhuma leitura do dicionário. */
  conferirSegmentos(segmentos: SegmentoTutor[]): DivergenciaLeitura[] {
    const divergencias: DivergenciaLeitura[] = [];
    segmentos.forEach((s, indice) => {
      const leitura = s.leitura?.trim();
      const hanzi = [...s.texto].filter(ehHanzi).join('');
      if (!leitura || !hanzi) return;
      const leituras = this.leiturasDe(hanzi);
      if (leituras.length === 0) return;
      if (leituras.some((l) => leituraConfere(leitura, l, hanzi))) return;
      divergencias.push({
        indice,
        texto: s.texto,
        leitura_ia: leitura,
        leituras_dicionario: unicas(leituras.map((l) => pinyinComTons(l).replace(/\s+/g, '').toLowerCase())).slice(
          0,
          4,
        ),
      });
    });
    return divergencias;
  }
}

function unicas(lista: string[]): string[] {
  return [...new Set(lista)];
}

// ── O dicionário da instância ──────────────────────────────────────────────

export function caminhoDicionario(): string {
  return process.env.DAO_TALE_DICIONARIO ?? path.join(diretorioDados(), 'dicionarios.db');
}

let aberto: { dicionario: Dicionario; caminho: string; mtime: number } | null = null;
let fixado: Dicionario | null | undefined;

/**
 * O dicionário instalado, ou null. Reabre sozinho quando `npm run dicionarios`
 * troca o arquivo (a importação grava ao lado e renomeia por cima), para não
 * exigir reiniciar o servidor depois de atualizar.
 */
export function dicionarioAtual(): Dicionario | null {
  if (fixado !== undefined) return fixado;
  const caminho = caminhoDicionario();
  let mtime: number;
  try {
    mtime = fs.statSync(caminho).mtimeMs;
  } catch {
    if (aberto) {
      aberto.dicionario.fechar();
      aberto = null;
    }
    return null;
  }
  if (aberto && aberto.caminho === caminho && aberto.mtime === mtime) return aberto.dicionario;
  aberto?.dicionario.fechar();
  aberto = null;
  try {
    const db = new Database(caminho, { readonly: true, fileMustExist: true });
    aberto = { dicionario: new Dicionario(db), caminho, mtime };
    return aberto.dicionario;
  } catch (e) {
    console.error('[dicionário] não foi possível abrir', caminho, (e as Error).message);
    return null;
  }
}

/** Testes: fixa o dicionário (ou a ausência dele); `undefined` volta ao arquivo. */
export function fixarDicionario(d: Dicionario | null | undefined): void {
  fixado = d;
}
