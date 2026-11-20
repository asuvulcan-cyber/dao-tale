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

// ── Modo de operação (doc 13 §2) ────────────────────────────────────────────
// `local` (padrão) = a máquina é do usuário, loopback é confiança suficiente —
// exatamente o comportamento de sempre. `hospedado` = atrás de um domínio, onde
// quem autentica é a sessão, não o endereço. Funções (não constantes) porque os
// testes trocam o ambiente entre casos.

export type ModoOperacao = 'local' | 'hospedado';

export function modoOperacao(): ModoOperacao {
  return process.env.DAO_TALE_MODO === 'hospedado' ? 'hospedado' : 'local';
}

export function ehHospedado(): boolean {
  return modoOperacao() === 'hospedado';
}

/** Hostnames públicos aceitos em modo hospedado (`DAO_TALE_HOST_PUBLICO`, lista
 *  separada por vírgula). Aceita URL colada ("https://tale.exemplo.com/") e
 *  host com porta — guarda só o hostname, minúsculo. */
export function hostsPublicos(): string[] {
  return (process.env.DAO_TALE_HOST_PUBLICO ?? '')
    .split(',')
    .map((bruto) => hostnameDe(bruto.trim()))
    .filter((h): h is string => !!h);
}

function hostnameDe(valor: string): string | null {
  if (!valor) return null;
  const comEsquema = /^[a-z]+:\/\//i.test(valor) ? valor : `http://${valor}`;
  try {
    const h = new URL(comEsquema).hostname.toLowerCase();
    return h || null;
  } catch {
    return null;
  }
}

/** Endereço de escuta. O padrão é loopback nos dois modos: hospedado, quem fala
 *  com a internet é o proxy TLS (doc 13 §4). `DAO_TALE_BIND` existe só para o
 *  caso de o proxy estar em outro container. */
export function enderecoBind(): string {
  return process.env.DAO_TALE_BIND ?? HOST;
}

/** Instância "real": sem redirecionamento de dados e na porta padrão. Quando
 *  false, a UI mostra a tarja de instância de teste (doc 10 §2) — o histórico de
 *  8317/8399/8412 já confundiu o usuário sobre qual instância estava rodando.
 *  Em modo hospedado a pasta do serviço (`/var/lib/dao-tale`) É a real, então a
 *  tarja não faz sentido — senão ficaria acesa para sempre no VPS. */
export function ehInstanciaCanonica(): boolean {
  if (ehHospedado()) return true;
  return !process.env.DAO_TALE_DIR && !process.env.DAO_TALE_BANCO && PORTA === PORTA_PADRAO;
}

// ── Motor Claude Code (provedor `claude-code`) ──────────────────────────────
// O app pode ser aberto pelo atalho da área de trabalho, que não lê o .bashrc:
// por isso os padrões abaixo não dependem de variável de ambiente nem de PATH.

/** Pasta de configuração do Claude Code que o motor usa — é ela que decide QUAL
 *  conta atende as chamadas. `DAO_TALE_CLAUDE_CONFIG_DIR` sobrepõe; sem ela,
 *  vale `~/.claude-conta2` (a conta separada para o motor, a mesma do alias
 *  `claude2`) quando existir, e senão `null` = o padrão do próprio Claude Code. */
export function pastaContaClaudeCode(): string | null {
  const explicita = process.env.DAO_TALE_CLAUDE_CONFIG_DIR;
  if (explicita) return explicita;
  const conta2 = path.join(os.homedir(), '.claude-conta2');
  return fs.existsSync(conta2) ? conta2 : null;
}

/** Executável do Claude Code. O instalador oficial põe em `~/.local/bin`, que
 *  nem toda sessão gráfica tem no PATH. */
export function executavelClaudeCode(): string {
  const explicito = process.env.DAO_TALE_CLAUDE_BIN;
  if (explicito) return explicito;
  const local = path.join(os.homedir(), '.local', 'bin', 'claude');
  return fs.existsSync(local) ? local : 'claude';
}
