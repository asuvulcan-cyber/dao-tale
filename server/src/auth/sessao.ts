import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { diretorioDados } from '../config.js';

// Sessão do usuário único (doc 13 §3): token assinado, sem tabela.
//
// Stateless de propósito. Uma tabela de sessões daria "derrubar este aparelho",
// que para um usuário só não vale nada; em troca, reiniciar o serviço (deploy,
// reboot do VPS) deslogaria o celular toda vez. A revogação que importa —
// "trocar a senha derruba tudo" — vem da `geracao` assinada dentro do token.

export const NOME_COOKIE = 'dao_tale_sessao';
export const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;
/** Abaixo disto, a resposta traz um cookie novo (renovação deslizante). */
export const RENOVAR_ABAIXO_DE_MS = 15 * 24 * 60 * 60 * 1000;

const VERSAO = 'v1';

export function caminhoSegredo(dir: string = diretorioDados()): string {
  return path.join(dir, 'sessao.chave');
}

const cache = new Map<string, Buffer>();

/** Segredo de assinatura: `DAO_TALE_SESSAO_SEGREDO` se houver, senão um arquivo
 *  0600 no diretório de dados, gerado na primeira subida. Nunca no repositório. */
export function segredoSessao(dir: string = diretorioDados()): Buffer {
  const doAmbiente = process.env.DAO_TALE_SESSAO_SEGREDO;
  if (doAmbiente) return Buffer.from(doAmbiente, 'utf-8');

  const arquivo = caminhoSegredo(dir);
  const emCache = cache.get(arquivo);
  if (emCache) return emCache;

  let segredo: Buffer;
  try {
    segredo = Buffer.from(fs.readFileSync(arquivo, 'utf-8').trim(), 'base64');
    if (segredo.length < 32) throw new Error('curto');
  } catch {
    segredo = crypto.randomBytes(32);
    fs.writeFileSync(arquivo, segredo.toString('base64'), { mode: 0o600 });
    fs.chmodSync(arquivo, 0o600);
  }
  cache.set(arquivo, segredo);
  return segredo;
}

/** Só para teste: esquece o segredo memorizado (pastas diferentes por caso). */
export function limparCacheSegredo(): void {
  cache.clear();
}

function assinar(carga: string, segredo: Buffer): string {
  return crypto.createHmac('sha256', segredo).update(carga).digest('base64url');
}

export function emitirToken(geracao: number, segredo: Buffer, agora: number = Date.now()): string {
  const carga = `${VERSAO}.${geracao}.${agora + DURACAO_MS}`;
  return `${carga}.${assinar(carga, segredo)}`;
}

export type ResultadoToken =
  | { ok: true; geracao: number; expira_em: number }
  | { ok: false; motivo: 'formato' | 'assinatura' | 'expirado' | 'revogado' };

export function verificarToken(
  token: string,
  geracaoAtual: number,
  segredo: Buffer,
  agora: number = Date.now(),
): ResultadoToken {
  const partes = token.split('.');
  if (partes.length !== 4 || partes[0] !== VERSAO) return { ok: false, motivo: 'formato' };
  const [, geracaoTxt, expiraTxt, assinatura] = partes;
  const geracao = Number(geracaoTxt);
  const expira = Number(expiraTxt);
  if (!Number.isInteger(geracao) || !Number.isInteger(expira)) return { ok: false, motivo: 'formato' };

  const esperada = Buffer.from(assinar(`${VERSAO}.${geracaoTxt}.${expiraTxt}`, segredo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) {
    return { ok: false, motivo: 'assinatura' };
  }
  if (agora >= expira) return { ok: false, motivo: 'expirado' };
  // geracaoAtual = 0 significa "sem senha definida": nenhum token vale.
  if (geracaoAtual === 0 || geracao !== geracaoAtual) return { ok: false, motivo: 'revogado' };
  return { ok: true, geracao, expira_em: expira };
}

/** Cookie de sessão. `Secure` sempre: o modo hospedado exige TLS (doc 13 §4) e
 *  não existe caminho em claro para relaxar. `Lax` deixa o link aberto de outro
 *  app do celular já chegar logado; contra CSRF quem responde é a checagem de
 *  Origin nos métodos mutantes. */
export function cookieSessao(token: string, duracaoMs: number = DURACAO_MS): string {
  const maxAge = Math.floor(duracaoMs / 1000);
  return `${NOME_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function cookieLimpo(): string {
  return `${NOME_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function lerCookie(cabecalho: string | undefined, nome: string = NOME_COOKIE): string | null {
  if (!cabecalho) return null;
  for (const par of cabecalho.split(';')) {
    const igual = par.indexOf('=');
    if (igual < 0) continue;
    if (par.slice(0, igual).trim() === nome) return par.slice(igual + 1).trim();
  }
  return null;
}
