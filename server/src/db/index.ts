import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caminhoBanco } from '../config.js';
import {
  NUCLEO_ENXUTO,
  PROMPT_PADRAO_INICIAL,
  VERSAO_PROMPT_PADRAO_INICIAL,
  extrairCamadas,
} from './promptPadraoInicial.js';
import { reposLotes } from './repos.js';
import { sanearConfiguracoes } from './configuracoes.js';
import { unificarRotulosDeRegra } from './rotulosRegra.js';
import { fazerBackupSincrono } from './backup.js';

export type BancoDados = Database.Database;

/** Gancho chamado com a lista de migrações pendentes, ANTES de aplicá-las
 *  (doc 10 §1) — a produção usa isso para um snapshot pré-migração. Só ligado
 *  por `banco()`; os testes chamam `abrirBanco` sem ele e não escrevem arquivos. */
export type AntesDeMigrar = (db: BancoDados, pendentes: string[]) => void;

const dirMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

let instancia: BancoDados | null = null;

/** Abre (ou devolve) o banco da aplicação, com migrações aplicadas. */
export function banco(): BancoDados {
  if (!instancia) instancia = abrirBanco(caminhoBanco(), { antesDeMigrar: backupPreMigracao });
  return instancia;
}

// Snapshot síncrono do estado exato de antes da migração (protege contra uma
// migração ruim, que um backup pós-migração não pegaria). Só para banco de
// arquivo; nunca derruba o boot se falhar.
function backupPreMigracao(db: BancoDados, pendentes: string[]): void {
  if (db.memory) return;
  try {
    const destino = fazerBackupSincrono(db, 'pre-migracao');
    console.log(`[dao-tale] backup pré-migração (${pendentes.length} pendente(s)): ${destino}`);
  } catch (e) {
    console.error('[dao-tale] falha no backup pré-migração:', (e as Error).message);
  }
}

/** Abre um banco em qualquer caminho (':memory:' nos testes) e aplica as migrações. */
export function abrirBanco(caminho: string, opcoes: { antesDeMigrar?: AntesDeMigrar } = {}): BancoDados {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrar(db, opcoes.antesDeMigrar);
  semearPromptPadrao(db);
  migrarPadraoParaNucleo(db);
  semearNucleoEnxuto(db);
  corrigirNucleoEnxutoSemeado(db);
  // Config gravada quando as faixas eram outras (ex.: tamanho_bloco 400, de antes
  // do teto de 120 da A1) volta para dentro do aceito hoje — senão a tela de
  // Configurações reenvia o valor velho e o salvar inteiro morre em 400.
  for (const ajuste of sanearConfiguracoes(db)) {
    console.log(
      `[dao-tale] configuração "${ajuste.chave}" estava fora da faixa aceita hoje: ${ajuste.de} → ${ajuste.para}.`,
    );
  }
  // Rótulos de regra equivalentes viram um só (ver rotulosRegra.ts).
  const unificados = unificarRotulosDeRegra(db);
  if (unificados > 0) {
    console.log(`[dao-tale] ${unificados} caso(s) do banco de testes tiveram o rótulo de regra unificado.`);
  }
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

// Doc 08 §12 — o núcleo enxuto entra como versão NOVA e SEMPRE INATIVA, nunca por
// cima do que está ativo. As duas medições (§12.5 e §12.6, modelos diferentes)
// deram empate de qualidade com ~−14% de tokens de entrada, e por isso ele foi
// ativado na instância real — mas ativar continua sendo um clique do usuário, não
// efeito colateral de abrir o aplicativo: trocar o prompt ativo debaixo de quem
// está traduzindo é exatamente o que a imutabilidade das versões existe para
// impedir. Guardado por flag, como a migração para camadas.
function semearNucleoEnxuto(db: BancoDados): void {
  const flag = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nucleo_enxuto_semeado'").get();
  if (flag) return;
  db.transaction(() => {
    db.prepare('INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES (?, ?, ?, 0)').run(
      proximaVersaoNucleo(db),
      NUCLEO_ENXUTO,
      'Núcleo enxuto, INATIVO: só o universal zh→pt-BR, com diálogo, pensamento, notas, onomatopeia e registro movidos para as preferências de estilo da obra (Seção 5). Compare com o núcleo em uso pelo comparador antes de ativar.',
    );
    db.prepare(
      "INSERT INTO configuracoes (chave, valor) VALUES ('nucleo_enxuto_semeado', '1') ON CONFLICT (chave) DO UPDATE SET valor = '1'",
    ).run();
  })();
}

// Conserto da regra do lugar da cena (doc 08 §12.5): no núcleo antigo ela era um
// PASSO com pergunta, no enxuto virou afirmação solta — e a medição real mostrou
// o enxuto errando 2 de 2 justamente ali, apesar de ter a regra. Versão de prompt
// é imutável por princípio, mas a linha semeada com o defeito só existe em cópias
// que ainda NÃO ativaram o enxuto: enquanto ele está inativo e nada o referencia,
// é rascunho distribuído pelo aplicativo, não histórico de tradução. As três
// condições do WHERE garantem exatamente isso; uma cópia que já ativou (ou que o
// usuário editou) fica intocada e o conserto some com a flag.
function corrigirNucleoEnxutoSemeado(db: BancoDados): void {
  const flag = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'nucleo_enxuto_lugar_da_cena'").get();
  if (flag) return;
  db.transaction(() => {
    db.prepare(
      `UPDATE prompt_padrao SET conteudo = ?
        WHERE ativo = 0
          AND notas_versao LIKE 'Núcleo enxuto%'
          AND id NOT IN (SELECT nucleo_id FROM capitulos WHERE nucleo_id IS NOT NULL)
          AND id NOT IN (SELECT nucleo_id FROM prompts WHERE nucleo_id IS NOT NULL)`,
    ).run(NUCLEO_ENXUTO);
    db.prepare(
      "INSERT INTO configuracoes (chave, valor) VALUES ('nucleo_enxuto_lugar_da_cena', '1') ON CONFLICT (chave) DO UPDATE SET valor = '1'",
    ).run();
  })();
}

// `prompt_padrao.versao` é UNIQUE: pegar o próximo inteiro acima do maior evita
// colidir com uma versão que o usuário tenha criado à mão.
function proximaVersaoNucleo(db: BancoDados): string {
  const versoes = (db.prepare('SELECT versao FROM prompt_padrao').all() as { versao: string }[]).map((v) => v.versao);
  const maior = Math.max(0, ...versoes.map((v) => parseFloat(v)).filter((n) => !Number.isNaN(n)));
  let candidato = Math.floor(maior) + 1;
  while (versoes.includes(`${candidato}.0`)) candidato += 1;
  return `${candidato}.0`;
}

function migrar(db: BancoDados, antesDeMigrar?: AntesDeMigrar): void {
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

  // Snapshot do estado de antes da migração, se pedido (doc 10 §1).
  antesDeMigrar?.(db, pendentes);

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
