import Database from 'better-sqlite3';
import fs from 'node:fs';
import { caminhoBanco } from '../src/config.js';

// Leitura do que foi MEDIDO (eventos_ia) para os scripts de medição conferirem
// as próprias estimativas — doc 11 §6.
//
// SOMENTE LEITURA, e de propósito: o banco é aberto com `readonly: true` e sem
// passar por `abrirBanco`, então nenhum script de medição aplica migração,
// marca lote interrompido ou escreve um byte na obra real. Respeita
// DAO_TALE_DIR / DAO_TALE_BANCO como o resto do aplicativo.

export interface MedidoPorPapel {
  papel: string;
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_cache_leitura: number;
  tokens_cache_criacao: number;
  custo_usd: number | null;
  chamadas_sem_preco: number;
}

export function abrirSomenteLeitura(): Database.Database | null {
  const caminho = caminhoBanco();
  if (!fs.existsSync(caminho)) {
    console.log(`\n(--real: nenhum banco em ${caminho} — nada medido para conferir.)`);
    return null;
  }
  const db = new Database(caminho, { readonly: true, fileMustExist: true });
  const tem = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'eventos_ia'")
    .get();
  if (!tem) {
    console.log('\n(--real: este banco ainda não tem a tabela eventos_ia — abra o aplicativo uma vez para migrar.)');
    db.close();
    return null;
  }
  return db;
}

const SOMA = `
  papel,
  COUNT(*)                                               AS chamadas,
  COALESCE(SUM(tokens_entrada), 0)                        AS tokens_entrada,
  COALESCE(SUM(tokens_saida), 0)                          AS tokens_saida,
  COALESCE(SUM(tokens_cache_leitura), 0)                  AS tokens_cache_leitura,
  COALESCE(SUM(tokens_cache_criacao), 0)                  AS tokens_cache_criacao,
  SUM(custo_estimado)                                     AS custo_usd,
  SUM(CASE WHEN custo_estimado IS NULL THEN 1 ELSE 0 END) AS chamadas_sem_preco`;

/** Medido por papel, opcionalmente restrito a um capítulo (por número). */
export function medidoPorPapel(db: Database.Database, numeroCapitulo?: number): MedidoPorPapel[] {
  if (numeroCapitulo === undefined) {
    return db.prepare(`SELECT ${SOMA} FROM eventos_ia GROUP BY papel ORDER BY chamadas DESC`).all() as MedidoPorPapel[];
  }
  // Capítulo pelo número; se mais de uma obra usa o mesmo número, vence o que
  // tem chamadas registradas.
  const cap = db
    .prepare(
      `SELECT c.id FROM capitulos c
        WHERE c.numero = ?
        ORDER BY (SELECT COUNT(*) FROM eventos_ia e WHERE e.capitulo_id = c.id) DESC
        LIMIT 1`,
    )
    .get(numeroCapitulo) as { id: number } | undefined;
  if (!cap) return [];
  return db
    .prepare(`SELECT ${SOMA} FROM eventos_ia WHERE capitulo_id = ? GROUP BY papel ORDER BY chamadas DESC`)
    .all(cap.id) as MedidoPorPapel[];
}

/** Entrada total (paga + cache) e o que veio do cache — a checagem da pergunta
 * (a) do doc 11 nos números que os scripts estimam. */
export function acertoDeCache(linha: MedidoPorPapel): number | null {
  const total = linha.tokens_entrada + linha.tokens_cache_leitura + linha.tokens_cache_criacao;
  return total > 0 ? (linha.tokens_cache_leitura / total) * 100 : null;
}

export function formatarUsd(valor: number | null, semPreco: number): string {
  if (valor === null || (valor === 0 && semPreco > 0)) return 'sem preço cadastrado';
  const texto = valor < 0.01 ? `US$ ${valor.toFixed(5)}` : `US$ ${valor.toFixed(2)}`;
  return semPreco > 0 ? `${texto} (+${semPreco} sem preço)` : texto;
}
