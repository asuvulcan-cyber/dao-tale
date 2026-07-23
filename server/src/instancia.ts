import fs from 'node:fs';
import path from 'node:path';
import { diretorioDados } from './config.js';

// Instância única POR pasta de dados (doc 10 §2). Dois processos abrindo o mesmo
// .db gastariam cota em dobro e corromperiam o estado de job/lote (que vive em
// memória). O lock é por pasta: a obra real e uma instância descartável
// (DAO_TALE_DIR diferente) podem coexistir; a MESMA pasta duas vezes, não.

export interface Lock {
  pid: number;
  porta: number;
  iniciado_em: string;
}

export function caminhoLock(dir: string = diretorioDados()): string {
  return path.join(dir, 'dao-tale.lock');
}

export function lerLock(arquivo: string = caminhoLock()): Lock | null {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
    if (dados && typeof dados.pid === 'number' && typeof dados.porta === 'number') return dados as Lock;
  } catch {
    /* ausente ou corrompido → sem lock válido */
  }
  return null;
}

/** true se um processo com esse pid existe (inclui o caso EPERM: existe, mas
 *  sem permissão de sinalizar). */
export function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export type ResultadoLock = { ok: true; liberar: () => void } | { ok: false; dono: Lock; arquivo: string };

/** Adquire o lock desta pasta. Recusa se outro processo VIVO já o detém;
 *  sobrescreve um lock órfão (dono morto). */
export function adquirirLock(porta: number, dir: string = diretorioDados()): ResultadoLock {
  const arquivo = caminhoLock(dir);
  const existente = lerLock(arquivo);
  if (existente && existente.pid !== process.pid && processoVivo(existente.pid)) {
    return { ok: false, dono: existente, arquivo };
  }
  const lock: Lock = { pid: process.pid, porta, iniciado_em: new Date().toISOString() };
  fs.writeFileSync(arquivo, JSON.stringify(lock, null, 2));

  let liberado = false;
  const liberar = () => {
    if (liberado) return;
    liberado = true;
    // Só remove se o lock ainda é nosso (não pisar num lock que outro reescreveu).
    const atual = lerLock(arquivo);
    if (atual && atual.pid === process.pid) fs.rmSync(arquivo, { force: true });
  };
  return { ok: true, liberar };
}
