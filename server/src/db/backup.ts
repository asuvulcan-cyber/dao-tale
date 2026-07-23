import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { diretorioDados } from '../config.js';
import type { BancoDados } from './index.js';

// Backup e integridade do SQLite (doc 10 §1, achado C3 da auditoria). O valor é
// não perder trabalho já pago em cota: snapshots rotacionados, checkpoint do WAL
// e — o lado obrigatório — um caminho de RESTAURAÇÃO testado (backup que não
// restaura é teatro).

const MANTER_PADRAO = Number(process.env.DAO_TALE_BACKUPS_MANTER ?? 10);
const PREFIXO = 'dao-tale-';

export function caminhoBackups(dir: string = diretorioDados()): string {
  const d = path.join(dir, 'backups');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ISO sem os caracteres proibidos em nome de arquivo (: e .) — continua ordenável.
function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function nomeBackup(motivo: string): string {
  const m = motivo.replace(/[^a-z0-9-]/gi, '-') || 'backup';
  return `${PREFIXO}${carimbo()}-${m}.db`;
}

function backupsEm(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIXO) && f.endsWith('.db'))
    .sort(); // carimbo ISO no nome → ordem cronológica
}

/** Snapshot online (assíncrono), seguro com o banco em uso — inclui o WAL num
 *  arquivo `.db` autossuficiente. Uso: boot, antes de lote/import. */
export async function fazerBackup(
  db: BancoDados,
  motivo: string,
  opcoes: { dir?: string; manter?: number } = {},
): Promise<string> {
  const dir = opcoes.dir ?? caminhoBackups();
  const destino = path.join(dir, nomeBackup(motivo));
  await db.backup(destino);
  rotacionar(dir, opcoes.manter ?? MANTER_PADRAO);
  return destino;
}

/** Backup de conveniência para pontos de risco (lote/import): só roda em banco
 *  de arquivo — pula o ':memory:' dos testes, então enfiar isto num fluxo não
 *  escreve arquivo em teste. Assíncrono e à prova de falha (loga, não lança). */
export function backupSeArquivo(db: BancoDados, motivo: string): void {
  if (db.memory) return;
  fazerBackup(db, motivo)
    .then((caminho) => console.log(`[dao-tale] backup ${motivo}: ${caminho}`))
    .catch((e) => console.error(`[dao-tale] falha no backup ${motivo}:`, (e as Error).message));
}

/** Snapshot síncrono via `serialize()` — para o contexto síncrono de
 *  antes-de-migrar, onde não dá para aguardar uma Promise. */
export function fazerBackupSincrono(
  db: BancoDados,
  motivo: string,
  opcoes: { dir?: string; manter?: number } = {},
): string {
  const dir = opcoes.dir ?? caminhoBackups();
  const destino = path.join(dir, nomeBackup(motivo));
  fs.writeFileSync(destino, db.serialize());
  rotacionar(dir, opcoes.manter ?? MANTER_PADRAO);
  return destino;
}

/** Mantém os N backups mais novos (por nome, que é cronológico), apaga o resto. */
export function rotacionar(dir: string, manter: number = MANTER_PADRAO): void {
  if (manter <= 0) return;
  const arquivos = backupsEm(dir);
  for (const f of arquivos.slice(0, Math.max(0, arquivos.length - manter))) {
    fs.rmSync(path.join(dir, f), { force: true });
  }
}

/** Dobra o WAL no `.db` — depois disto, copiar só o `.db` é seguro. */
export function checkpointWal(db: BancoDados): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
}

/** `'ok'` ou a descrição do primeiro dano encontrado. */
export function verificarIntegridade(db: BancoDados): string {
  return db.pragma('integrity_check', { simple: true }) as string;
}

export interface InfoBackup {
  nome: string;
  caminho: string;
  tamanho: number;
  em: string;
}

/** Backups existentes, do mais novo para o mais antigo. */
export function listarBackups(dir: string = caminhoBackups()): InfoBackup[] {
  return backupsEm(dir)
    .reverse()
    .map((nome) => {
      const caminho = path.join(dir, nome);
      const st = fs.statSync(caminho);
      return { nome, caminho, tamanho: st.size, em: st.mtime.toISOString() };
    });
}

export interface ResultadoRestauracao {
  ok: boolean;
  mensagem: string;
  copiaSeguranca?: string;
}

/** Restaura `caminhoBackup` sobre `caminhoDestino`. Deve rodar com o app
 *  FECHADO. Verifica o backup ANTES de tocar no destino, preserva o banco atual
 *  (com seu WAL/SHM) numa cópia `.pre-restauracao-*`, e reverifica o resultado. */
export function restaurarDe(caminhoBackup: string, caminhoDestino: string): ResultadoRestauracao {
  if (!fs.existsSync(caminhoBackup)) {
    return { ok: false, mensagem: `Backup não encontrado: ${caminhoBackup}` };
  }

  // 1. Integridade do backup antes de sobrescrever nada. Abrir/ler um arquivo
  //    que não é banco lança ("file is not a database") — trata como corrompido.
  let integridade: string;
  try {
    const origem = new Database(caminhoBackup, { readonly: true });
    try {
      integridade = origem.pragma('integrity_check', { simple: true }) as string;
    } finally {
      origem.close();
    }
  } catch (e) {
    return { ok: false, mensagem: `Backup ilegível (${(e as Error).message}); restauração abortada.` };
  }
  if (integridade !== 'ok') {
    return { ok: false, mensagem: `Backup corrompido (integrity_check: ${integridade}); restauração abortada.` };
  }

  // 2. Preserva o banco atual inteiro (db + WAL + SHM) antes de trocar.
  let copiaSeguranca: string | undefined;
  if (fs.existsSync(caminhoDestino)) {
    copiaSeguranca = `${caminhoDestino}.pre-restauracao-${carimbo()}`;
    fs.copyFileSync(caminhoDestino, copiaSeguranca);
    for (const sufixo of ['-wal', '-shm']) {
      if (fs.existsSync(caminhoDestino + sufixo)) fs.copyFileSync(caminhoDestino + sufixo, copiaSeguranca + sufixo);
    }
  }

  // 3. Substitui e apaga o WAL/SHM órfãos do banco antigo.
  fs.copyFileSync(caminhoBackup, caminhoDestino);
  for (const sufixo of ['-wal', '-shm']) fs.rmSync(caminhoDestino + sufixo, { force: true });

  // 4. Reverifica o banco restaurado.
  const restaurado = new Database(caminhoDestino);
  let final: string;
  try {
    final = restaurado.pragma('integrity_check', { simple: true }) as string;
  } finally {
    restaurado.close();
  }
  if (final !== 'ok') {
    return { ok: false, mensagem: `Restaurado, mas integrity_check falhou: ${final}`, copiaSeguranca };
  }
  return { ok: true, mensagem: 'Restauração concluída e verificada.', copiaSeguranca };
}
