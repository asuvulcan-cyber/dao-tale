import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caminhoBanco } from '../config.js';
import { PROMPT_PADRAO_INICIAL, VERSAO_PROMPT_PADRAO_INICIAL, extrairCamadas } from './promptPadraoInicial.js';
import { reposLotes } from './repos.js';

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
  migrarPadraoParaNucleo(db);
  // Lotes de uma sessão anterior não sobrevivem ao processo (doc 09 §5).
  reposLotes.marcarInterrompidosNoBoot(db);
  return db;
}

// Banco sem nenhuma versão de prompt padrão (recém-criado ou migrado) recebe o
// núcleo genérico inicial já ativo — versões seguintes são criadas pela UI.
function semearPromptPadrao(db: BancoDados): void {
  const { n } = db.prepare('SELECT COUNT(*) n FROM prompt_padrao').get() as { n: number };
  if (n > 0) return;
  db.prepare('INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES (?, ?, ?, 1)').run(
    VERSAO_PROMPT_PADRAO_INICIAL,
    PROMPT_PADRAO_INICIAL,
    'Núcleo genérico inicial distribuído com o aplicativo.',
  );
}

// Banco anterior às camadas (doc 08): o padrão ativo ainda carrega a Seção 6.
// Cria uma versão-núcleo (Seção 6 → marcador) e a ativa, preservando as
// versões antigas no histórico. Roda uma única vez, guardado por flag —
// assim um padrão futuro que o usuário crie COM Seção 6 não é reprocessado.
function migrarPadraoParaNucleo(db: BancoDados): void {
  const flag = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nucleo_migrado'").get();
  if (flag) return;
  const ativo = db.prepare('SELECT * FROM prompt_padrao WHERE ativo = 1').get() as
    | { id: number; versao: string; conteudo: string }
    | undefined;
  const camadas = ativo ? extrairCamadas(ativo.conteudo) : null;
  if (ativo && camadas) {
    const versoes = db.prepare('SELECT versao FROM prompt_padrao').all() as { versao: string }[];
    const maior = Math.max(0, ...versoes.map((v) => parseFloat(v.versao)).filter((n) => !Number.isNaN(n)));
    db.transaction(() => {
      db.prepare('UPDATE prompt_padrao SET ativo = 0').run();
      db.prepare('INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES (?, ?, ?, 1)').run(
        `${Math.floor(maior) + 1}.0`,
        camadas.nucleo,
        `Núcleo universal derivado da v${ativo.versao}: a Seção 6 saiu do padrão e passa a viver no delta de cada obra.`,
      );
    })();
  }
  db.prepare(
    "INSERT INTO configuracoes (chave, valor) VALUES ('nucleo_migrado', '1') ON CONFLICT (chave) DO UPDATE SET valor = '1'",
  ).run();
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
