import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caminhoBanco } from '../config.js';

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
  return db;
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
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    const sql = fs.readFileSync(path.join(dirMigrations, arquivo), 'utf-8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migracoes (nome, aplicada_em) VALUES (?, ?)').run(
        arquivo,
        new Date().toISOString(),
      );
    })();
  }
}

/** Somente para testes: fecha e descarta a instância global. */
export function fecharBanco(): void {
  instancia?.close();
  instancia = null;
}
