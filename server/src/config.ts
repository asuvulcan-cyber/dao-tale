import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Diretório de dados do usuário, fora do repositório (doc 02 §4).
// DAO_TALE_DIR sobrepõe tudo (usado em desenvolvimento e testes).
export function diretorioDados(): string {
  const explicito = process.env.DAO_TALE_DIR;
  if (explicito) return garantir(explicito);
  if (process.platform === 'win32') {
    const base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return garantir(path.join(base, 'dao-tale'));
  }
  const base = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return garantir(path.join(base, 'dao-tale'));
}

function garantir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function caminhoBanco(): string {
  return process.env.DAO_TALE_BANCO ?? path.join(diretorioDados(), 'dao-tale.db');
}

export const PORTA = Number(process.env.DAO_TALE_PORTA ?? 8317);
export const HOST = '127.0.0.1';
export const PORTA_PADRAO = 8317;

/** Instância "real": sem redirecionamento de dados e na porta padrão. Quando
 *  false, a UI mostra a tarja de instância de teste (doc 10 §2) — o histórico de
 *  8317/8399/8412 já confundiu o usuário sobre qual instância estava rodando. */
export function ehInstanciaCanonica(): boolean {
  return !process.env.DAO_TALE_DIR && !process.env.DAO_TALE_BANCO && PORTA === PORTA_PADRAO;
}
