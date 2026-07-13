import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caminhoBanco } from '../config.js';
import { PROMPT_PADRAO_INICIAL, VERSAO_PROMPT_PADRAO_INICIAL } from './promptPadraoInicial.js';

export type BancoDados = Database.Database;

const dirMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

let instancia: BancoDados | null = null;

/** Abre (ou devolve) o banco da aplicação, com migrações aplicadas. */
export function banco(): BancoDados {
  if (!instancia) instancia = abrirBanco(caminhoBanco());
  return instancia;
}

/** Abre um banco em qualquer caminho (':memory:' nos testes) e aplica as migrações. */
export function abrirBanco(caminho: string): BancoDados {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrar(db);
  semearPromptPadrao(db);
  return db;
}

// Banco sem nenhuma versão de prompt padrão (recém-criado ou migrado) recebe a
// versão genérica inicial já ativa — versões seguintes são criadas pela UI.
function semearPromptPadrao(db: BancoDados): void {
  const { n } = db.prepare('SELECT COUNT(*) n FROM prompt_padrao').get() as { n: number };
  if (n > 0) return;
  db.prepare('INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES (?, ?, ?, 1)').run(
    VERSAO_PROMPT_PADRAO_INICIAL,
    PROMPT_PADRAO_INICIAL,
    'Versão genérica inicial distribuída com o aplicativo.',
  );
}

function migrar(db: BancoDados): void {
  db.exec('CREATE TABLE IF NOT EXISTS migracoes (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)');
  const aplicadas = new Set(
    (db.prepare('SELECT nome FROM migracoes').all() as { nome: string }[]).map((m) => m.nome),
  );
  const arquivos = fs
    .readdirSync(dirMigrations)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const pendentes = arquivos.filter((a) => !aplicadas.has(a));
  if (pendentes.length === 0) return;

  // FKs desligadas durante migrações (padrão SQLite para recriar tabelas sem
  // disparar cascatas); a integridade é conferida ao final com foreign_key_check.
  db.pragma('foreign_keys = OFF');
  try {
    for (const arquivo of pendentes) {
      const sql = fs.readFileSync(path.join(dirMigrations, arquivo), 'utf-8');
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO migracoes (nome, aplicada_em) VALUES (?, ?)').run(
          arquivo,
          new Date().toISOString(),
        );
      })();
    }
    const quebradas = db.pragma('foreign_key_check') as unknown[];
    if (quebradas.length > 0) {
      throw new Error(`Migração deixou ${quebradas.length} referência(s) quebrada(s): ${JSON.stringify(quebradas[0])}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/** Somente para testes: fecha e descarta a instância global. */
export function fecharBanco(): void {
  instancia?.close();
  instancia = null;
}
